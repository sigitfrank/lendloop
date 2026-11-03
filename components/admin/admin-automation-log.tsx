"use client";

import { usePaginatedQuery } from "convex/react";
import { ArrowRight, ScrollText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";

const PAGE_SIZE = 30;

function statusTone(code: number) {
  if (code >= 200 && code < 300) return "bg-success/10 text-success";
  if (code >= 400 && code < 500) return "bg-warning/10 text-warning";
  return "bg-danger/10 text-danger"; // 5xx and 0 (no response)
}

/** Every HTTP call between Convex and n8n in the last 30 days, newest first. */
export function AdminAutomationLog({ filter, search }: { filter: string; search?: string }) {
  const now = useNow();
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.automationLog,
    { filter, search },
    { initialNumItems: PAGE_SIZE },
  );
  const sentinel = useInfiniteScroll(status, loadMore, PAGE_SIZE);

  if (status === "LoadingFirstPage") return <Skeleton className="h-48 w-full rounded-xl" />;
  if (results.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title={search ? `Nothing matches “${search}”` : "No requests"}
        description={
          search
            ? "Try a path, a tool name, a status code or a word from the error."
            : filter === "all"
              ? "Nothing has been exchanged with n8n in the last 30 days."
              : filter === "workflow-errors"
                ? "n8n hasn't reported any failed workflow runs in the last 30 days."
                : "No requests with this status in the last 30 days."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        HTTP calls between Convex and n8n, both directions. Kept for 30 days.
      </p>
      <ul className="divide-y rounded-xl border bg-card">
        {results.map((row) => (
          <li
            key={row._id}
            className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <Badge className={cn("w-12 justify-center font-mono", statusTone(row.statusCode))}>
              {row.statusCode === 0 ? "ERR" : row.statusCode}
            </Badge>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {row.direction === "to_n8n" ? "Convex" : "n8n"}
                  <ArrowRight className="size-3" aria-label="to" />
                  {row.direction === "to_n8n" ? "n8n" : "Convex"}
                </span>
                <span className="font-mono text-xs">
                  {row.method} {row.path}
                </span>
                {row.isWorkflowError && (
                  <Badge className="bg-danger/10 text-danger">n8n workflow error</Badge>
                )}
                {row.toolName && (
                  <span className="text-xs text-muted-foreground">· {row.toolName}</span>
                )}
              </p>
              {row.detail && (
                <p className="text-xs wrap-break-word text-muted-foreground">{row.detail}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-3 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0">
              <span>{timeAgo(row._creationTime, now)}</span>
              {row.durationMs !== undefined && <span>{row.durationMs} ms</span>}
            </div>
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden />
    </div>
  );
}
