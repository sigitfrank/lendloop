import type { Category, ToolIcon } from "@/convex/lib/validators";
import { TOOL_ICON_OPTIONS, toolIconName } from "@/lib/tool-icons";
import { cn } from "@/lib/utils";

/** A tool's icon in a tinted tile (its own pick, or its category's default). */
export function ToolIconTile({
  tool,
  size = "md",
}: {
  tool: { icon?: ToolIcon; category: Category };
  size?: "sm" | "md";
}) {
  const { icon: Icon } = TOOL_ICON_OPTIONS[toolIconName(tool)];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground",
        size === "sm" ? "size-8" : "size-10",
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}
