import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getActiveTool, requireAdmin } from "./lib/auth";
import { loanListArgs, loansQuery, loanViewValidator, toLoanView } from "./lib/loanViews";
import { enqueueLoanNotification } from "./lib/outbox";
import { cleanSearch } from "./lib/search";
import { SEARCH_MAX, roleValidator } from "./lib/validators";

// Every function here starts with requireAdmin: the role is read from the
// users table on each call, never from the client or the Clerk token.

const MAX_PENDING_DECLINED = 100;

/** All loans on the platform, with the same filter/search/sort as the user views. */
export const loans = query({
  args: loanListArgs,
  returns: paginationResultValidator(loanViewValidator),
  handler: async (ctx, { paginationOpts, filter, search, sort, today }) => {
    await requireAdmin(ctx);
    const result = await loansQuery(ctx, "all", {
      filter: filter ?? "all",
      sort: sort ?? "newest",
      search: cleanSearch(search, SEARCH_MAX),
      today,
    }).paginate(paginationOpts);
    const page = await Promise.all(result.page.map((loan) => toLoanView(ctx, loan, today)));
    return { ...result, page };
  },
});

/**
 * Remove any listing (soft delete, marked as removed by an admin). Pending
 * requests on it are declined so borrowers aren't left waiting; approved loans
 * stay as they are, since the tool may already be with the borrower.
 */
export const removeTool = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    await getActiveTool(ctx, toolId);
    const now = Date.now();
    await ctx.db.patch("tools", toolId, { removedAt: now, removedBy: "admin" });

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .take(MAX_PENDING_DECLINED);
    for (const loan of pending) {
      await ctx.db.patch("loans", loan._id, { status: "declined", decidedAt: now });
      await enqueueLoanNotification(ctx, loan._id, "declined"); // borrower hears it was declined
    }
    return null;
  },
});

const userFilterValidator = v.union(v.literal("all"), v.literal("trusted"), v.literal("admin"));

// Convex has no count operator, so each stat is a capped, index-backed read.
// Fine for an admin page of ~12 users; at scale use @convex-dev/aggregate counters.
const STATS_CAP = 100;

/** Track record shown to admins when deciding on Trusted Lender. */
async function userStats(ctx: QueryCtx, userId: Id<"users">) {
  const [listings, lent, borrowed] = await Promise.all([
    ctx.db
      .query("tools")
      .withIndex("by_ownerId_and_removedAt", (q) =>
        q.eq("ownerId", userId).eq("removedAt", undefined),
      )
      .take(STATS_CAP),
    ctx.db
      .query("loans")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", userId).eq("status", "returned"))
      .take(STATS_CAP),
    ctx.db
      .query("loans")
      .withIndex("by_borrowerId", (q) => q.eq("borrowerId", userId))
      .take(STATS_CAP),
  ]);
  return { listings: listings.length, lent: lent.length, borrowed: borrowed.length };
}

/**
 * Users for moderation. Admins see email addresses (needed to identify people);
 * no other view in the app exposes them.
 */
export const users = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filter: v.optional(userFilterValidator),
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.string(),
      email: v.optional(v.string()),
      role: roleValidator,
      trustedLender: v.boolean(),
      /** Each count is capped at STATS_CAP (the UI shows "99+"). */
      stats: v.object({ listings: v.number(), lent: v.number(), borrowed: v.number() }),
    }),
  ),
  handler: async (ctx, { paginationOpts, filter = "all", search, sort = "newest" }) => {
    await requireAdmin(ctx);
    const text = cleanSearch(search, SEARCH_MAX);
    const order = sort === "oldest" ? "asc" : "desc";
    const users = ctx.db.query("users");

    const query = text
      ? users.withSearchIndex("search_name", (q) => {
          const s = q.search("name", text);
          if (filter === "trusted") return s.eq("trustedLender", true);
          if (filter === "admin") return s.eq("role", "admin");
          return s;
        })
      : filter === "trusted"
        ? users.withIndex("by_trustedLender", (q) => q.eq("trustedLender", true)).order(order)
        : filter === "admin"
          ? users.withIndex("by_role", (q) => q.eq("role", "admin")).order(order)
          : users.order(order);

    const result = await query.paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (user) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        name: user.name,
        email: user.email,
        role: user.role,
        trustedLender: user.trustedLender,
        stats: await userStats(ctx, user._id),
      })),
    );
    return { ...result, page };
  },
});

/** Mark or unmark a user as a Trusted Lender (shown as a badge on their listings). */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    await ctx.db.patch("users", userId, { trustedLender: trusted });
    return null;
  },
});
