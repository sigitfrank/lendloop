/** Initials in a tinted circle ("Sara Lee" → "SL"). No photos are stored. */
export function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <span
      aria-hidden
      className={
        size === "sm"
          ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground"
          : "flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
      }
    >
      {initials || "?"}
    </span>
  );
}
