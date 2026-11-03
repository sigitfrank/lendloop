import { Show, SignInButton } from "@clerk/nextjs";
import { preloadQuery } from "convex/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { PublicToolList } from "@/components/public-tool-list";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

// Server-rendered for a fast first paint; the list stays live on the client.
export default async function Home() {
  const preloadedTools = await preloadQuery(api.tools.listPublic, {});

  return (
    <div className="space-y-12">
      <section className="space-y-5 pt-6 sm:pt-12">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Borrow what you need. Lend what you don&apos;t.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          LendLoop is a neighbourhood board for sharing tools: drills, ladders, tents,
          stand mixers. Fewer things bought, more things used.
        </p>
        <Suspense>
          <Show when="signed-out">
            <SignInButton forceRedirectUrl="/tools" signUpForceRedirectUrl="/tools">
              <Button size="lg" className="h-10 px-5">
                Sign in to lend or borrow
              </Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Button asChild size="lg" className="h-10 px-5">
              <Link href="/tools">Browse tools</Link>
            </Button>
          </Show>
        </Suspense>
      </section>

      <section aria-labelledby="available-heading" className="space-y-4">
        <h2 id="available-heading" className="text-lg font-semibold">
          On the board right now
        </h2>
        <PublicToolList preloadedTools={preloadedTools} />
      </section>
    </div>
  );
}
