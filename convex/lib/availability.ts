import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Approved loans are the only ones that block a tool. Once returned they leave
// the "approved" index range, so this set stays small (current + upcoming).
const MAX_APPROVED_PER_TOOL = 50;

export const availabilityValidator = v.object({
  state: v.union(v.literal("available"), v.literal("on_loan"), v.literal("overdue")),
  /** Last day of the current loan when on_loan/overdue. */
  until: v.optional(v.string()),
  /** Approved date ranges (no borrower identities), for showing conflicts. */
  bookings: v.array(v.object({ startDate: v.string(), endDate: v.string() })),
});
export type Availability = Infer<typeof availabilityValidator>;

export async function getAvailability(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  today: string,
): Promise<Availability> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(MAX_APPROVED_PER_TOOL);

  const bookings = approved
    .map(({ startDate, endDate }) => ({ startDate, endDate }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const overdue = bookings.find((b) => b.endDate < today);
  if (overdue) return { state: "overdue", until: overdue.endDate, bookings };

  const current = bookings.find((b) => b.startDate <= today && today <= b.endDate);
  if (current) return { state: "on_loan", until: current.endDate, bookings };

  return { state: "available", bookings };
}
