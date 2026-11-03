"use client";

import { TOOL_ICONS, type ToolIcon } from "@/convex/lib/validators";
import { TOOL_ICON_OPTIONS } from "@/lib/tool-icons";

const optionClass =
  "flex size-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-checked:border-primary aria-checked:bg-accent aria-checked:text-accent-foreground";

/**
 * Icon choice for a tool. Nothing selected (undefined) means the category's
 * default icon is shown. Clicking the selected icon again clears it.
 */
export function IconPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: ToolIcon;
  onChange: (icon: ToolIcon | undefined) => void;
}) {
  return (
    <div id={id} role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
      {TOOL_ICONS.map((name) => {
        const { icon: Icon, label } = TOOL_ICON_OPTIONS[name];
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={selected ? `${label} (click again to clear)` : label}
            onClick={() => onChange(selected ? undefined : name)} // toggle
            className={optionClass}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
