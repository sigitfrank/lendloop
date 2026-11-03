import {
  paginationOptsValidator,
  paginationResultValidator,
  type OrderedQuery,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getActiveTool, getCurrentUser, requireLoanParty, requireUser } from "./lib/auth";
import { assertValidLoanRange, rangesOverlap, toIsoDate } from "./lib/dates";
import { cleanSearch, loanSearchText } from "./lib/search";
import {
  SEARCH_MAX,
  categoryValidator,
  loanFilterValidator,
  loanSortValidator,
  loanStatusValidator,
  type LoanFilter,
  type LoanSort,
  type LoanStatus,
} from "./lib/validators";

// State machine (who may move a loan, and from where):
//   pending  → cancelled   borrower
//   pending  → approved    tool owner (no overlap with another approved loan)
//   pending  → declined    tool owner
//   approved → returned    tool owner (the lender confirms they got it back)

const MAX_LOANS_CHECKED = 100; // per tool and status; approved/pending sets stay small

const NOT_ALLOWED = "You don't have permission to do that.";

function assertStatus(loan: Doc<"loans">, expected: LoanStatus) {
  if (loan.status !== expected) {
    throw new ConvexError(
      expected === "pending"
        ? "This request has already been handled."
        : "This loan can't be changed any more.",
    );
  }
}

async function loansFor(ctx: MutationCtx, toolId: Id<"tools">, status: LoanStatus) {
  return await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", status))
    .take(MAX_LOANS_CHECKED);
}

/** Rejects a range that overlaps an approved loan on the same tool. */
async function assertNoApprovedOverlap(
  ctx: MutationCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
) {
  const approved = await loansFor(ctx, toolId, "approved");
  if (approved.some((loan) => rangesOverlap(loan, range))) {
    throw new ConvexError("Those dates overlap an approved booking for this tool.");
  }
}

/** Borrower asks to borrow a tool for a date range. */
export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  returns: v.id("loans"),
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    if (tool.ownerId === user._id) {
      throw new ConvexError("You can't borrow your own tool.");
    }
    assertValidLoanRange(startDate, endDate, toIsoDate(Date.now()));

    const pending = await loansFor(ctx, toolId, "pending");
    if (pending.some((loan) => loan.borrowerId === user._id)) {
      throw new ConvexError("You already have a pending request for this tool.");
    }
    await assertNoApprovedOverlap(ctx, toolId, { startDate, endDate });

    const owner = await ctx.db.get("users", tool.ownerId);
    return await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId, // from the tool, never from the client
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
      searchText: loanSearchText(tool.name, owner?.name, user.name),
    });
  },
});

/** Borrower withdraws a request that hasn't been answered yet. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan, side } = await requireLoanParty(ctx, loanId);
    if (side !== "borrower") throw new ConvexError(NOT_ALLOWED);
    assertStatus(loan, "pending");
    await ctx.db.patch("loans", loanId, { status: "cancelled", decidedAt: Date.now() });
    return null;
  },
});

/** Tool owner approves or declines a pending request. */
export const respond = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approve"), v.literal("decline")),
  },
  returns: v.null(),
  handler: async (ctx, { loanId, decision }) => {
    const { loan, side } = await requireLoanParty(ctx, loanId);
    if (side !== "owner") throw new ConvexError(NOT_ALLOWED);
    assertStatus(loan, "pending");

    if (decision === "approve") {
      await getActiveTool(ctx, loan.toolId); // can't approve a removed listing
      if (loan.startDate < toIsoDate(Date.now())) {
        throw new ConvexError("This request's start date has passed. Decline it instead.");
      }
      // Re-checked inside this transaction, so two overlapping requests can
      // never both be approved, even if the owner clicks both at once.
      await assertNoApprovedOverlap(ctx, loan.toolId, loan);
    }

    await ctx.db.patch("loans", loanId, {
      status: decision === "approve" ? "approved" : "declined",
      decidedAt: Date.now(),
    });
    return null;
  },
});

/** Tool owner confirms the tool came back. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan, side } = await requireLoanParty(ctx, loanId);
    if (side !== "owner") throw new ConvexError(NOT_ALLOWED);
    assertStatus(loan, "approved");
    await ctx.db.patch("loans", loanId, { status: "returned", returnedAt: Date.now() });
    return null;
  },
});

// ── Views ──────────────────────────────────────────────────────────────────

/** One loan as shown to a party. The other person is first name only. */
const loanViewValidator = v.object({
  _id: v.id("loans"),
  _creationTime: v.number(),
  status: loanStatusValidator,
  /** Derived: approved and the end date has passed. */
  overdue: v.boolean(),
  startDate: v.string(),
  endDate: v.string(),
  decidedAt: v.optional(v.number()),
  returnedAt: v.optional(v.number()),
  tool: v.object({ name: v.string(), category: categoryValidator, removed: v.boolean() }),
  /** The lender (on my requests) or the borrower (on incoming requests). */
  otherParty: v.object({ firstName: v.string(), trustedLender: v.boolean() }),
});

type Side = "owner" | "borrower";

async function toLoanView(ctx: QueryCtx, loan: Doc<"loans">, side: Side, today: string) {
  const tool = await ctx.db.get("tools", loan.toolId);
  const other = await ctx.db.get("users", side === "owner" ? loan.borrowerId : loan.ownerId);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < today,
    startDate: loan.startDate,
    endDate: loan.endDate,
    decidedAt: loan.decidedAt,
    returnedAt: loan.returnedAt,
    tool: {
      name: tool?.name ?? "Removed tool",
      category: tool?.category ?? "other",
      removed: tool?.removedAt !== undefined,
    },
    otherParty: {
      firstName: other?.name.split(" ")[0] ?? "A neighbour",
      trustedLender: other?.trustedLender ?? false,
    },
  };
}


type LoanQuery = OrderedQuery<DataModel["loans"]>;

/**
 * Index-backed base query for one side of the caller's loans, filtered to a
 * stored status (or none) and ordered by creation or start date.
 */
function indexedLoans(
  ctx: QueryCtx,
  side: Side,
  userId: Id<"users">,
  status: LoanStatus | undefined,
  sort: LoanSort,
): LoanQuery {
  const loans = ctx.db.query("loans");
  const byStart = sort === "start_asc" || sort === "start_desc";
  const order = sort === "oldest" || sort === "start_asc" ? "asc" : "desc";

  if (side === "owner") {
    if (status) {
      return byStart
        ? loans
            .withIndex("by_ownerId_and_status_and_startDate", (q) =>
              q.eq("ownerId", userId).eq("status", status),
            )
            .order(order)
        : loans
            .withIndex("by_ownerId_and_status", (q) =>
              q.eq("ownerId", userId).eq("status", status),
            )
            .order(order);
    }
    return byStart
      ? loans.withIndex("by_ownerId_and_startDate", (q) => q.eq("ownerId", userId)).order(order)
      : loans.withIndex("by_ownerId", (q) => q.eq("ownerId", userId)).order(order);
  }

  if (status) {
    return byStart
      ? loans
          .withIndex("by_borrowerId_and_status_and_startDate", (q) =>
            q.eq("borrowerId", userId).eq("status", status),
          )
          .order(order)
      : loans
          .withIndex("by_borrowerId_and_status", (q) =>
            q.eq("borrowerId", userId).eq("status", status),
          )
          .order(order);
  }
  return byStart
    ? loans.withIndex("by_borrowerId_and_startDate", (q) => q.eq("borrowerId", userId)).order(order)
    : loans.withIndex("by_borrowerId", (q) => q.eq("borrowerId", userId)).order(order);
}

/**
 * The caller's loans on one side with filter, search and sort.
 * "approved" / "overdue" are approved loans split by end date; that split runs
 * after the index, over the caller's own approved loans (a small set).
 * A search is relevance-ordered (Convex search has no other ordering).
 */
function loansOnSide(
  ctx: QueryCtx,
  side: Side,
  userId: Id<"users">,
  { filter, sort, search, today }: { filter: LoanFilter; sort: LoanSort; search?: string; today: string },
): LoanQuery {
  const status: LoanStatus | undefined =
    filter === "all" ? undefined : filter === "overdue" ? "approved" : filter;

  const base: LoanQuery = search
    ? ctx.db.query("loans").withSearchIndex("search_text", (q) => {
        const text = q.search("searchText", search);
        const mine = side === "owner" ? text.eq("ownerId", userId) : text.eq("borrowerId", userId);
        return status ? mine.eq("status", status) : mine;
      })
    : indexedLoans(ctx, side, userId, status, sort);

  if (filter === "overdue") return base.filter((q) => q.lt(q.field("endDate"), today));
  if (filter === "approved") return base.filter((q) => q.gte(q.field("endDate"), today));
  return base;
}

const viewArgs = {
  paginationOpts: paginationOptsValidator,
  filter: v.optional(loanFilterValidator),
  search: v.optional(v.string()),
  sort: v.optional(loanSortValidator),
  today: v.string(), // client's "YYYY-MM-DD"; queries must not read the clock
};

/** "My requests": loans where the caller is the borrower. */
export const mine = query({
  args: viewArgs,
  returns: paginationResultValidator(loanViewValidator),
  handler: async (ctx, { paginationOpts, filter, search, sort, today }) => {
    const user = await requireUser(ctx);
    const result = await loansOnSide(ctx, "borrower", user._id, {
      filter: filter ?? "all",
      sort: sort ?? "newest",
      search: cleanSearch(search, SEARCH_MAX),
      today,
    }).paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map((loan) => toLoanView(ctx, loan, "borrower", today)),
    );
    return { ...result, page };
  },
});

/** "Incoming requests": loans on the caller's tools. */
export const incoming = query({
  args: viewArgs,
  returns: paginationResultValidator(loanViewValidator),
  handler: async (ctx, { paginationOpts, filter, search, sort, today }) => {
    const user = await requireUser(ctx);
    const result = await loansOnSide(ctx, "owner", user._id, {
      filter: filter ?? "all",
      sort: sort ?? "newest",
      search: cleanSearch(search, SEARCH_MAX),
      today,
    }).paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map((loan) => toLoanView(ctx, loan, "owner", today)),
    );
    return { ...result, page };
  },
});

const PENDING_COUNT_CAP = 100;

/**
 * Pending requests waiting on the caller (nav badge). Capped; the UI shows "99+".
 * Returns 0 instead of throwing while the user row is still being created.
 */
export const incomingPendingCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_ownerId_and_status", (q) =>
        q.eq("ownerId", user._id).eq("status", "pending"),
      )
      .take(PENDING_COUNT_CAP);
    return pending.length;
  },
});
