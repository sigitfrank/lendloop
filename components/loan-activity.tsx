import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import type { ActivityItem } from "@/convex/lib/activity";
import type { LoanStatus } from "@/convex/lib/validators";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";

const MAX_ATTEMPTS = 5; // mirrors convex/outbox.ts

const NOTIFICATION_NAME: Record<LoanStatus, string> = {
  pending: "Request notification",
  approved: "Approval notification",
  declined: "Decline notification",
  cancelled: "Cancellation notification",
  returned: "Return notification",
};

/** Plain words without the time, e.g. "Overdue reminder sent". */
export function activityText(item: ActivityItem): string {
  const name =
    item.kind === "reminder"
      ? "Overdue reminder"
      : item.kind === "error"
        ? "Automation error"
        : item.about
          ? NOTIFICATION_NAME[item.about]
          : "Notification";
  if (item.status === "retrying") {
    return `${name} retrying (attempt ${item.attempt} of ${MAX_ATTEMPTS})`;
  }
  if (item.kind === "error") return name;
  return `${name} ${item.status}`;
}

const ICON = {
  sent: { icon: CircleCheck, className: "text-success" },
  failed: { icon: CircleAlert, className: "text-danger" },
  retrying: { icon: RefreshCw, className: "text-warning" },
} as const;

/**
 * Recent automation activity for a loan. `detail` (error text) is only ever
 * present for admins; it's shown as a second line.
 */
export function LoanActivity({
  items,
  now,
  limit = 3,
  className,
}: {
  items: ActivityItem[];
  now: number;
  limit?: number;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      className={cn("space-y-1 text-xs text-muted-foreground", className)}
      aria-label="Automation activity"
    >
      {items.slice(0, limit).map((item) => {
        const { icon: Icon, className: tone } = ICON[item.status];
        return (
          <li key={`${item.kind}-${item.about}-${item.at}`} className="flex gap-1.5">
            <Icon className={cn("mt-px size-3.5 shrink-0", tone)} aria-hidden />
            <span>
              {activityText(item)} {timeAgo(item.at, now)}
              {item.detail && <span className="block text-[11px] opacity-80">{item.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
