"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/tools", label: "Browse tools" },
  { href: "/my/listings", label: "My listings" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          LendLoop
        </Link>
        <Suspense>
          <Show when="signed-in">
            <nav aria-label="Main" className="flex flex-1 items-center gap-1 overflow-x-auto">
              {NAV_LINKS.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                  >
                    {link.label}
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
