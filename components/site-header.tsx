"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

const NAV_LINKS = [
  { href: "/tools", label: "Browse tools" },
  { href: "/my/listings", label: "My listings" },
  { href: "/my/requests", label: "My requests" },
  { href: "/my/incoming", label: "Incoming" },
];
const ADMIN_LINK = { href: "/admin", label: "Admin" };

export function SiteHeader() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const pendingIncoming = useQuery(api.loans.incomingPendingCount, isAuthenticated ? {} : "skip");
  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  // Showing the link is cosmetic; /admin and every admin function check the role server-side.
  const links = me?.role === "admin" ? [...NAV_LINKS, ADMIN_LINK] : NAV_LINKS;

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          LendLoop
        </Link>
        <Suspense>
          <Show when="signed-in">
            <nav aria-label="Main" className="flex flex-1 items-center gap-1 overflow-x-auto">
              {links.map((link) => {
                const active = pathname.startsWith(link.href);
                const badge = link.href === "/my/incoming" ? pendingIncoming : undefined;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                  >
                    {link.label}
                    {badge ? (
                      <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 font-medium text-primary-foreground">
                        {badge > 99 ? "99+" : badge}
                        <span className="sr-only"> pending</span>
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
            <UserButton />
          </Show>
          <Show when="signed-out">
            <div className="ml-auto">
              <SignInButton forceRedirectUrl="/tools" signUpForceRedirectUrl="/tools">
                <Button variant="outline">Sign in</Button>
              </SignInButton>
            </div>
          </Show>
        </Suspense>
      </div>
    </header>
  );
}
