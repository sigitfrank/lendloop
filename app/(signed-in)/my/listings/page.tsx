import { Package, Plus } from "lucide-react";
import { ListToolbar } from "@/components/list-toolbar";
import { MyListings } from "@/components/my-listings";
import { PageHeader } from "@/components/page-header";
import { ToolFormDialog } from "@/components/tool-form-dialog";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/view-toggle";
import { parseListParams } from "@/lib/list-params";

export default async function MyListingsPage({ searchParams }: PageProps<"/my/listings">) {
  const params = parseListParams(await searchParams);

  const addButton = (
    <ToolFormDialog
      trigger={
        <Button>
          <Plus aria-hidden /> List a tool
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="My listings"
        description="Tools you're lending to the neighbourhood."
        action={addButton}
      />
      <div className="flex items-start gap-3">
        <ListToolbar pathname="/my/listings" params={params} searchLabel="Search your listings" />
        <ViewToggle pathname="/my/listings" params={params} />
      </div>
      <MyListings params={params} addButton={addButton} />
    </div>
  );
}
