"use client";

import { useState } from "react";
import { toIsoDate } from "@/convex/lib/dates";

/**
 * Today's date ("YYYY-MM-DD", UTC, matching the server's date rules).
 * Convex queries can't read the clock, so the client passes this in.
 */
export function useToday(): string {
  const [today] = useState(() => toIsoDate(Date.now()));
  return today;
}
