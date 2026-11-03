import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Every public query/mutation follows: authenticate → authorise → validate → act.
// These helpers are the only place identity and permissions are decided.
// They accept QueryCtx so both queries and mutations (a superset) can use them.
// Errors are deliberately generic so they don't reveal whether a record exists.

const NOT_SIGNED_IN = "Please sign in to continue.";
const NOT_ALLOWED = "You don't have permission to do that.";
const NOT_FOUND = "That item doesn't exist or is no longer available.";

/** The caller's user row, or null when signed out / not yet synced. */
export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError(NOT_SIGNED_IN);
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError(NOT_ALLOWED);
  return user;
}

/** An active (not removed) tool, regardless of owner. */
export async function getActiveTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get("tools", toolId);
  if (!tool || tool.removedAt !== undefined) throw new ConvexError(NOT_FOUND);
  return tool;
}

/** Caller must own the (active) tool. */
export async function requireToolOwner(ctx: QueryCtx, toolId: Id<"tools">) {
  const user = await requireUser(ctx);
  const tool = await getActiveTool(ctx, toolId);
  if (tool.ownerId !== user._id) throw new ConvexError(NOT_ALLOWED);
  return { user, tool };
}

/**
 * Caller must be the tool owner or the borrower on this loan.
 * Returns which side they are on so callers can restrict further.
 */
export async function requireLoanParty(ctx: QueryCtx, loanId: Id<"loans">) {
  const user = await requireUser(ctx);
  const loan = await ctx.db.get("loans", loanId);
  if (!loan) throw new ConvexError(NOT_FOUND);
  if (loan.ownerId === user._id) return { user, loan, side: "owner" as const };
  if (loan.borrowerId === user._id) return { user, loan, side: "borrower" as const };
  throw new ConvexError(NOT_FOUND); // don't confirm that someone else's loan exists
}
