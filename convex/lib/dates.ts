import { ConvexError } from "convex/values";
import { MAX_LOAN_DAYS } from "./validators";

// Loan dates are calendar days stored as ISO strings ("YYYY-MM-DD"), so they
// compare correctly as plain strings and index cleanly. "Today" is UTC; per-user
// timezones are a production follow-up (PRODUCTION.md).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseIsoDate(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Rejects impossible dates like 2026-02-30 (Date.parse would roll them over).
  return Number.isNaN(ms) || toIsoDate(ms) !== value ? null : ms;
}

/** Number of calendar days a loan covers, counting both ends. */
export function loanLengthDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
}

/**
 * Validates a requested borrow range against `today` (passed in by the caller,
 * because queries must not read the clock). Throws a user-safe error.
 */
export function assertValidLoanRange(startDate: string, endDate: string, today: string) {
  if (parseIsoDate(startDate) === null || parseIsoDate(endDate) === null) {
    throw new ConvexError("Dates must be valid calendar dates.");
  }
  if (startDate < today) throw new ConvexError("Start date can't be in the past.");
  if (endDate < startDate) {
    throw new ConvexError("End date can't be before the start date.");
  }
  if (loanLengthDays(startDate, endDate) > MAX_LOAN_DAYS) {
    throw new ConvexError(`Loans can be at most ${MAX_LOAN_DAYS} days.`);
  }
}

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
