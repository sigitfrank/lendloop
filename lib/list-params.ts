import type { Category, ToolSort } from "@/convex/lib/validators";
import { isCategory } from "@/lib/labels";

// List state lives in the URL (?q=&sort=&category=&view=): shareable,
// reload-safe, back-button friendly, and read on the server.

export type ViewMode = "grid" | "table";

export type ListParams = {
  q?: string;
  sort: ToolSort;
  view: ViewMode;
  category?: Category;
};

const SORTS: ToolSort[] = ["newest", "oldest", "name_asc", "name_desc"];

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListParams(raw: RawParams): ListParams {
  const q = first(raw.q)?.trim();
  const sort = first(raw.sort);
  const category = first(raw.category);
  return {
    q: q || undefined,
    sort: SORTS.includes(sort as ToolSort) ? (sort as ToolSort) : "newest",
    view: first(raw.view) === "table" ? "table" : "grid",
    category: isCategory(category) ? category : undefined,
  };
}

/** Builds a URL for `pathname` with `changes` applied; defaults are omitted. */
export function listHref(pathname: string, current: ListParams, changes: Partial<ListParams>) {
  const next = { ...current, ...changes };
  const query = new URLSearchParams();
  if (next.category) query.set("category", next.category);
  if (next.q) query.set("q", next.q);
  if (next.sort !== "newest") query.set("sort", next.sort);
  if (next.view !== "grid") query.set("view", next.view);
  return query.size > 0 ? `${pathname}?${query}` : pathname;
}
