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

export const TOOL_SORTS: ListOption[] = SORT_OPTIONS;
export const LOAN_SORTS: ListOption[] = LOAN_SORT_OPTIONS;
export const USER_SORTS: ListOption[] = [
  { value: "newest", label: "Newest members" },
  { value: "oldest", label: "Oldest members" },
];
