"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read and update the page's query string (?q=&sort=&status=…). Updates
 * replace the history entry, so filtering doesn't flood the back button.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return { params, update };
}
