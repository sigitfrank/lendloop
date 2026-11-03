import { paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getActiveTool, getCurrentUser, requireLoanParty, requireUser } from "./lib/auth";
import { assertValidLoanRange, rangesOverlap, toIsoDate } from "./lib/dates";
import { loanListArgs, loansQuery, loanViewValidator, toLoanView } from "./lib/loanViews";
import { enqueueLoanNotification } from "./lib/outbox";
import { cleanSearch, loanSearchText } from "./lib/search";
import { SEARCH_MAX, type LoanStatus } from "./lib/validators";

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
    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId, // from the tool, never from the client
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
      searchText: loanSearchText(tool.name, owner?.name, user.name),
    });
    await enqueueLoanNotification(ctx, loanId, "pending"); // tell the lender
    return loanId;
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
    await enqueueLoanNotification(ctx, loanId, "cancelled");
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

    const status = decision === "approve" ? "approved" : "declined";
    await ctx.db.patch("loans", loanId, { status, decidedAt: Date.now() });
    await enqueueLoanNotification(ctx, loanId, status);
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
    await enqueueLoanNotification(ctx, loanId, "returned");
    return null;
  },
});

// ── Views ──────────────────────────────────────────────────────────────────

/** "My requests": loans where the caller is the borrower. */
export const mine = query({
  args: loanListArgs,
  returns: paginationResultValidator(loanViewValidator),
  handler: async (ctx, { paginationOpts, filter, search, sort, today }) => {
    const user = await requireUser(ctx);
    const result = await loansQuery(ctx, { borrowerId: user._id }, {
      filter: filter ?? "all",
      sort: sort ?? "newest",
      search: cleanSearch(search, SEARCH_MAX),
      today,
    }).paginate(paginationOpts);
    const page = await Promise.all(result.page.map((loan) => toLoanView(ctx, loan, today)));
    return { ...result, page };
  },
});

/** "Incoming requests": loans on the caller's tools. */
export const incoming = query({
  args: loanListArgs,
  returns: paginationResultValidator(loanViewValidator),
  handler: async (ctx, { paginationOpts, filter, search, sort, today }) => {
    const user = await requireUser(ctx);
    const result = await loansQuery(ctx, { ownerId: user._id }, {
      filter: filter ?? "all",
      sort: sort ?? "newest",
      search: cleanSearch(search, SEARCH_MAX),
      today,
    }).paginate(paginationOpts);
    const page = await Promise.all(result.page.map((loan) => toLoanView(ctx, loan, today)));
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
