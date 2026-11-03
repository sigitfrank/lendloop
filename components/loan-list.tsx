"use client";

import type { UsePaginatedQueryReturnType } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarDays } from "lucide-react";
import { LoanActivity } from "@/components/loan-activity";
import { LoanTimeline } from "@/components/loan-timeline";
import { PaginationControls } from "@/components/pagination-controls";
import { LoanStatusBadge, TrustedLenderBadge } from "@/components/status-badges";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { api } from "@/convex/_generated/api";
import { loanLengthDays } from "@/convex/lib/dates";
import type { LoanFilter } from "@/convex/lib/validators";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useNow } from "@/hooks/use-now";
import { useNumberedPages } from "@/hooks/use-numbered-pages";
import { categoryLabel, formatDay, pluralDays } from "@/lib/labels";
import type { ViewMode } from "@/lib/list-params";
import { timeAgo } from "@/lib/time";

export type LoanView = FunctionReturnType<typeof api.loans.mine>["page"][number];
/** Whose list this is: decides which person is shown (admin sees both). */
type Side = "borrower" | "owner" | "admin";
type RenderActions = (loan: LoanView) => React.ReactNode;

export const LOAN_PAGE_SIZE = 12;

/** Empty-state title + description for a loan list, given search and filter. */
export function emptyCopy({ q, filter, all }: { q?: string; filter: LoanFilter; all: string }) {
  if (q) {
    return { title: `Nothing matches “${q}”`, description: "Try a tool name or a person's first name." };
  }
  if (filter === "all") return { title: "No requests yet", description: all };
  return { title: "Nothing here", description: "No requests with this status." };
}

/** "My requests" / "Incoming requests" body: infinite-scroll cards or a paged table. */
export function LoanList({
  query,
  side,
  view,
  empty,
  renderActions,
}: {
  query: UsePaginatedQueryReturnType<typeof api.loans.mine>;
  side: Side;
  view: ViewMode;
  empty: React.ReactNode;
  /** Omit for read-only lists (admin). */
  renderActions?: RenderActions;
}) {
  if (query.status === "LoadingFirstPage") return <LoanGridSkeleton />;
  if (query.results.length === 0) return <>{empty}</>;

  return view === "table" ? (
    <PagedLoanTable query={query} side={side} renderActions={renderActions} />
  ) : (
    <InfiniteLoanGrid query={query} side={side} renderActions={renderActions} />
  );
}

type BodyProps = {
  query: UsePaginatedQueryReturnType<typeof api.loans.mine>;
  side: Side;
  renderActions?: RenderActions;
};

function InfiniteLoanGrid({ query, side, renderActions }: BodyProps) {
  const { results, status, loadMore } = query;
  const sentinel = useInfiniteScroll(status, loadMore, LOAN_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <LoanCardGrid loans={results} side={side} renderActions={renderActions} />
      <div ref={sentinel} aria-hidden />
      {status === "LoadingMore" && <LoanGridSkeleton count={3} />}
    </div>
  );
}

function PagedLoanTable({ query, side, renderActions }: BodyProps) {
  const pages = useNumberedPages(query.results, query.status, query.loadMore, LOAN_PAGE_SIZE);
  const now = useNow();

  return (
    <div className="space-y-4">
      {/* Phones: the table collapses to cards. */}
      <div className="sm:hidden">
        <LoanCardGrid loans={pages.rows} side={side} renderActions={renderActions} />
      </div>
      <div className="hidden sm:block">
        {pages.waiting ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Tool</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>{PEOPLE_HEADING[side]}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last update</TableHead>
                  <TableHead>Automation</TableHead>
                  {renderActions && <TableHead className="pr-4 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.rows.map((loan) => (
                  <TableRow key={loan._id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">{loan.tool.name}</div>
                      <div className="text-xs text-muted-foreground">{toolMeta(loan)}</div>
                    </TableCell>
                    <TableCell>{dateRange(loan)}</TableCell>
                    <TableCell>
                      <People loan={loan} side={side} />
                    </TableCell>
                    <TableCell>
                      <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lastUpdate(loan, now)}
                    </TableCell>
                    <TableCell className="max-w-64">
                      {loan.activity.length > 0 ? (
                        <LoanActivity items={loan.activity} now={now} limit={1} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {renderActions && (
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1">{renderActions(loan)}</div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <PaginationControls pages={pages} />
    </div>
  );
}

function LoanCardGrid({ loans, side, renderActions }: { loans: LoanView[] } & Omit<BodyProps, "query">) {
  const now = useNow();

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {loans.map((loan) => {
        const actions = renderActions?.(loan);
        return (
          <li key={loan._id}>
            <Card className="h-full">
              <CardHeader className="gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base leading-snug">{loan.tool.name}</CardTitle>
                  <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
                </div>
                <p className="text-xs text-muted-foreground">{toolMeta(loan)}</p>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                  {dateRange(loan)}
                </div>
                <People loan={loan} side={side} withPrefix />
                <div className="border-t pt-3">
                  <LoanTimeline loan={loan} now={now} />
                </div>
              </CardContent>
              {actions && <CardFooter className="justify-end gap-1">{actions}</CardFooter>}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

const PEOPLE_HEADING: Record<Side, string> = {
  borrower: "Lender",
  owner: "Borrower",
  admin: "Lender · Borrower",
};

/** The person (or, for admins, both people, labelled) relevant to this list. */
function People({ loan, side, withPrefix }: { loan: LoanView; side: Side; withPrefix?: boolean }) {
  const lender = loan.lender.firstName;
  const borrower = loan.borrower.firstName;
  const trusted = loan.lender.trustedLender && <TrustedLenderBadge />;

  if (side === "admin") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs text-muted-foreground">Lender</span>
        <span>{lender}</span>
        {trusted}
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-xs text-muted-foreground">Borrower</span>
        <span>{borrower}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>
        {side === "borrower"
          ? withPrefix
            ? `Lent by ${lender}`
            : lender
          : withPrefix
            ? `Requested by ${borrower}`
            : borrower}
      </span>
      {side === "borrower" && trusted}
    </div>
  );
}

function toolMeta(loan: LoanView) {
  return `${categoryLabel(loan.tool.category)}${loan.tool.removed ? " · listing removed" : ""}`;
}

function dateRange(loan: LoanView) {
  const days = pluralDays(loanLengthDays(loan.startDate, loan.endDate));
  const range =
    loan.endDate === loan.startDate
      ? formatDay(loan.startDate)
      : `${formatDay(loan.startDate)} – ${formatDay(loan.endDate)}`;
  return (
    <span>
      {range} <span className="text-muted-foreground">· {days}</span>
    </span>
  );
}

/** The most recent thing that happened to the loan, in plain words. */
function lastUpdate(loan: LoanView, now: number): string {
  if (loan.returnedAt) return `Returned ${timeAgo(loan.returnedAt, now)}`;
  if (loan.decidedAt) {
    const verb = loan.status.charAt(0).toUpperCase() + loan.status.slice(1);
    return `${verb} ${timeAgo(loan.decidedAt, now)}`;
  }
  return `Requested ${timeAgo(loan._creationTime, now)}`;
}

function LoanGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}
