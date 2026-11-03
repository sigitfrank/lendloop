import { Bot } from "lucide-react";
import { headers } from "next/headers";
import { ConnectClaude } from "@/components/connect-claude";
import { PageHeader } from "@/components/page-header";

export default async function ConnectPage() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Bot}
        title="Connect Claude"
        description="Let Claude browse, lend and borrow tools for you, signed in as you."
      />
      <ConnectClaude mcpUrl={`${proto}://${host}/mcp`} />
    </div>
  );
}
