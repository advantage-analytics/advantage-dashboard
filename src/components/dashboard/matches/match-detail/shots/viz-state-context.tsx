"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyVizUpdate,
  parseVizState,
  reconcileVizState,
  vizStateQuery,
  type VizState,
} from "./viz-url";

interface VizStateContextValue {
  state: VizState;
  setState: (next: VizState | ((prev: VizState) => VizState)) => void;
  hrefFor: (next: VizState) => string;
}

const VizStateContext = createContext<VizStateContextValue | null>(null);

/**
 * The Visualizations tab's client-side URL binding: `useSearchParams()` in,
 * `router.replace` out. Reads the ONE store `VizStateProvider` mounts —
 * every call site (filters popover, applied strip, chart/cut menus, the
 * focused view, the wall, the saved-views band) shares this same state, so a
 * click in one no longer races a click in another.
 *
 * `hrefFor` returns the same string without navigating, for `<Link href>`
 * tiles (`court-tile.tsx`) that should be crawlable/openable in a new tab
 * rather than only clickable.
 *
 * Before this file existed, each call site called `useVizState()` directly
 * and got its OWN `useState`/ref/effect trio — see this file's git history
 * (`use-viz-state.ts`) for the single-hook version. Two instances agreeing
 * with the URL individually is not the same as agreeing with EACH OTHER: a
 * click in the Filters popover followed quickly by removing a token in the
 * Applied strip could still drop one edit, because the strip's instance
 * resolved its updater against its own stale ref, and when the merged URL
 * landed, the popover's instance treated it as an external navigation and
 * stomped its own optimistic state. Lifting the store into a provider fixes
 * this the same way lifting any duplicated `useState` does: one owner, many
 * readers.
 */
export function useVizState(): VizStateContextValue {
  const ctx = use(VizStateContext);
  if (!ctx) {
    throw new Error(
      "useVizState must be used within a VizStateProvider. Mount " +
        "<VizStateProvider> once, around the Visualizations tab's tree " +
        "(shots-tab.tsx) — every reader below it shares that one store; " +
        "do not mount a second provider or call useVizState above it.",
    );
  }
  return ctx;
}

/**
 * Owns the ONE store `useVizState()` reads: the intended-state ref, the
 * optimistic mirror, the own-queries bookkeeping and the URL re-sync effect,
 * plus `router.replace`. Mount exactly once, around the tab's tree
 * (`shots-tab.tsx`) — every descendant reading `useVizState()` shares this
 * same instance, so a change made through one call site is immediately
 * visible to every other, both optimistically and once the URL settles.
 *
 * `router.replace` (not `push`) so filter/cut changes don't pile up the
 * browser history — matching `vizStateQuery`'s own "one state, one URL"
 * design. `{ scroll: false }` keeps the tab's scroll position across a state
 * change, same as `match-report-context.tsx`'s view switch.
 *
 * `router.replace` is a transition: `useSearchParams()` keeps returning the
 * OLD params until it commits. Two `setState` calls made in that window
 * would each build `next` from the same stale `state` if `state` were the
 * only bookkeeping — so this store keeps two ref-backed pieces, both only
 * ever touched from `setState` (an event handler) or the resync effect below
 * — never read during render, since a ref read/write in the render body
 * itself breaks React's rendering contract:
 *
 * - `intendedRef` — the latest state callers have ASKED for, updated
 *   synchronously the instant `setState` runs, so a second `setState` made
 *   before the first's navigation commits composes onto it via
 *   `applyVizUpdate` instead of a stale closure. Callers that derive `next`
 *   from current state must pass an updater `(prev) => …` to see this value
 *   as `prev`.
 * - `ownQueriesRef` — every query string this store has itself asked the
 *   router for, oldest first. `reconcileVizState` (`viz-url.ts`) is the pure
 *   rule that tells "our own `router.replace` committing" apart from a
 *   genuine external navigation, so a slower own request that finally lands
 *   after a newer one doesn't get mistaken for outside state and stomp
 *   `intendedRef` back to the older value.
 *
 * `state` (in the returned context value) is the OPTIMISTIC value: set the
 * instant `setState` runs, before `router.replace` commits, so pressed
 * pills/tokens/counts/the court reflect the click immediately. It's seeded
 * from the parsed URL via `useState`'s initializer, so the first render
 * matches the URL exactly — no hydration mismatch.
 *
 * When the URL changes to a query this store did NOT itself request —
 * back/forward, a `court-tile.tsx` `<Link>`, any outside navigation — that
 * external state wins: `reconcileVizState` is re-run in an effect keyed on
 * the serialized query string (not object identity, since a re-parsed
 * VizState is a new object every render even when nothing changed).
 */
export function VizStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const urlState = parseVizState(searchParams);

  const [state, setRenderedState] = useState<VizState>(urlState);
  const intendedRef = useRef<VizState>(urlState);
  const ownQueriesRef = useRef<string[]>([query]);

  useEffect(() => {
    const reconciled = reconcileVizState({
      urlQuery: query,
      ownQueries: ownQueriesRef.current,
      intended: intendedRef.current,
    });
    intendedRef.current = reconciled.state;
    ownQueriesRef.current = reconciled.ownQueries;
    setRenderedState(reconciled.state);
    // `urlState` is derived from `query` within the same render that
    // produced it, so re-running only when `query` changes is correct —
    // adding `urlState` itself would fire on every render (new object).
  }, [query]);

  // `hrefFor`/`setState` wrapped in `useCallback`, and the context value
  // itself in `useMemo` (review I1): every reader downstream of
  // `useVizState()` (the filters popover, applied strip, chart/cut menus, the
  // focused view, the wall, the saved-views band) sits below this ONE
  // provider, so a fresh `{ state, setState, hrefFor }` object on every
  // provider render — regardless of whether `state` itself changed — would
  // re-render every one of them on every keystroke/click anywhere in the
  // tree. `hrefFor` only closes over `pathname`/`searchParams`, and
  // `setState` only closes over refs (stable identity) plus
  // `pathname`/`searchParams`/`router` — none of which change on every
  // render — so both are cheap to keep referentially stable.
  const hrefFor = useCallback(
    (next: VizState): string => {
      const q = vizStateQuery(searchParams, next);
      return q ? `${pathname}?${q}` : pathname;
    },
    [pathname, searchParams],
  );

  const setState = useCallback(
    (next: VizState | ((prev: VizState) => VizState)): void => {
      const resolved = applyVizUpdate(intendedRef.current, next);
      intendedRef.current = resolved;

      const q = vizStateQuery(searchParams, resolved);
      ownQueriesRef.current = [...ownQueriesRef.current, q];

      setRenderedState(resolved);
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const value = useMemo(
    () => ({ state, setState, hrefFor }),
    [state, setState, hrefFor],
  );

  return <VizStateContext value={value}>{children}</VizStateContext>;
}
