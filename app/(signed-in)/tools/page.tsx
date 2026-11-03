import { UserButton } from "@clerk/nextjs";

// Temporary page to verify sign-in + user sync. Replaced by the tools list in the next step.
export default function ToolsPage() {
  return (
    <main className="p-8 flex items-center gap-4">
      <UserButton />
      <p>Signed in. Your LendLoop account is ready.</p>
    </main>
  );
}
