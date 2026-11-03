"use client";

import { usePaginatedQuery } from "convex/react";
import { PackageOpen, Pencil, SearchX } from "lucide-react";
import { DeleteToolButton } from "@/components/delete-tool-button";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { ToolFormDialog } from "@/components/tool-form-dialog";
import { PAGE_SIZE, ToolResults } from "@/components/tool-results";
import { api } from "@/convex/_generated/api";
import { useToday } from "@/hooks/use-today";
import type { ListParams } from "@/lib/list-params";

export function MyListings({ params, addButton }: { params: ListParams; addButton: React.ReactNode }) {
  const today = useToday();
  const { q, sort, view } = params;
  const query = usePaginatedQuery(
    api.tools.mine,
    { search: q, sort, today },
    { initialNumItems: PAGE_SIZE },
  );

  const empty = q ? (
    <EmptyState
      icon={SearchX}
      title={`None of your listings match “${q}”`}
      description="Try a different word, or clear the search."
    />
  ) : (
    <EmptyState
      icon={PackageOpen}
      title="You haven't listed anything yet"
      description="List a tool you rarely use and let a neighbour borrow it."
      action={addButton}
    />
  );

  return (
    <ToolResults
      key={`${q}|${sort}`}
      query={query}
      view={view}
      showLender={false}
      empty={empty}
      renderActions={(tool) => (
        <>
          <ToolFormDialog
            tool={tool}
            trigger={<IconButton icon={Pencil} label={`Edit “${tool.name}”`} />}
          />
          <DeleteToolButton toolId={tool._id} toolName={tool.name} />
        </>
      )}
    />
  );
}
