import { LayoutGrid, Rows3 } from "lucide-react";
import Link from "next/link";
import { listHref, type ListParams, type ViewMode } from "@/lib/list-params";

const OPTIONS: { value: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "table", label: "Table", icon: Rows3 },
];

/** Grid/table switch stored in the URL. Hidden on phones, where tables show as cards. */
export function ViewToggle({ pathname, params }: { pathname: string; params: ListParams }) {
  return (
    <div
      role="group"
      aria-label="View"
      className="hidden shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5 sm:flex"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Link
          key={value}
          href={listHref(pathname, params, { view: value })}
          aria-pressed={params.view === value}
          scroll={false}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </div>
  );
}
