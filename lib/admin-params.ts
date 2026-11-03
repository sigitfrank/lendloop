import type { ViewMode } from "@/lib/list-params";

export const ADMIN_TABS = [
  { value: "loans", label: "Loans" },
  { value: "listings", label: "Listings" },
  { value: "users", label: "Users" },
  { value: "automations", label: "Automation log" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["value"];

export type UserFilter = "all" | "trusted" | "admin";
export type UserListParams = {
  show: UserFilter;
  q?: string;
  sort: "newest" | "oldest";
  view: ViewMode;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAdminTab(raw: RawParams): AdminTab {
  const tab = first(raw.tab);
  return ADMIN_TABS.find((t) => t.value === tab)?.value ?? "loans";
}

export function parseUserListParams(raw: RawParams): UserListParams {
  const show = first(raw.show);
  return {
    show: show === "trusted" || show === "admin" ? show : "all",
    q: first(raw.q)?.trim() || undefined,
    sort: first(raw.sort) === "oldest" ? "oldest" : "newest",
    view: first(raw.view) === "table" ? "table" : "grid",
  };
}
