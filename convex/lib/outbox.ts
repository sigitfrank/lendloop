import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { notificationKey } from "./keys";
import type { LoanStatus } from "./validators";

/**
 * Queue a "loan created / status changed" notification for n8n.
 *
 * Call it inside the same mutation that changes the loan: the outbox row is
 * committed atomically with the change (no change without an event, no event
 * without a change). Delivery happens afterwards in outbox.deliver, with retries.
 */
export async function enqueueLoanNotification(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  status: LoanStatus,
) {
  const idempotencyKey = notificationKey(loanId, status);
  const existing = await ctx.db
    .query("outbox")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
  if (existing) return; // each loan status is announced once

  const outboxId = await ctx.db.insert("outbox", {
    loanId,
    event: status,
    idempotencyKey,
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.outbox.deliver, { outboxId });
}
