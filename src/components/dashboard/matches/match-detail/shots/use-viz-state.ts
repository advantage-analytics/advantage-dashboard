"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseVizState, vizStateQuery, type VizState } from "./viz-url";

/**
 * The Visualizations tab's client-side URL binding: `useSearchParams()` in,
 * `router.replace` out. `hrefFor` returns the same string without navigating,
 * for `<Link href>` tiles (`court-tile.tsx`) that should be crawlable/openable
 * in a new tab rather than only clickable.
 *
 * `router.replace` (not `push`) so filter/cut changes don't pile up the
 * browser history — matching `vizStateQuery`'s own "one state, one URL"
 * design. `{ scroll: false }` keeps the tab's scroll position across a state
 * change, same as `match-report-context.tsx`'s view switch.
 */
export function useVizState(): {
  state: VizState;
  setState: (next: VizState) => void;
  hrefFor: (next: VizState) => string;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = parseVizState(searchParams);

  function hrefFor(next: VizState): string {
    const query = vizStateQuery(searchParams, next);
    return query ? `${pathname}?${query}` : pathname;
  }

  function setState(next: VizState): void {
    router.replace(hrefFor(next), { scroll: false });
  }

  return { state, setState, hrefFor };
}
