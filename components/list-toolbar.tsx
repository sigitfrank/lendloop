"use client";

import { ArrowUpDown, LayoutGrid, ListFilter, Rows3, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SEARCH_MAX } from "@/convex/lib/validators";
import { useUrlParams } from "@/hooks/use-url-params";
import type { FilterConfig, ListOption } from "@/lib/list-config";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search · Filters · Sort · Grid/Table for any list page. Every control writes
 * to the URL (other params are kept); the server does the actual work.
 */
export function ListToolbar({
  searchLabel,
  sortOptions,
  filters = [],
  viewToggle = false,
}: {
  /** Omit to hide the search box. */
  searchLabel?: string;
  /** Omit to hide the sort menu. */
  sortOptions?: ListOption[];
  filters?: FilterConfig[];
  viewToggle?: boolean;
}) {
  const { params, update } = useUrlParams();
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const searching = urlSearch !== "";

  // Debounce typing, then update ?q=.
  useEffect(() => {
    const next = search.trim();
    if (next === urlSearch) return;
    const timer = setTimeout(() => update({ q: next || undefined }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update reads the latest URL
  }, [search, urlSearch]);

  // Keep the box in sync when the search is cleared elsewhere ("Clear all", back button).
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch);
  if (urlSearch !== syncedUrlSearch) {
    setSyncedUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
      {searchLabel && (
        <div className="relative min-w-48 flex-1 lg:w-60 lg:flex-none">
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
            className="h-9 pl-8"
          />
        </div>
      )}

      {filters.length > 0 && <FiltersMenu filters={filters} />}
      {sortOptions && <SortMenu options={sortOptions} searching={searching} />}
      {viewToggle && <ViewSwitch />}
    </div>
  );
}

function FiltersMenu({ filters }: { filters: FilterConfig[] }) {
  const { params, update } = useUrlParams();
  const active = filters.filter((f) => params.get(f.param)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9">
          <ListFilter aria-hidden /> Filters
          {active > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">
              {active}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {filters.map((filter, i) => (
          <div key={filter.param}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={params.get(filter.param) ?? filter.options[0].value}
              onValueChange={(value) =>
                update({ [filter.param]: value === filter.options[0].value ? undefined : value })
              }
            >
              {filter.options.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortMenu({ options, searching }: { options: ListOption[]; searching: boolean }) {
  const { params, update } = useUrlParams();
  const current = params.get("sort") ?? options[0].value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9">
          <ArrowUpDown aria-hidden /> Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{searching ? "Sorted by best match" : "Sort by"}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={searching ? "" : current}
          onValueChange={(value) =>
            update({ sort: value === options[0].value ? undefined : value })
          }
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} disabled={searching}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const VIEWS = [
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "table", label: "Table view", icon: Rows3 },
] as const;

/** Grid/table switch. Hidden on phones, where tables always show as cards. */
function ViewSwitch() {
  const { params, update } = useUrlParams();
  const view = params.get("view") === "table" ? "table" : "grid";

  return (
    <div
      role="group"
      aria-label="View"
      className="hidden h-9 items-center rounded-lg border bg-card p-0.5 sm:flex"
    >
      {VIEWS.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              aria-pressed={view === value}
              onClick={() => update({ view: value === "grid" ? undefined : value })}
              className="size-7 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              <Icon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
