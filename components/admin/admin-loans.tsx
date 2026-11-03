"use client";

import { usePaginatedQuery } from "convex/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { emptyCopy, LOAN_PAGE_SIZE, LoanList } from "@/components/loan-list";
import { api } from "@/convex/_generated/api";
import { useToday } from "@/hooks/use-today";
import type { LoanListParams } from "@/lib/loan-filters";

/** Every loan on the platform (read-only: decisions belong to the lender). */
export function AdminLoans({ params }: { params: LoanListParams }) {
  const { status: filter, q, sort, view } = params;
  const today = useToday();
  const query = usePaginatedQuery(
    api.admin.loans,
    { filter, search: q, sort, today },
    { initialNumItems: LOAN_PAGE_SIZE },
  );

  return (
    <LoanList
      key={`${filter}|${q}|${sort}`}
      query={query}
      view={view}
      side="admin"
      empty={
        <EmptyState
          icon={Inbox}
          {...emptyCopy({ q, filter, all: "No one has requested a tool yet." })}
        />
      }
    />
  );
}
