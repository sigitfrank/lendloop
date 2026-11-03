import { Search } from "lucide-react";
import { CategoryFilter } from "@/components/category-filter";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { ToolsBrowser } from "@/components/tools-browser";
import { ViewToggle } from "@/components/view-toggle";
import { parseListParams } from "@/lib/list-params";

// Category, search, sort and view all live in the URL and are applied server-side.
export default async function ToolsPage({ searchParams }: PageProps<"/tools">) {
  const params = parseListParams(await searchParams);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Search}
        title="Browse tools"
        description="Everything your neighbours are lending, with live availability."
      />
      <div className="space-y-3">
        <CategoryFilter params={params} />
        <div className="flex items-start gap-3">
          <ListToolbar pathname="/tools" params={params} searchLabel="Search tools by name" />
          <ViewToggle pathname="/tools" params={params} />
        </div>
      </div>
      <ToolsBrowser params={params} />
    </div>
  );
}
