import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toIsoDate } from "@/convex/lib/dates";
import {
  categoryValidator,
  conditionValidator,
  loanFilterValidator,
  loanSortValidator,
  TOOL_ICONS,
  toolSortValidator,
} from "@/convex/lib/validators";
import { errorMessage } from "@/lib/errors";
import { convexAsUser } from "./convex-as-user";

// The tools Claude can use. Each one is a thin wrapper around an existing
// Convex function, called *as the signed-in user*, so permissions, validation
// and the loan state machine are exactly the same as in the web app.

const values = <T extends string>(validator: { members: { value: T }[] }) =>
  validator.members.map((member) => member.value) as [T, ...T[]];

const category = z.enum(values(categoryValidator));
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Date as YYYY-MM-DD");
const page = {
  cursor: z.string().optional().describe("nextCursor from the previous page, to continue"),
  limit: z.number().int().min(1).max(25).optional().describe("Items per page (default 10)"),
};
const loanList = z.object({
  filter: z.enum(values(loanFilterValidator)).optional().describe("Status, or overdue"),
  search: z.string().max(100).optional().describe("Matches tool name and first names"),
  sort: z.enum(values(loanSortValidator)).optional(),
  ...page,
});
const loanId = z.object({ loanId: z.string().describe("Loan id from a list tool") });

type Paginated<T> = { page: T[]; isDone: boolean; continueCursor: string };

function pageOpts({ cursor, limit }: { cursor?: string; limit?: number }) {
  return { paginationOpts: { cursor: cursor ?? null, numItems: limit ?? 10 }, today: today() };
}

function pageResult<T>(result: Paginated<T>, map: (item: T) => unknown = (item) => item) {
  return {
    items: result.page.map(map),
    nextCursor: result.isDone ? null : result.continueCursor,
  };
}

// The automation history is for the web UI; Claude gets the loan itself.
function loanSummary<T extends { activity: unknown }>(loan: T): Omit<T, "activity"> {
  const { activity, ...rest } = loan;
  void activity;
  return rest;
}

const today = () => toIsoDate(Date.now());

const text = (value: unknown, isError = false): CallToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
  isError,
});

/**
 * Runs one tool call as the signed-in user: rate limit + audit row (in Convex),
 * then the call. Errors reach Claude only as user-safe messages.
 */
async function run(
  ctx: ServerContext,
  tool: string,
  call: (convex: ConvexHttpClient) => Promise<unknown>,
): Promise<CallToolResult> {
  const userId = ctx.http?.authInfo?.extra?.userId;
  if (typeof userId !== "string") return text("Not signed in.", true);

  const convex = convexAsUser(userId);
  let callId: Id<"mcpAuditLog">;
  try {
    callId = await convex.mutation(api.mcp.startCall, { tool });
  } catch (error) {
    return text(errorMessage(error), true);
  }

  const started = Date.now();
  let output: unknown;
  let failure: string | undefined;
  try {
    output = await call(convex);
  } catch (error) {
    failure = errorMessage(error);
  }
  await convex
    .mutation(api.mcp.finishCall, {
      callId,
      ok: failure === undefined,
      error: failure,
      durationMs: Date.now() - started,
    })
    .catch((error) => console.error("mcp finishCall failed", error));
  return failure === undefined ? text(output) : text(failure, true);
}

export function registerTools(server: McpServer) {
  // ── Read ────────────────────────────────────────────────────────────────

  server.registerTool(
    "search_tools",
    {
      description:
        "Browse tools neighbours have listed, with each tool's availability. Optional search, category and sort.",
      inputSchema: z.object({
        search: z.string().max(100).optional(),
        category: category.optional(),
        sort: z.enum(values(toolSortValidator)).optional(),
        ...page,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ search, category, sort, ...rest }, ctx) =>
      run(ctx, "search_tools", async (convex) =>
        pageResult(
          await convex.query(api.tools.list, { ...pageOpts(rest), search, category, sort }),
        ),
      ),
  );

  server.registerTool(
    "list_my_listings",
    {
      description: "The tools I have listed for lending.",
      inputSchema: z.object({
        search: z.string().max(100).optional(),
        sort: z.enum(values(toolSortValidator)).optional(),
        ...page,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ search, sort, ...rest }, ctx) =>
      run(ctx, "list_my_listings", async (convex) =>
        pageResult(await convex.query(api.tools.mine, { ...pageOpts(rest), search, sort })),
      ),
  );

  server.registerTool(
    "list_my_requests",
    {
      description: "Loans I asked for (I am the borrower), with their status.",
      inputSchema: loanList,
      annotations: { readOnlyHint: true },
    },
    ({ filter, search, sort, ...rest }, ctx) =>
      run(ctx, "list_my_requests", async (convex) =>
        pageResult(
          await convex.query(api.loans.mine, { ...pageOpts(rest), filter, search, sort }),
          loanSummary,
        ),
      ),
  );

  server.registerTool(
    "list_incoming_requests",
    {
      description: "Requests to borrow my tools (I am the lender), with their status.",
      inputSchema: loanList,
      annotations: { readOnlyHint: true },
    },
    ({ filter, search, sort, ...rest }, ctx) =>
      run(ctx, "list_incoming_requests", async (convex) =>
        pageResult(
          await convex.query(api.loans.incoming, { ...pageOpts(rest), filter, search, sort }),
          loanSummary,
        ),
      ),
  );

  // ── Write ───────────────────────────────────────────────────────────────

  server.registerTool(
    "create_listing",
    {
      description: "List one of my tools so neighbours can borrow it.",
      inputSchema: z.object({
        name: z.string().max(60),
        category,
        condition: z.enum(values(conditionValidator)),
        description: z.string().max(500),
        icon: z.enum(TOOL_ICONS).optional().describe("Omit to use the category's icon"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args, ctx) =>
      run(ctx, "create_listing", async (convex) => ({
        toolId: await convex.mutation(api.tools.create, args),
      })),
  );

  server.registerTool(
    "request_borrow",
    {
      description:
        "Ask to borrow a neighbour's tool for a date range (inclusive, at most 30 days). The lender then approves or declines.",
      inputSchema: z.object({
        toolId: z.string().describe("Tool id from search_tools"),
        startDate: isoDate,
        endDate: isoDate,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ toolId, startDate, endDate }, ctx) =>
      run(ctx, "request_borrow", async (convex) => ({
        loanId: await convex.mutation(api.loans.request, {
          toolId: toolId as Id<"tools">,
          startDate,
          endDate,
        }),
        status: "pending",
      })),
  );

  server.registerTool(
    "cancel_request",
    {
      description: "Cancel one of my pending borrow requests.",
      inputSchema: loanId,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ loanId }, ctx) =>
      run(ctx, "cancel_request", async (convex) => {
        await convex.mutation(api.loans.cancel, { loanId: loanId as Id<"loans"> });
        return { loanId, status: "cancelled" };
      }),
  );

  server.registerTool(
    "respond_to_request",
    {
      description: "Approve or decline a pending request to borrow one of my tools.",
      inputSchema: loanId.extend({ decision: z.enum(["approve", "decline"]) }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ loanId, decision }, ctx) =>
      run(ctx, "respond_to_request", async (convex) => {
        await convex.mutation(api.loans.respond, { loanId: loanId as Id<"loans">, decision });
        return { loanId, status: decision === "approve" ? "approved" : "declined" };
      }),
  );

  server.registerTool(
    "mark_returned",
    {
      description: "Confirm that a borrower gave my tool back (approved loans only).",
      inputSchema: loanId,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ loanId }, ctx) =>
      run(ctx, "mark_returned", async (convex) => {
        await convex.mutation(api.loans.markReturned, { loanId: loanId as Id<"loans"> });
        return { loanId, status: "returned" };
      }),
  );

  // ── Admin (Convex rejects non-admins) ───────────────────────────────────

  server.registerTool(
    "admin_list_loans",
    {
      description: "Admins only: every loan on the platform, e.g. filter=overdue.",
      inputSchema: loanList,
      annotations: { readOnlyHint: true },
    },
    ({ filter, search, sort, ...rest }, ctx) =>
      run(ctx, "admin_list_loans", async (convex) =>
        pageResult(
          await convex.query(api.admin.loans, { ...pageOpts(rest), filter, search, sort }),
          loanSummary,
        ),
      ),
  );
}
