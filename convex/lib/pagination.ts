import type { PaginationOptions } from "convex/server";

const MAX_PAGE_SIZE = 50; // the UI asks for 12-30

/** Clamp a client-supplied page size so one call can't read an unbounded page. */
export function boundedPage(opts: PaginationOptions): PaginationOptions {
  return { ...opts, numItems: Math.min(Math.max(1, opts.numItems), MAX_PAGE_SIZE) };
}
