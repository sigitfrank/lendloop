"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { Check, Inbox, PackageCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { emptyCopy, LOAN_PAGE_SIZE, LoanList, type LoanView } from "@/components/loan-list";
import { api } from "@/convex/_generated/api";
import type { LoanListParams } from "@/lib/loan-filters";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/errors";

/** Loans on the signed-in user's tools. */
export function IncomingRequests({ params }: { params: LoanListParams }) {
  const { status: filter, q, sort, view } = params;
  const today = useToday();
  const query = usePaginatedQuery(
    api.loans.incoming,
    { filter, search: q, sort, today },
    { initialNumItems: LOAN_PAGE_SIZE },
  );

  return (
    <LoanList
      key={`${filter}|${q}|${sort}`} // back to page 1 when the query changes
      query={query}
      view={view}
      side="owner"
      empty={
        <EmptyState
          icon={Inbox}
          {...emptyCopy({
            q,
            filter,
            all: "When a neighbour asks to borrow one of your tools, it shows up here.",
          })}
        />
      }
      renderActions={(loan) =>
        // Only pending and approved loans have owner actions; others get no footer.
        (loan.status === "pending" || loan.status === "approved") && <OwnerActions loan={loan} />
      }
    />
  );
}

function OwnerActions({ loan }: { loan: LoanView }) {
  const respond = useMutation(api.loans.respond);
  const markReturned = useMutation(api.loans.markReturned);
  const [approving, setApproving] = useState(false);
  const borrower = loan.otherParty.firstName;

  async function approve() {
    setApproving(true);
    try {
      await respond({ loanId: loan._id, decision: "approve" });
      toast.success(`Approved ${borrower}'s request`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setApproving(false);
    }
  }

  if (loan.status === "pending") {
    return (
      <>
        <IconButton icon={Check} label="Approve request" onClick={approve} disabled={approving} />
        <ConfirmAction
          trigger={<IconButton icon={X} label="Decline request" tone="danger" />}
          title={`Decline ${borrower}'s request?`}
          description={`${borrower} asked to borrow “${loan.tool.name}”. They'll see it was declined.`}
          confirmLabel="Decline"
          destructive
          successMessage="Request declined"
          action={() => respond({ loanId: loan._id, decision: "decline" })}
        />
      </>
    );
  }

  if (loan.status === "approved") {
    return (
      <ConfirmAction
        trigger={<IconButton icon={PackageCheck} label="Mark as returned" />}
        title={`Got “${loan.tool.name}” back?`}
        description={`Confirm ${borrower} has returned it. This closes the loan.`}
        confirmLabel="Mark returned"
        successMessage="Marked as returned"
        action={() => markReturned({ loanId: loan._id })}
      />
    );
  }

  return null;
}
