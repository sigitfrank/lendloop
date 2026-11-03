import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
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
      .withIndex("by_status_and_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
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

// ── HTTP log ───────────────────────────────────────────────────────────────

const LOG_RETENTION_DAYS = 30;
const PRUNE_BATCH = 500;

/** One row per HTTP call between Convex and n8n (see schema: automationLog). */
export const logRequest = internalMutation({
  args: {
    direction: v.union(v.literal("to_n8n"), v.literal("from_n8n")),
    method: v.string(),
    path: v.string(),
    statusCode: v.number(),
    durationMs: v.optional(v.number()),
    loanId: v.optional(v.id("loans")),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const path = args.path.slice(0, 300);
    const detail = args.detail?.slice(0, 500);
    const loan = args.loanId ? await ctx.db.get("loans", args.loanId) : null;
    const tool = loan ? await ctx.db.get("tools", loan.toolId) : null;
    await ctx.db.insert("automationLog", {
      ...args,
      path,
      detail,
      ok: args.statusCode >= 200 && args.statusCode < 300,
      searchText: [args.method, path, args.statusCode, tool?.name, detail]
        .filter((part) => part !== undefined)
        .join(" "),
    });
    return null;
  },
});

/**
 * Deletes log rows older than 30 days, a batch at a time; schedules itself
 * again while there is more to delete. Run daily by crons.ts.
 */
export const pruneLog = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("automationLog")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(PRUNE_BATCH);
    for (const row of old) await ctx.db.delete("automationLog", row._id);
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.automation.pruneLog, {});
    }
    return { deleted: old.length };
  },
});
