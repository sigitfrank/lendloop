"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type UserSyncStatus = "loading" | "ready" | "unauthenticated" | "error";

/**
 * Makes sure the signed-in Clerk user has a row in Convex before any
 * signed-in page queries data.
 * "unauthenticated" means Convex rejected (or never received) the Clerk token;
 * "error" means creating the row failed (e.g. network), so the page can say so.
 */
export function useStoreUser(): UserSyncStatus {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    storeUser()
      .then((id) => {
        if (!cancelled) setUserId(id);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      setUserId(null);
      setFailed(false);
    };
  }, [isAuthenticated, storeUser]);

  if (isLoading) return "loading";
  if (!isAuthenticated) return "unauthenticated";
  if (failed) return "error";
  return userId === null ? "loading" : "ready";
}
