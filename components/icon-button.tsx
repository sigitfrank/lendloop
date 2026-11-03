"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Icon-only button with a tooltip. `label` is both the tooltip text and the
 * accessible name. Extra props (and ref) are forwarded to the <button>, so it
 * can be used as a Dialog/AlertDialog trigger via `asChild`.
 */
export function IconButton({
  icon: Icon,
  label,
  tone = "default",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "size" | "variant"> & {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "danger";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          className={
            tone === "danger"
              ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
              : undefined
          }
          {...props}
        >
          <Icon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
