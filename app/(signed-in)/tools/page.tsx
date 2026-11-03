import { Search } from "lucide-react";
import { ActiveFilters } from "@/components/active-filters";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { ToolsBrowser } from "@/components/tools-browser";
import { CATEGORY_FILTER, TOOL_SORTS } from "@/lib/list-config";
import { parseListParams } from "@/lib/list-params";

// Category, search and sort live in the URL and are applied server-side.
// Browsing is grid-only (infinite scroll); the management pages offer a table view.
export default async function ToolsPage({ searchParams }: PageProps<"/tools">) {
  const params = parseListParams(await searchParams);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Search}
        title="Browse tools"
        description="Everything your neighbours are lending, with live availability."
        toolbar={
          <ListToolbar
            searchLabel="Search tools…"
            sortOptions={TOOL_SORTS}
            filters={[CATEGORY_FILTER]}
          />
        }
      />
      <ActiveFilters filters={[CATEGORY_FILTER]} />
      <ToolsBrowser params={params} />
    </div>
  );
}
