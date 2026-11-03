"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleAlert, CircleCheck, Copy, Loader } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/icon-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";

const TOOLS = [
  ["search_tools", "Browse tools and their availability"],
  ["list_my_listings", "Your listings"],
  ["list_my_requests", "Loans you asked for"],
  ["list_incoming_requests", "Requests for your tools"],
  ["create_listing", "List a tool"],
  ["request_borrow", "Ask to borrow a tool"],
  ["cancel_request", "Cancel your pending request"],
  ["respond_to_request", "Approve or decline a request"],
  ["mark_returned", "Confirm a tool came back"],
  ["admin_list_loans", "All loans (admins only)"],
] as const;

const STATUS = {
  ok: { icon: CircleCheck, className: "text-success", label: "Done" },
  error: { icon: CircleAlert, className: "text-danger", label: "Failed" },
  started: { icon: Loader, className: "text-muted-foreground", label: "Running" },
} as const;

function CopyLine({ value }: { value: string }) {
  async function copy() {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 py-1 pr-1 pl-3">
      <code className="flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">{value}</code>
      <IconButton icon={Copy} label="Copy" onClick={copy} />
    </div>
  );
}

function RecentCalls({
  calls,
  now,
}: {
  calls: FunctionReturnType<typeof api.mcp.myRecentCalls> | undefined;
  now: number;
}) {
  if (calls === undefined) return <p className="text-muted-foreground">Loading…</p>;
  if (calls.length === 0) return <p className="text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="space-y-2" aria-label="Recent Claude actions">
      {calls.map((call) => {
        const status = STATUS[call.status];
        return (
          <li key={call._id} className="flex items-start gap-2">
            <status.icon
              className={cn("mt-0.5 size-4 shrink-0", status.className)}
              aria-label={status.label}
            />
            <div className="min-w-0 flex-1">
              <code className="font-mono text-xs">{call.tool}</code>
              {call.error && <p className="text-xs text-muted-foreground">{call.error}</p>}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(call._creationTime, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ConnectClaude({ mcpUrl }: { mcpUrl: string }) {
  const calls = useQuery(api.mcp.myRecentCalls);
  const now = useNow();

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Claude Code</CardTitle>
            <CardDescription>
              No API key needed. You sign in with your LendLoop account in the browser, and Claude
              can do exactly what you can do here, nothing more.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="list-decimal space-y-3 pl-5">
              <li className="space-y-2">
                <p>Add LendLoop as an MCP server:</p>
                <CopyLine value={`claude mcp add --transport http lendloop ${mcpUrl}`} />
              </li>
              <li>
                In Claude Code, run <code className="font-mono text-xs">/mcp</code>, pick{" "}
                <b>lendloop</b> and sign in. Approve access in the browser window that opens.
              </li>
              <li>
                Ask something like <i>“Find a drill I can borrow this weekend”</i> or{" "}
                <i>“Approve the pending request for my ladder”</i>.
              </li>
            </ol>
            <p className="text-muted-foreground">
              To disconnect, choose <b>Clear authentication</b> in the{" "}
              <code className="font-mono text-xs">/mcp</code> menu.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claude Desktop and claude.ai</CardTitle>
            <CardDescription>
              Settings → Connectors → Add custom connector, with this URL. Claude connects from the
              internet, so the app must be reachable over HTTPS (deployed, or through a tunnel), not
              localhost.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyLine value={mcpUrl} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>What Claude can do</CardTitle>
            <CardDescription>
              Every action runs as you, with the same checks as the app. Max 60 per minute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {TOOLS.map(([name, text]) => (
                <li key={name} className="flex flex-wrap items-baseline gap-x-2">
                  <code className="font-mono text-xs">{name}</code>
                  <span className="text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>The last 20 actions Claude took for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentCalls calls={calls} now={now} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
