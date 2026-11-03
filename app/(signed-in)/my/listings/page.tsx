import { Package, Plus } from "lucide-react";
import { ActiveFilters } from "@/components/active-filters";
import { ListToolbar } from "@/components/list-toolbar";
import { MyListings } from "@/components/my-listings";
import { PageHeader } from "@/components/page-header";
import { ToolFormDialog } from "@/components/tool-form-dialog";
import { Button } from "@/components/ui/button";
import { TOOL_SORTS } from "@/lib/list-config";
import { parseListParams } from "@/lib/list-params";

export default async function MyListingsPage({ searchParams }: PageProps<"/my/listings">) {
  const params = parseListParams(await searchParams);

  const addButton = (
    <ToolFormDialog
      trigger={
        <Button className="h-9">
          <Plus aria-hidden /> List a tool
        </Button>
      }
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Package}
        title="My listings"
        description="Tools you're lending to the neighbourhood."
        toolbar={
          <ListToolbar searchLabel="Search your listings…" sortOptions={TOOL_SORTS} viewToggle />
        }
        action={addButton}
      />
      <ActiveFilters />
      <MyListings params={params} addButton={addButton} />
    </div>
  );
}
