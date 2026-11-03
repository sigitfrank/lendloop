import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActiveFilters } from "@/components/active-filters";
import { AdminListings } from "@/components/admin/admin-listings";
import { AdminLoans } from "@/components/admin/admin-loans";
import { AdminUsers } from "@/components/admin/admin-users";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { api } from "@/convex/_generated/api";
import { ADMIN_TABS, parseAdminTab, parseUserListParams } from "@/lib/admin-params";
import {
  CATEGORY_FILTER,
  LOAN_SORTS,
  LOAN_STATUS_FILTER,
  TOOL_SORTS,
  USER_FILTER,
  USER_SORTS,
  type FilterConfig,
  type ListOption,
} from "@/lib/list-config";
import { parseListParams } from "@/lib/list-params";
import { parseLoanListParams } from "@/lib/loan-filters";

const TOOLBARS: Record<
  (typeof ADMIN_TABS)[number]["value"],
  { searchLabel: string; sortOptions: ListOption[]; filters: FilterConfig[] }
> = {
  loans: {
    searchLabel: "Search tool or person…",
    sortOptions: LOAN_SORTS,
    filters: [LOAN_STATUS_FILTER],
  },
  listings: {
    searchLabel: "Search listings…",
    sortOptions: TOOL_SORTS,
    filters: [CATEGORY_FILTER],
  },
  users: {
    searchLabel: "Search by name…",
    sortOptions: USER_SORTS,
    filters: [USER_FILTER],
  },
};

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  // Server-side gate: non-admins get a 404 (the page doesn't reveal it exists).
  // Every admin function also checks the role itself; this is not the only guard.
  const { getToken } = await auth();
  const me = await fetchQuery(api.users.current, {}, { token: (await getToken()) ?? undefined });
  if (me?.role !== "admin") notFound();

  const raw = await searchParams;
  const tab = parseAdminTab(raw);
  const toolbar = TOOLBARS[tab];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShieldCheck}
        title="Admin"
        description="Every loan, listing and member on LendLoop."
        toolbar={<ListToolbar key={tab} {...toolbar} viewToggle />}
      />

      <nav aria-label="Admin sections" className="flex gap-1 border-b">
        {ADMIN_TABS.map(({ value, label }) => (
          <Link
            key={value}
            href={`/admin?tab=${value}`}
            aria-current={tab === value ? "page" : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {label}
          </Link>
        ))}
      </nav>

      <ActiveFilters filters={toolbar.filters} />

      {tab === "loans" && <AdminLoans params={parseLoanListParams(raw)} />}
      {tab === "listings" && <AdminListings params={parseListParams(raw)} />}
      {tab === "users" && <AdminUsers params={parseUserListParams(raw)} />}
    </div>
  );
}
