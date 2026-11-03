import type { FunctionReturnType } from "convex/server";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConditionMeter } from "@/components/condition-meter";
import { AvailabilityBadge, TrustedLenderBadge } from "@/components/status-badges";
import type { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/labels";

export type ToolCardData = FunctionReturnType<typeof api.tools.list>["page"][number];

export function ToolCard({
  tool,
  showLender = true,
  actions,
}: {
  tool: ToolCardData;
  /** Show who lends it. Off on My listings, where every card is the viewer's. */
  showLender?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{tool.name}</CardTitle>
          <AvailabilityBadge availability={tool.availability} />
        </div>
        <p className="text-xs text-muted-foreground">{categoryLabel(tool.category)}</p>
        <ConditionMeter condition={tool.condition} />
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {tool.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{tool.description}</p>
        )}
        {showLender && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{tool.isOwn ? "Your listing" : `Lent by ${tool.owner.firstName}`}</span>
            {tool.owner.trustedLender && <TrustedLenderBadge />}
          </div>
        )}
      </CardContent>
      {actions && <CardFooter className="justify-end gap-1">{actions}</CardFooter>}
    </Card>
  );
}
