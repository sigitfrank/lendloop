"use client";

import type { UsePaginatedQueryReturnType } from "convex/react";
import { PaginationControls } from "@/components/pagination-controls";
import { ToolCard, type ToolCardData } from "@/components/tool-card";
import { ToolGridSkeleton } from "@/components/tool-grid-skeleton";
import { ToolTable } from "@/components/tool-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { api } from "@/convex/_generated/api";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useNumberedPages } from "@/hooks/use-numbered-pages";
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

function InfiniteGrid({ query, renderActions }: Pick<Props, "query" | "renderActions">) {
  const { results, status, loadMore } = query;
  const sentinel = useInfiniteScroll(status, loadMore, PAGE_SIZE);

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

function PagedTable({
  query,
  showLender,
  renderActions,
}: Pick<Props, "query" | "showLender" | "renderActions">) {
  const pages = useNumberedPages(query.results, query.status, query.loadMore, PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Phones: the table collapses to cards. */}
      <div className="sm:hidden">
        <CardGrid tools={pages.rows} renderActions={renderActions} />
      </div>
      <div className="hidden sm:block">
        {pages.waiting ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <ToolTable tools={pages.rows} showLender={showLender} renderActions={renderActions} />
        )}
      </div>
      <PaginationControls pages={pages} />
    </div>
  );
}
