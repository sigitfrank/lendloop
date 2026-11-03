"use client";

import { SignOutButton } from "@clerk/nextjs";
import { ToolGridSkeleton } from "@/components/tool-grid-skeleton";
import { Button } from "@/components/ui/button";
import { useStoreUser } from "@/hooks/use-store-user";

/** Renders signed-in pages only after the caller's Convex user row exists. */
export function UserReady({ children }: { children: React.ReactNode }) {
  const status = useStoreUser();

  if (status === "error") {
    return (
      <div className="space-y-3 text-sm" role="alert">
        <p>We couldn&apos;t load your account. Check your connection and try again.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="space-y-3 text-sm" role="alert">
        <p>We couldn&apos;t connect your account. Please sign out and sign in again.</p>
        <SignOutButton redirectUrl="/">
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>
    );
  }

  if (status === "loading") {
    return <ToolGridSkeleton count={3} />;
  }

  return <>{children}</>;
}
