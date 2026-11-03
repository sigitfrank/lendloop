"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { SearchX, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { PAGE_SIZE, ToolResults } from "@/components/tool-results";
import { api } from "@/convex/_generated/api";
import { useToday } from "@/hooks/use-today";
import type { ListParams } from "@/lib/list-params";

/** All active listings, with "Remove" for moderation. */
export function AdminListings({ params }: { params: ListParams }) {
  const { category, q, sort, view } = params;
  const today = useToday();
  const removeTool = useMutation(api.admin.removeTool);
  const query = usePaginatedQuery(
    api.tools.list,
    { category, search: q, sort, today },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <ToolResults
      key={`${category}|${q}|${sort}`}
      query={query}
      view={view}
      showLender
      empty={
        <EmptyState
          icon={SearchX}
          title={q ? `No listings match “${q}”` : "No listings"}
          description="Nothing to moderate here."
        />
      }
      renderActions={(tool) => (
        <ConfirmAction
          trigger={<IconButton icon={Trash2} label={`Remove “${tool.name}”`} tone="danger" />}
          title={`Remove “${tool.name}” from LendLoop?`}
          description={`It disappears from the board and ${tool.owner.firstName}'s listings. Pending requests on it are declined; approved loans are kept.`}
          confirmLabel="Remove listing"
          destructive
          successMessage="Listing removed"
          action={() => removeTool({ toolId: tool._id })}
        />
      )}
    />
  );
}
