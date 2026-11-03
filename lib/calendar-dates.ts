// The calendar works with local Date objects; Convex stores "YYYY-MM-DD".
// Convert via the local Y/M/D parts (never toISOString, which shifts by timezone).

export function isoToLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function localDateToIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
