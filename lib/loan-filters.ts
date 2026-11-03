import type { LoanFilter, LoanSort } from "@/convex/lib/validators";
import { LOAN_SORT_OPTIONS } from "@/lib/labels";
import type { ViewMode } from "@/lib/list-params";

export const LOAN_FILTERS: { value: LoanFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "overdue", label: "Overdue" },
  { value: "returned", label: "Returned" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

/** Loan list state in the URL: ?status=&q=&sort=&view= */
export type LoanListParams = {
  status: LoanFilter;
  q?: string;
  sort: LoanSort;
  view: ViewMode;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the URL; unknown values fall back to the defaults. */
export function parseLoanListParams(raw: RawParams): LoanListParams {
  const status = first(raw.status);
  const sort = first(raw.sort);
  return {
    status: LOAN_FILTERS.find((f) => f.value === status)?.value ?? "all",
    q: first(raw.q)?.trim() || undefined,
    sort: LOAN_SORT_OPTIONS.find((s) => s.value === sort)?.value ?? "newest",
    view: first(raw.view) === "table" ? "table" : "grid",
  };
}
