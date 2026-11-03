"use client";

import { useEffect, useState } from "react";
import { toIsoDate } from "@/convex/lib/dates";

/**
 * Today's date ("YYYY-MM-DD", UTC, matching the server's date rules).
 * Convex queries can't read the clock, so the client passes this in. Checked
 * every minute, so a page left open past midnight (UTC) moves to the new day.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toIsoDate(Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setToday(toIsoDate(Date.now())), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
