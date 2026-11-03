"use client";

import type { PaginationStatus } from "convex/react";
import { useState } from "react";

/**
 * Numbered pages on top of Convex cursor pagination. Pages are numbered as
 * they are reached; there is no total count or jump-to-page (Convex has no
 * offsets or row counts; see README). Reset by remounting (React `key`).
 */
export function useNumberedPages<T>(
  results: T[],
  status: PaginationStatus,
  loadMore: (numItems: number) => void,
  pageSize: number,
) {
  const [page, setPage] = useState(1);

  const loadedPages = Math.max(1, Math.ceil(results.length / pageSize));
  const start = (page - 1) * pageSize;
  const rows = results.slice(start, start + pageSize);

  return {
    page,
    rows,
    start,
    pageCount: status === "Exhausted" ? loadedPages : Math.max(loadedPages, page),
    hasNext: page < loadedPages || status === "CanLoadMore",
    waiting: rows.length === 0 && status === "LoadingMore",
    goTo(target: number) {
      if (target > loadedPages && status === "CanLoadMore") loadMore(pageSize);
      setPage(target);
    },
  };
}

export type NumberedPages = ReturnType<typeof useNumberedPages>;
