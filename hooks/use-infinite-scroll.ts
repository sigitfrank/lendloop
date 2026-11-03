"use client";

import type { PaginationStatus } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * Returns a ref for a sentinel element; when it nears the viewport and more
 * results exist, the next server page is requested.
 */
export function useInfiniteScroll(
  status: PaginationStatus,
  loadMore: (numItems: number) => void,
  pageSize: number,
) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || status !== "CanLoadMore") return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && loadMore(pageSize),
      { rootMargin: "400px" }, // start loading before the user hits the bottom
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [status, loadMore, pageSize]);

  return sentinel;
}
