import { CATEGORIES, LOAN_SORT_OPTIONS, SORT_OPTIONS } from "@/lib/labels";
import { LOAN_FILTERS } from "@/lib/loan-filters";

// Toolbar configuration per list. Everything is plain data so server pages can
// pass it to the (client) toolbar. In every option list the FIRST option is the
// default and is left out of the URL.

export type ListOption = { value: string; label: string };

/** A single-choice filter stored in the URL under `param`. */
export type FilterConfig = { param: string; label: string; options: ListOption[] };

export const CATEGORY_FILTER: FilterConfig = {
  param: "category",
  label: "Category",
  options: [{ value: "all", label: "All categories" }, ...CATEGORIES],
};

export const LOAN_STATUS_FILTER: FilterConfig = {
  param: "status",
  label: "Status",
  options: LOAN_FILTERS,
};

export const USER_FILTER: FilterConfig = {
  param: "show",
  label: "Show",
  options: [
    { value: "all", label: "Everyone" },
    { value: "trusted", label: "Trusted Lenders" },
    { value: "admin", label: "Admins" },
  ],
};

/** Automation log: HTTP status of each call (0 = n8n/Convex unreachable). */
export const LOG_STATUS_FILTER: FilterConfig = {
  param: "status",
  label: "Status",
  options: [
    { value: "all", label: "All requests" },
    { value: "failed", label: "Failed (not 2xx)" },
    { value: "workflow-errors", label: "n8n workflow errors" },
    { value: "200", label: "200 OK" },
    { value: "202", label: "202 Accepted" },
    { value: "400", label: "400 Bad request" },
    { value: "401", label: "401 Unauthorized" },
    { value: "404", label: "404 Not found" },
    { value: "500", label: "500 Server error" },
    { value: "503", label: "503 Unavailable" },
    { value: "0", label: "Network error" },
  ],
};

export const TOOL_SORTS: ListOption[] = SORT_OPTIONS;
export const LOAN_SORTS: ListOption[] = LOAN_SORT_OPTIONS;
export const USER_SORTS: ListOption[] = [
  { value: "newest", label: "Newest members" },
  { value: "oldest", label: "Oldest members" },
];
