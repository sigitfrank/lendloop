"use client";

import { usePaginatedQuery } from "convex/react";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, ToolResults } from "@/components/tool-results";
import { api } from "@/convex/_generated/api";
import { useToday } from "@/hooks/use-today";
import type { ListParams } from "@/lib/list-params";

export function ToolsBrowser({ params }: { params: ListParams }) {
  const today = useToday();
  const { category, q, sort, view } = params;
  const query = usePaginatedQuery(
    api.tools.list,
    { category, search: q, sort, today },
    { initialNumItems: PAGE_SIZE },
  );

  const empty = (
    <EmptyState
      icon={SearchX}
      title={q ? `No tools match “${q}”` : "No tools here yet"}
      description={
        q
          ? "Try a different word, or clear the search."
          : category
            ? "Nobody is lending anything in this category right now. Try another one."
            : "Nobody is lending anything yet. List a tool from My listings."
      }
    />
  );

  return (
    <ToolResults
      // A new key resets the table to page 1 whenever the query changes.
      key={`${category}|${q}|${sort}`}
      query={query}
      view={view}
      showLender
      empty={empty}
    />
  );
}
