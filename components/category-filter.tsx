import Link from "next/link";
import { CATEGORIES } from "@/lib/labels";
import { listHref, type ListParams } from "@/lib/list-params";

const OPTIONS = [{ value: undefined, label: "All" }, ...CATEGORIES];

/** Category chips; keeps the current search, sort and view. */
export function CategoryFilter({ params }: { params: ListParams }) {
  return (
    <nav aria-label="Filter by category" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {OPTIONS.map((option) => (
        <Link
          key={option.label}
          href={listHref("/tools", params, { category: option.value })}
          aria-current={option.value === params.category ? "page" : undefined}
          scroll={false}
          className="rounded-full border bg-card px-3 py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
