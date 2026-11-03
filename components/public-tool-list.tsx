"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import { Wrench } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/labels";

/** Read-only list for signed-out visitors: name + category only. */
export function PublicToolList({
  preloadedTools,
}: {
  preloadedTools: Preloaded<typeof api.tools.listPublic>;
}) {
  const tools = usePreloadedQuery(preloadedTools);

  if (tools.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No tools listed yet"
        description="Be the first to lend something to your neighbours."
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li
          key={tool._id}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <span className="truncate text-sm font-medium">{tool.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {categoryLabel(tool.category)}
          </span>
        </li>
      ))}
    </ul>
  );
}
