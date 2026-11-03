"use client";

import { useState } from "react";

/** A stable "now" for relative times ("2 hours ago"), taken once per mount. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
