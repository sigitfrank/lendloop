"use client";

import { X } from "lucide-react";
import { useUrlParams } from "@/hooks/use-url-params";
import type { FilterConfig } from "@/lib/list-config";

/** Removable chips for the active search and filters, plus "Clear all". */
export function ActiveFilters({ filters = [] }: { filters?: FilterConfig[] }) {
  const { params, update } = useUrlParams();

  const chips = [
    ...(params.get("q") ? [{ param: "q", label: `Search: “${params.get("q")}”` }] : []),
    ...filters.flatMap((filter) => {
      const value = params.get(filter.param);
      const option = filter.options.find((o) => o.value === value);
      return option ? [{ param: filter.param, label: `${filter.label}: ${option.label}` }] : [];
    }),
  ];

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.param}
          type="button"
          onClick={() => update({ [chip.param]: undefined })}
          aria-label={`Remove ${chip.label}`}
          className="flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1.5 pl-2.5 text-xs transition-colors hover:bg-muted"
        >
          {chip.label}
          <X className="size-3 text-muted-foreground" aria-hidden />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => update(Object.fromEntries(chips.map((c) => [c.param, undefined])))}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
