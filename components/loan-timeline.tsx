"use client";

import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useState } from "react";
import { activityText } from "@/components/loan-activity";
import type { LoanView } from "@/components/loan-list";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";

type Entry = {
  key: string;
  at: number;
  text: string;
  detail?: string;
  kind: "lifecycle" | "sent" | "failed" | "retrying";
};

const COLLAPSED = 4;

/** Loan lifecycle (requested, decided, returned) merged with automation activity. */
function buildEntries(loan: LoanView): Entry[] {
  const entries: Entry[] = [
    {
      key: "requested",
      at: loan._creationTime,
      text: `Requested by ${loan.borrower.firstName}`,
      kind: "lifecycle",
    },
  ];
  if (loan.decidedAt) {
    // A returned loan was approved first; otherwise the decision is the status.
    const decision =
      loan.status === "returned" || loan.status === "approved"
        ? "Approved"
        : loan.status === "declined"
          ? "Declined"
          : "Cancelled by the borrower";
    entries.push({ key: "decided", at: loan.decidedAt, text: decision, kind: "lifecycle" });
  }
  if (loan.returnedAt) {
    entries.push({ key: "returned", at: loan.returnedAt, text: "Returned", kind: "lifecycle" });
  }
  for (const item of loan.activity) {
    entries.push({
      key: `${item.kind}-${item.about}-${item.at}`,
      at: item.at,
      text: activityText(item),
      detail: item.detail,
      kind: item.status,
    });
  }
  return entries.sort((a, b) => b.at - a.at);
}

const MARKER = {
  lifecycle: null,
  sent: { icon: CircleCheck, className: "text-success" },
  failed: { icon: CircleAlert, className: "text-danger" },
  retrying: { icon: RefreshCw, className: "text-warning" },
} as const;

export function LoanTimeline({ loan, now }: { loan: LoanView; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const entries = buildEntries(loan);
  const visible = expanded ? entries : entries.slice(0, COLLAPSED);

  return (
    <div className="space-y-2">
      <ol className="relative ml-1.5 space-y-2.5 border-l pl-4" aria-label="Loan history">
        {visible.map((entry) => {
          const marker = MARKER[entry.kind];
          return (
            <li key={entry.key} className="relative text-xs">
              <span
                aria-hidden
                className="absolute top-0.5 -left-[23px] flex size-3.5 items-center justify-center rounded-full bg-card"
              >
                {marker ? (
                  <marker.icon className={cn("size-3.5", marker.className)} />
                ) : (
                  <span className="size-2 rounded-full bg-primary" />
                )}
              </span>
              <p className={entry.kind === "lifecycle" ? "font-medium" : undefined}>{entry.text}</p>
              <p className="text-muted-foreground">{timeAgo(entry.at, now)}</p>
              {entry.detail && (
                <p className="mt-0.5 text-[11px] wrap-break-word text-muted-foreground">
                  {entry.detail}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {entries.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          {expanded ? "Show less" : `Show all (${entries.length})`}
        </button>
      )}
    </div>
  );
}
