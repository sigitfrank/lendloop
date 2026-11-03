import type { Category, Condition, ToolSort } from "@/convex/lib/validators";

export const SORT_OPTIONS: { value: ToolSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
];

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "power_tools", label: "Power tools" },
  { value: "hand_tools", label: "Hand tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "cleaning", label: "Cleaning" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
];

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "worn", label: "Worn" },
];

export function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function conditionLabel(condition: Condition): string {
  return CONDITIONS.find((c) => c.value === condition)?.label ?? condition;
}

export function isCategory(value: string | undefined): value is Category {
  return CATEGORIES.some((c) => c.value === value);
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-11-12" → "12 Nov" */
export function formatDay(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate}T00:00:00Z`));
}
