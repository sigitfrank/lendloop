import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NumberedPages } from "@/hooks/use-numbered-pages";

/** Previous · 1 2 3 · Next, plus "Showing 13–24". */
export function PaginationControls({ pages }: { pages: NumberedPages }) {
  const { page, rows, start, pageCount, hasNext, waiting, goTo } = pages;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {rows.length > 0 && `Showing ${start + 1}–${start + rows.length}`}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => goTo(page - 1)} disabled={page === 1}>
          <ChevronLeft aria-hidden /> Previous
        </Button>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <Button
            key={n}
            size="sm"
            variant={n === page ? "default" : "ghost"}
            aria-current={n === page ? "page" : undefined}
            onClick={() => goTo(n)}
            className="min-w-8"
          >
            {n}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(page + 1)}
          disabled={!hasNext || waiting}
        >
          Next <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
