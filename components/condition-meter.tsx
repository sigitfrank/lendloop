import type { Condition } from "@/convex/lib/validators";
import { cn } from "@/lib/utils";
import { conditionLabel } from "@/lib/labels";

const SEGMENTS = 4;

// Level (filled segments) and colour per condition, from the design tokens.
const LEVELS: Record<Condition, { filled: number; color: string }> = {
  new: { filled: 4, color: "bg-success" },
  good: { filled: 3, color: "bg-success" },
  fair: { filled: 2, color: "bg-warning" },
  worn: { filled: 1, color: "bg-danger" },
};

/** Battery-style condition indicator. The text label is always shown too. */
export function ConditionMeter({ condition }: { condition: Condition }) {
  const { filled, color } = LEVELS[condition];
  const label = conditionLabel(condition);

  return (
    <div
      role="meter"
      aria-label="Condition"
      aria-valuemin={1}
      aria-valuemax={SEGMENTS}
      aria-valuenow={filled}
      aria-valuetext={label}
      className="flex items-center gap-2"
    >
      <div className="flex gap-0.5" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={cn("h-2 w-4 rounded-full", i < filled ? color : "bg-border")} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
