import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Availability } from "@/convex/lib/availability";
import type { LoanStatus } from "@/convex/lib/validators";
import { formatDay } from "@/lib/labels";

const tone = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  const { state, until } = availability;
  if (state === "overdue") {
    return <Badge className={tone.danger}>Overdue</Badge>;
  }
  if (state === "on_loan" && until) {
    return <Badge className={tone.warning}>On loan until {formatDay(until)}</Badge>;
  }
  return <Badge className={tone.success}>Available</Badge>;
}

const LOAN_BADGES: Record<LoanStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: tone.warning },
  approved: { label: "Approved", className: tone.success },
  declined: { label: "Declined", className: tone.danger },
  cancelled: { label: "Cancelled", className: tone.neutral },
  returned: { label: "Returned", className: tone.info },
};

export function LoanStatusBadge({ status, overdue }: { status: LoanStatus; overdue: boolean }) {
  if (overdue) return <Badge className={tone.danger}>Overdue</Badge>;
  const { label, className } = LOAN_BADGES[status];
  return <Badge className={className}>{label}</Badge>;
}

export function TrustedLenderBadge() {
  return (
    <Badge className="bg-accent text-accent-foreground">
      <ShieldCheck aria-hidden />
      Trusted Lender
    </Badge>
  );
}
