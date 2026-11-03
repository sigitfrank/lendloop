import { Send } from "lucide-react";
import { ActiveFilters } from "@/components/active-filters";
import { ListToolbar } from "@/components/list-toolbar";
import { MyRequests } from "@/components/my-requests";
import { PageHeader } from "@/components/page-header";
import { LOAN_SORTS, LOAN_STATUS_FILTER } from "@/lib/list-config";
import { parseLoanListParams } from "@/lib/loan-filters";

export default async function MyRequestsPage({ searchParams }: PageProps<"/my/requests">) {
  const params = parseLoanListParams(await searchParams);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Send}
        title="My requests"
        description="Tools you've asked to borrow, and where each request stands."
        toolbar={
          <ListToolbar
            searchLabel="Search tool or lender…"
            sortOptions={LOAN_SORTS}
            filters={[LOAN_STATUS_FILTER]}
            viewToggle
          />
        }
      />
      <ActiveFilters filters={[LOAN_STATUS_FILTER]} />
      <MyRequests params={params} />
    </div>
  );
}
