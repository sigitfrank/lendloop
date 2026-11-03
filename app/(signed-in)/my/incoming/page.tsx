import { Inbox } from "lucide-react";
import { ActiveFilters } from "@/components/active-filters";
import { IncomingRequests } from "@/components/incoming-requests";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { LOAN_SORTS, LOAN_STATUS_FILTER } from "@/lib/list-config";
import { parseLoanListParams } from "@/lib/loan-filters";

export default async function IncomingRequestsPage({ searchParams }: PageProps<"/my/incoming">) {
  const params = parseLoanListParams(await searchParams);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Inbox}
        title="Incoming requests"
        description="Neighbours asking to borrow your tools."
        toolbar={
          <ListToolbar
            searchLabel="Search tool or borrower…"
            sortOptions={LOAN_SORTS}
            filters={[LOAN_STATUS_FILTER]}
            viewToggle
          />
        }
      />
      <ActiveFilters filters={[LOAN_STATUS_FILTER]} />
      <IncomingRequests params={params} />
    </div>
  );
}
