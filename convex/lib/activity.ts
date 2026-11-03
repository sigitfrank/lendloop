import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { loanStatusValidator, type LoanStatus } from "./validators";

// "Recent automation activity" shown on each loan (the brief's bonus), read
// from automationEvents (sent/failed, written back by n8n or the outbox) plus
// outbox rows that are still being retried.

const MAX_ITEMS = 5;
const LOAN_STATUSES: LoanStatus[] = ["pending", "approved", "declined", "cancelled", "returned"];

export const activityItemValidator = v.object({
  kind: v.union(
    v.literal("notification"),
    v.literal("reminder"),
    v.literal("error"),
    v.literal("retrying"),
  ),
  status: v.union(v.literal("sent"), v.literal("failed"), v.literal("retrying")),
  /** For notifications: which loan status the email announced. */
  about: v.optional(loanStatusValidator),
  /** For retries: the attempt that comes next (out of 5). */
  attempt: v.optional(v.number()),
  /** When it happened (or, for retries, when the next attempt is due). */
  at: v.number(),
  /** Error text. Admins only: loan parties get the status, never internals. */
  detail: v.optional(v.string()),
});
export type ActivityItem = Infer<typeof activityItemValidator>;

/** "notify:<loanId>:approved" → "approved" */
function aboutFromKey(idempotencyKey: string): LoanStatus | undefined {
  const status = idempotencyKey.split(":")[2];
  return LOAN_STATUSES.find((s) => s === status);
}

export async function getActivity(
  ctx: QueryCtx,
  loanId: Id<"loans">,
  { includeDetail }: { includeDetail: boolean },
): Promise<ActivityItem[]> {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loanId", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(MAX_ITEMS);
  const pending = await ctx.db
    .query("outbox")
    .withIndex("by_loanId_and_status", (q) => q.eq("loanId", loanId).eq("status", "pending"))
    .take(MAX_ITEMS);

  const items: ActivityItem[] = events.map((event) => ({
    kind:
      event.type === "request_notification"
        ? "notification"
        : event.type === "overdue_reminder"
          ? "reminder"
          : "error",
    status: event.status,
    about: event.type === "request_notification" ? aboutFromKey(event.idempotencyKey) : undefined,
    at: event.at,
    detail: includeDetail ? event.detail : undefined,
  }));
  for (const row of pending) {
    if (row.attempts === 0) continue; // first attempt still in flight, nothing to report
    items.push({
      kind: "retrying",
      status: "retrying",
      about: row.event,
      attempt: row.attempts + 1,
      at: row.nextAttemptAt,
      detail: includeDetail ? row.lastError : undefined,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, MAX_ITEMS);
}
