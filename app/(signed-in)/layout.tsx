import { auth } from "@clerk/nextjs/server";
import { UserReady } from "@/components/user-ready";

// Everything in this route group needs a session. This redirect is for UX only;
// every Convex function still checks identity and permissions itself.
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <UserReady>{children}</UserReady>;
}
