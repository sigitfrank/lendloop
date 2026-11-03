"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEARCH_MAX, type ToolSort } from "@/convex/lib/validators";
import { SORT_OPTIONS } from "@/lib/labels";
import { listHref, type ListParams } from "@/lib/list-params";

const SEARCH_DEBOUNCE_MS = 300;

/** Search box + sort select. Both write to the URL; the server does the work. */
export function ListToolbar({
  pathname,
  params,
  searchLabel,
}: {
  pathname: string;
  params: ListParams;
  searchLabel: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(params.q ?? "");
  const searching = Boolean(params.q);

  // Debounce typing, then update ?q= without adding a history entry per keystroke.
  useEffect(() => {
    const next = search.trim() || undefined;
    if (next === params.q) return;
    const timer = setTimeout(() => {
      router.replace(listHref(pathname, params, { q: next }), { scroll: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, params, pathname, router]);

  return (
    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          maxLength={SEARCH_MAX}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="pl-8"
        />
      </div>
      <Select
        value={searching ? "relevance" : params.sort}
        onValueChange={(value) =>
          router.replace(listHref(pathname, params, { sort: value as ToolSort }), {
            scroll: false,
          })
        }
        disabled={searching}
      >
        <SelectTrigger aria-label="Sort" className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {searching && <SelectItem value="relevance">Best match</SelectItem>}
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
