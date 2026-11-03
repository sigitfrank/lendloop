import { ConditionMeter } from "@/components/condition-meter";
import { ToolIconTile } from "@/components/tool-icon";
import { AvailabilityBadge, TrustedLenderBadge } from "@/components/status-badges";
import type { ToolCardData } from "@/components/tool-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoryLabel } from "@/lib/labels";

export function ToolTable({
  tools,
  showLender,
  renderActions,
}: {
  tools: ToolCardData[];
  showLender: boolean;
  renderActions?: (tool: ToolCardData) => React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="pl-4">Tool</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Availability</TableHead>
            {showLender && <TableHead>Lender</TableHead>}
            {renderActions && <TableHead className="pr-4 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((tool) => (
            <TableRow key={tool._id}>
              <TableCell className="max-w-80 pl-4">
                <div className="flex items-center gap-3">
                  <ToolIconTile tool={tool} size="sm" />
                  <div className="min-w-0">
                    <div className="font-medium">{tool.name}</div>
                    {tool.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {tool.description}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {categoryLabel(tool.category)}
              </TableCell>
              <TableCell>
                <ConditionMeter condition={tool.condition} />
              </TableCell>
              <TableCell>
                <AvailabilityBadge availability={tool.availability} />
              </TableCell>
              {showLender && (
                <TableCell>
                  <div className="flex items-center gap-2">
                    {tool.isOwn ? "You" : tool.owner.firstName}
                    {tool.owner.trustedLender && <TrustedLenderBadge />}
                  </div>
                </TableCell>
              )}
              {renderActions && (
                <TableCell className="pr-4">
                  <div className="flex justify-end gap-1">{renderActions(tool)}</div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
