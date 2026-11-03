import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { toIsoDate } from "./lib/dates";
import { loanSearchText } from "./lib/search";

// Development helpers. Internal: only runnable from the CLI or dashboard with
// deployment access, never from the browser.

const DAY = 24 * 60 * 60 * 1000;

/**
 * Creates an approved loan whose end date has passed, so the daily overdue
 * reminder (n8n WF2) has something to send. The UI can't do this on purpose:
 * it rejects start dates in the past.
 *   pnpm convex run devSeed:overdueLoan
 *   pnpm convex run devSeed:overdueLoan '{"daysOverdue": 5}'
 */
export const overdueLoan = internalMutation({
  args: { daysOverdue: v.optional(v.number()) },
  returns: v.object({
    loanId: v.id("loans"),
    tool: v.string(),
    lender: v.string(),
    borrower: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  }),
  handler: async (ctx, { daysOverdue = 2 }) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removedAt", (q) => q.eq("removedAt", undefined))
      .take(50);
    const users = await ctx.db.query("users").take(50);

    for (const tool of tools) {
      const borrower = users.find((u) => u._id !== tool.ownerId && u.email);
      if (!borrower) continue;
      const lender = users.find((u) => u._id === tool.ownerId);

      const endDate = toIsoDate(Date.now() - daysOverdue * DAY);
      const startDate = toIsoDate(Date.now() - (daysOverdue + 3) * DAY);
      const loanId = await ctx.db.insert("loans", {
        toolId: tool._id,
        ownerId: tool.ownerId,
        borrowerId: borrower._id,
        startDate,
        endDate,
        status: "approved",
        decidedAt: Date.now(),
        searchText: loanSearchText(tool.name, lender?.name, borrower.name),
      });
      return {
        loanId,
        tool: tool.name,
        lender: lender?.name ?? "unknown",
        borrower: borrower.name,
        startDate,
        endDate,
      };
    }
    throw new ConvexError("Need at least one listed tool and a second user with an email.");
  },
});
