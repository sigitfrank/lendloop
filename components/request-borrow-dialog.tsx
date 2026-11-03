"use client";

import { useMutation } from "convex/react";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import type { ToolCardData } from "@/components/tool-card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { loanLengthDays } from "@/convex/lib/dates";
import { MAX_LOAN_DAYS } from "@/convex/lib/validators";
import { useToday } from "@/hooks/use-today";
import { isoToLocalDate, localDateToIso } from "@/lib/calendar-dates";
import { errorMessage } from "@/lib/errors";
import { formatDay, pluralDays } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function RequestBorrowDialog({ tool }: { tool: ToolCardData }) {
  const requestLoan = useMutation(api.loans.request);
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const lender = tool.owner.firstName;

  if (tool.requestedByMe) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span keeps the tooltip working on a disabled button */}
          <span tabIndex={0}>
            <Button variant="secondary" size="sm" disabled>
              Requested
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Waiting for {lender} to reply</TooltipContent>
      </Tooltip>
    );
  }

  // Past days and already-approved bookings can't be picked.
  const disabled = [
    { before: isoToLocalDate(today) },
    ...tool.availability.bookings.map((b) => ({
      from: isoToLocalDate(b.startDate),
      to: isoToLocalDate(b.endDate),
    })),
  ];

  const startDate = range?.from ? localDateToIso(range.from) : undefined;
  const endDate = range?.to ? localDateToIso(range.to) : startDate;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setRange(undefined);
      setError(null);
    }
  }

  async function handleSubmit() {
    if (!startDate || !endDate) {
      setError("Choose the days you need it.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await requestLoan({ toolId: tool._id, startDate, endDate });
      toast.success(`Request sent to ${lender}`);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarCheck aria-hidden /> Request to borrow
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Borrow “{tool.name}”</DialogTitle>
          <DialogDescription>
            Pick the first and last day you need it (up to {MAX_LOAN_DAYS} days). Greyed-out
            days are already booked. {lender} will approve or decline.
          </DialogDescription>
        </DialogHeader>

        <Calendar
          mode="range"
          classNames={{ root: "w-full" }} // fill the dialog; day cells stretch evenly
          selected={range}
          onSelect={(next) => {
            setRange(next);
            setError(null);
          }}
          disabled={disabled}
          excludeDisabled // picking across a booked day restarts the range
          max={MAX_LOAN_DAYS - 1} // react-day-picker counts nights
          startMonth={isoToLocalDate(today)}
          aria-invalid={error ? true : undefined}
          className={cn(
            // Full-width cells would be square (very tall); keep rows a fixed height.
            "[&_.rdp-day]:aspect-auto **:data-day:aspect-auto **:data-day:h-10",
            error ? "rounded-lg ring-2 ring-destructive/40" : "rounded-lg border",
          )}
        />

        <p className="text-center text-sm" aria-live="polite">
          {startDate && endDate ? (
            <>
              <span className="font-medium">
                {formatDay(startDate)}
                {endDate !== startDate && ` – ${formatDay(endDate)}`}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {pluralDays(loanLengthDays(startDate, endDate))}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No dates chosen yet</span>
          )}
        </p>

        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
