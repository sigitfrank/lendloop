"use client";

import type { UsePaginatedQueryReturnType } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolCard, type ToolCardData } from "@/components/tool-card";
import { ToolGridSkeleton } from "@/components/tool-grid-skeleton";
import { ToolTable } from "@/components/tool-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { api } from "@/convex/_generated/api";
import type { ViewMode } from "@/lib/list-params";

export const PAGE_SIZE = 12;

type Paginated = UsePaginatedQueryReturnType<typeof api.tools.list>;

type Props = {
  query: Paginated;
  view: ViewMode;
  showLender: boolean;
  empty: React.ReactNode;
  renderActions?: (tool: ToolCardData) => React.ReactNode;
};

/** Shared list body: infinite-scroll grid, or numbered-page table. */
export function ToolResults({ query, view, showLender, empty, renderActions }: Props) {
  if (query.status === "LoadingFirstPage") return <ToolGridSkeleton />;
  if (query.results.length === 0) return <>{empty}</>;

  return view === "table" ? (
    <PagedTable query={query} showLender={showLender} renderActions={renderActions} />
  ) : (
    <InfiniteGrid query={query} renderActions={renderActions} />
  );
}

function CardGrid({
  tools,
  renderActions,
}: {
  tools: ToolCardData[];
  renderActions?: Props["renderActions"];
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool._id}>
          <ToolCard tool={tool} actions={renderActions?.(tool)} />
        </li>
      ))}
    </ul>
  );
}

/** Loads the next server page when the sentinel scrolls into view. */
function InfiniteGrid({ query, renderActions }: Pick<Props, "query" | "renderActions">) {
  const { results, status, loadMore } = query;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || status !== "CanLoadMore") return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && loadMore(PAGE_SIZE),
      { rootMargin: "400px" }, // start loading before the user hits the bottom
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [status, loadMore]);

  return (
    <div className="space-y-6">
      <CardGrid tools={results} renderActions={renderActions} />
      <div ref={sentinel} aria-hidden />
      {status === "LoadingMore" && <ToolGridSkeleton count={3} />}
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        {status === "Exhausted" ? `All ${results.length} shown` : `${results.length} shown`}
      </p>
    </div>
  );
}

/**
 * Numbered pages over Convex cursor pagination: pages are numbered as they are
 * reached (no total count or jump-to-page, by design; see README).
 */
function PagedTable({
  query,
  showLender,
  renderActions,
}: Pick<Props, "query" | "showLender" | "renderActions">) {
  const { results, status, loadMore } = query;
  const [page, setPage] = useState(1);

  const loadedPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageCount = status === "Exhausted" ? loadedPages : Math.max(loadedPages, page);
  const hasNext = page < loadedPages || status === "CanLoadMore";
  const start = (page - 1) * PAGE_SIZE;
  const rows = results.slice(start, start + PAGE_SIZE);
  const waiting = rows.length === 0 && status === "LoadingMore";

  function goTo(target: number) {
    if (target > loadedPages && status === "CanLoadMore") loadMore(PAGE_SIZE);
    setPage(target);
  }

  return (
    <div className="space-y-4">
      {/* Phones: the table collapses to cards. */}
      <div className="sm:hidden">
        <CardGrid tools={rows} renderActions={renderActions} />
      </div>
      <div className="hidden sm:block">
        {waiting ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <ToolTable tools={rows} showLender={showLender} renderActions={renderActions} />
        )}
      </div>

      <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {rows.length > 0 && `Showing ${start + 1}–${start + rows.length}`}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => goTo(page - 1)} disabled={page === 1}>
            <ChevronLeft aria-hidden /> Previous
          </Button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Button
              key={n}
              size="sm"
              variant={n === page ? "default" : "ghost"}
              aria-current={n === page ? "page" : undefined}
              onClick={() => goTo(n)}
              className="min-w-8"
            >
              {n}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(page + 1)}
            disabled={!hasNext || waiting}
          >
            Next <ChevronRight aria-hidden />
          </Button>
        </div>
      </nav>
    </div>
  );
}
