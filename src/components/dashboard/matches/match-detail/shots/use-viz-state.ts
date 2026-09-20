"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyVizUpdate,
  parseVizState,
  vizStateQuery,
  type VizState,
} from "./viz-url";

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
 *
 * `router.replace` is a transition: `useSearchParams()` keeps returning the
 * OLD params until it commits. Two `setState` calls made in that window used
 * to each build `next` from the same stale `state`, so the second silently
 * overwrote the first (e.g. a filter pill's `ball` change lost under a
 * ~500ms-later `zone` change). This hook fixes that with two ref-backed
 * pieces of bookkeeping, both only ever touched from `setState` (an event
 * handler) or the resync effect below — never read during render, since a
 * ref read/write in the render body itself breaks React's rendering
 * contract:
 *
 * - `intendedRef` — the latest state callers have ASKED for, updated
 *   synchronously the instant `setState` runs, so a second `setState` made
 *   before the first's navigation commits composes onto it via
 *   `applyVizUpdate` instead of a stale closure. Callers that derive `next`
 *   from current state must pass an updater `(prev) => …` to see this value
 *   as `prev`.
 * - `ownQueriesRef` — every query string this hook has itself asked the
 *   router for. Lets the resync effect tell "our own `router.replace`
 *   committing" apart from a genuine external navigation, so a slower own
 *   request that finally lands after a newer one doesn't get mistaken for
 *   outside state and stomp `intendedRef` back to the older value.
 *
 * `state` (returned) is the OPTIMISTIC value: set the instant `setState`
 * runs, before `router.replace` commits, so pressed pills/tokens/counts/the
 * court reflect the click immediately. It's seeded from the parsed URL via
 * `useState`'s initializer, so the first render matches the URL exactly —
 * no hydration mismatch.
 *
 * When the URL changes to a query this hook did NOT itself request —
 * back/forward, a `court-tile.tsx` `<Link>`, any outside navigation — that
 * external state wins: both refs resync to it in an effect keyed on the
 * serialized query string (not object identity, since a re-parsed VizState
 * is a new object every render even when nothing changed).
 */
export function useVizState(): {
  state: VizState;
  setState: (next: VizState | ((prev: VizState) => VizState)) => void;
  hrefFor: (next: VizState) => string;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const urlState = parseVizState(searchParams);

  const [state, setRenderedState] = useState<VizState>(urlState);
  const intendedRef = useRef<VizState>(urlState);
  const ownQueriesRef = useRef<Set<string>>(new Set([query]));

  useEffect(() => {
    if (ownQueriesRef.current.has(query)) {
      return;
    }
    // An external navigation landed — it wins over whatever this hook last
    // intended.
    intendedRef.current = urlState;
    ownQueriesRef.current = new Set([query]);

    setRenderedState(urlState);
    // `urlState` is derived from `query` within the same render that
    // produced it, so re-running only when `query` changes is correct —
    // adding `urlState` itself would fire on every render (new object).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function hrefFor(next: VizState): string {
    const q = vizStateQuery(searchParams, next);
    return q ? `${pathname}?${q}` : pathname;
  }

  function setState(next: VizState | ((prev: VizState) => VizState)): void {
    const resolved = applyVizUpdate(intendedRef.current, next);
    intendedRef.current = resolved;

    const q = vizStateQuery(searchParams, resolved);
    ownQueriesRef.current.add(q);

    setRenderedState(resolved);
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  return { state, setState, hrefFor };
}
