"use client";

import { SignOutButton } from "@clerk/nextjs";
import { useStoreUser } from "@/hooks/use-store-user";

/** Renders signed-in pages only after the caller's Convex user row exists. */
export function UserReady({ children }: { children: React.ReactNode }) {
  const status = useStoreUser();

  if (status === "unauthenticated") {
    return (
      <div className="p-8 space-y-3 text-sm" role="alert">
        <p>We couldn&apos;t connect your account. Please sign out and sign in again.</p>
        <SignOutButton redirectUrl="/">
          <button className="rounded-md border px-3 py-1.5">Sign out</button>
        </SignOutButton>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <p className="p-8 text-sm text-neutral-500" aria-live="polite">
        Loading your account…
      </p>
    );
  }

  return <>{children}</>;
}
