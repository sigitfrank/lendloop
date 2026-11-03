"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { Inbox, X } from "lucide-react";
import Link from "next/link";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { emptyCopy, LOAN_PAGE_SIZE, LoanList } from "@/components/loan-list";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { LoanListParams } from "@/lib/loan-filters";
import { useToday } from "@/hooks/use-today";

/** Loans where the signed-in user is the borrower. */
export function MyRequests({ params }: { params: LoanListParams }) {
  const { status: filter, q, sort, view } = params;
  const today = useToday();
  const cancelRequest = useMutation(api.loans.cancel);
  const query = usePaginatedQuery(
    api.loans.mine,
    { filter, search: q, sort, today },
    { initialNumItems: LOAN_PAGE_SIZE },
  );

  return (
    <LoanList
      key={`${filter}|${q}|${sort}`} // back to page 1 when the query changes
      query={query}
      view={view}
      side="borrower"
      empty={
        <EmptyState
          icon={Inbox}
          {...emptyCopy({
            q,
            filter,
            all: "Find something you need and ask to borrow it.",
          })}
          action={
            filter === "all" && (
              <Button asChild>
                <Link href="/tools">Browse tools</Link>
              </Button>
            )
          }
        />
      }
      renderActions={(loan) =>
        loan.status === "pending" && (
          <ConfirmAction
            trigger={<IconButton icon={X} label="Cancel request" tone="danger" />}
            title={`Cancel your request for “${loan.tool.name}”?`}
            description={`${loan.lender.firstName} won't be able to approve it any more.`}
            confirmLabel="Cancel request"
            cancelLabel="Keep request"
            destructive
            successMessage="Request cancelled"
            action={() => cancelRequest({ loanId: loan._id })}
          />
        )
      }
    />
  );
}
