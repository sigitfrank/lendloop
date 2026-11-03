import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { overdueReminderKey } from "./lib/keys";

// Internal functions behind the signed /n8n/* HTTP endpoints (http.ts).
// None of these are callable from the browser.

const eventTypeValidator = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
  v.literal("error"),
);
const eventStatusValidator = v.union(v.literal("sent"), v.literal("failed"));

const MAX_OVERDUE_PER_RUN = 200;

/**
 * Approved loans past their end date that haven't had a reminder sent today.
 * Returns only what the reminder email needs (data minimisation).
 */
export const overdueLoans = internalQuery({
  args: { today: v.string() },
  returns: v.array(
    v.object({
      loanId: v.id("loans"),
      idempotencyKey: v.string(),
      toolName: v.string(),
      endDate: v.string(),
      borrower: v.object({ firstName: v.string(), email: v.string() }),
    }),
  ),
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) =>
        q.eq("status", "approved").lt("endDate", today),
      )
      .take(MAX_OVERDUE_PER_RUN);

    const due = [];
    for (const loan of loans) {
      const idempotencyKey = overdueReminderKey(loan._id, today);
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (already?.status === "sent") continue; // never remind twice in one day

      const borrower = await ctx.db.get("users", loan.borrowerId);
      if (!borrower?.email) continue; // nothing to send to; surfaces in admin as no event
      const tool = await ctx.db.get("tools", loan.toolId);
      due.push({
        loanId: loan._id,
        idempotencyKey,
        toolName: tool?.name ?? "the tool",
        endDate: loan.endDate,
        borrower: { firstName: borrower.name.split(" ")[0], email: borrower.email },
      });
    }
    return due;
  },
});

/** Current state of one automation event (lets n8n skip work already done). */
export const eventStatus = internalQuery({
  args: { idempotencyKey: v.string() },
  returns: v.union(v.null(), eventStatusValidator),
  handler: async (ctx, { idempotencyKey }) => {
    const event = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    return event?.status ?? null;
  },
});

/**
 * Idempotent write-back: one row per idempotencyKey. Replaying the same call
 * changes nothing; a later "sent" may replace an earlier "failed" (a retry
 * that succeeded), but "sent" is never downgraded.
 */
export const recordEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    type: eventTypeValidator,
    status: eventStatusValidator,
    loanId: v.optional(v.string()), // from n8n; validated below
    detail: v.optional(v.string()),
  },
  returns: v.object({ duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const loanId = args.loanId ? ctx.db.normalizeId("loans", args.loanId) : null;
    if (args.loanId && !loanId) throw new ConvexError("Unknown loanId");

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();

    const fields: Partial<Doc<"automationEvents">> = {
      status: args.status,
      detail: args.detail?.slice(0, 500),
      at: Date.now(),
    };
    if (existing) {
      if (existing.status === args.status || existing.status === "sent") {
        return { duplicate: true };
      }
      await ctx.db.patch("automationEvents", existing._id, fields);
      return { duplicate: false };
    }
    await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      type: args.type,
      status: args.status,
      loanId: loanId ?? undefined,
      detail: fields.detail,
      at: Date.now(),
    });
    return { duplicate: false };
  },
});
