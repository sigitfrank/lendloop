/**
 * Text indexed for loan search: tool name + both parties' first names (no
 * emails). A snapshot taken when the request is made.
 */
export function loanSearchText(toolName: string, ownerName?: string, borrowerName?: string) {
  return [toolName, ownerName?.split(" ")[0], borrowerName?.split(" ")[0]]
    .filter(Boolean)
    .join(" ");
}

/** Trims and caps a search box value; empty means "no search". */
export function cleanSearch(search: string | undefined, max: number): string | undefined {
  const trimmed = search?.trim().slice(0, max);
  return trimmed ? trimmed : undefined;
}
