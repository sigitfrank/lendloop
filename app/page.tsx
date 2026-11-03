import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";

// Temporary landing page to verify Clerk. Replaced by the public tool list in the next step.
export default function Home() {
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">LendLoop</h1>
      <p>Borrow what you need. Lend what you don&apos;t.</p>
      <Suspense>
        <Show when="signed-out">
          <SignInButton forceRedirectUrl="/tools" signUpForceRedirectUrl="/tools">
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-white">
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link href="/tools" className="underline">
            Go to tools
          </Link>
        </Show>
      </Suspense>
    </main>
  );
}
