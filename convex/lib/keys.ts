// Idempotency keys: one per logical automation event, so any retry (Convex →
// n8n delivery, n8n write-back, a re-run workflow) maps onto the same row.

/** One notification per loan per status change. */
export function notificationKey(loanId: string, status: string) {
  return `notify:${loanId}:${status}`;
}

/** At most one overdue reminder per loan per day. */
export function overdueReminderKey(loanId: string, day: string) {
  return `overdue:${loanId}:${day}`;
}

/** One error report per failed n8n execution. */
export function errorKey(executionId: string) {
  return `error:${executionId}`;
}
