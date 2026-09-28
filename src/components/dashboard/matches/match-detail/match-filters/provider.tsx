"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { MatchPoint } from "@/lib/data/match-points-server";

import {
  applyMatchFilters,
  buildFilterContext,
  EMPTY_MATCH_FILTERS,
  filtersEqual,
  hasActiveMatchFilters,
  MATCH_FILTERS_PARAM,
  matchFiltersQuery,
  parseMatchFilters,
  type MatchFilterContext,
  type MatchFilters,
} from "./model";

/**
 * The match report's applied filters — the Video view's filter state, held
 * ABOVE the view switch. The Statistics view never reads them: it is always
 * the whole match (the product owner's call — filters live on the Video tab
 * alone).
 *
 * ── Why here and not in a view ───────────────────────────────────────────
 * `MatchReportWhen` unmounts an inactive view, so state kept inside
 * `FilmTab` would reset on every switch. The report page
 * (`matches/(detail)/[matchId]/page.tsx`) mounts this provider around
 * `MatchReportProvider`, so the filters outlive a trip to Statistics or
 * Visualizations and back. The public `/m/[token]` page (Statistics only)
 * mounts none.
 *
 * ── The URL mirror ──────────────────────────────────────────────────────
 * One search param, `MATCH_FILTERS_PARAM` (`?f=`), in `serializeMatchFilters`'
 * compact form, and absent when nothing is filtered. Both live in `model.ts`
 * so the Server Component pages can read the name: a constant exported from
 * this `"use client"` module would reach them as a client reference, not a
 * string. The param SEEDS the state once, from `initialQuery` — the value the Server Component page read off its own
 * `searchParams` — so the server render and the first client render agree and
 * there is no hydration mismatch, and this module never imports
 * `next/navigation` (film-player code must stay clear of it, and T7 moves the
 * Video view onto this provider). After that the state writes BACK with
 * `history.replaceState`, the same native-history approach as
 * `film-tab.tsx`'s `cut=`/`serve=` mirror: Next keeps `useSearchParams` in
 * sync, nothing refetches, and every other parameter (`tab`, `cut`, the
 * Visualizations keys) is carried through. `parseMatchFilters` never throws,
 * so a hand-edited or stale `?f=` reads as whatever it validly names — and is
 * rewritten to that canonical form, or dropped.
 *
 * Back/Forward restore the `?f=` of the entry they land on (`popstate`), so
 * the Video list never disagrees with the address bar.
 *
 * ── Player attribution (docs/ui-revamp-guardrails.md §4) ─────────────────
 * The filters are you/opponent-relative and resolve to a seat through
 * `useMatchSides().you.isPlayer1` — the exact read every card on this page
 * makes — handed to `buildFilterContext`. Nothing here looks at player order.
 */

export interface MatchFiltersValue {
  /** The applied filters. `EMPTY_MATCH_FILTERS` when nothing is filtered. */
  filters: MatchFilters;
  /** Replace the applied filters. An equal set is a no-op (no re-render). */
  setFilters: (next: MatchFilters) => void;
  /** Back to the whole match. */
  clearFilters: () => void;
  /**
   * The match's points that pass `filters`, in match order. With no active
   * filter this IS `useMatchData().points` (same array), so cards memoized on
   * it do not recompute.
   */
  filteredPoints: MatchPoint[];
  /** Whether any filter is applied — the cards' "derive from points" gate. */
  filtersActive: boolean;
  /** The context `filteredPoints` was computed with (option availability). */
  context: MatchFilterContext;
}

const MatchFiltersContext = createContext<MatchFiltersValue | null>(null);

/** The raw param value a Server Component page hands down. */
export type MatchFiltersQuery = string | string[] | undefined;

/** `searchParams[MATCH_FILTERS_PARAM]` → one string (first of a repeat). */
function firstValue(raw: MatchFiltersQuery): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function readLocationFilters(): MatchFilters {
  return parseMatchFilters(
    new URLSearchParams(window.location.search).get(MATCH_FILTERS_PARAM),
  );
}

interface MatchFiltersProviderProps {
  /** `searchParams[MATCH_FILTERS_PARAM]`, read by the Server Component page. */
  initialQuery?: MatchFiltersQuery;
  children: ReactNode;
}

export function MatchFiltersProvider({
  initialQuery,
  children,
}: MatchFiltersProviderProps) {
  const { match, points } = useMatchData();
  const youIsPlayer1 = useMatchSides().you.isPlayer1;
  const context = useMemo(
    () => buildFilterContext(match, points, youIsPlayer1),
    [match, points, youIsPlayer1],
  );
  const [filters, setFiltersState] = useState<MatchFilters>(() =>
    parseMatchFilters(firstValue(initialQuery)),
  );

  const setFilters = useCallback((next: MatchFilters) => {
    setFiltersState((prev) => (filtersEqual(prev, next) ? prev : next));
  }, []);
  const clearFilters = useCallback(
    () => setFilters(EMPTY_MATCH_FILTERS),
    [setFilters],
  );

  // Mirror into the URL. Reads `window.location.search` rather than a hook
  // snapshot so it never races another writer (the film tab's `cut=`), skips
  // when already equal, and has no cleanup — unmount leaves the URL alone.
  // `null` state, never `window.history.state`: Next's patched
  // `replaceState` copies its own internals over a null, but passes a state
  // already carrying `__NA` straight through WITHOUT syncing
  // `useSearchParams` — and `MatchReportProvider` builds the next view's URL
  // from that hook, so it would drop `?f=` on the next view switch.
  useEffect(() => {
    const current = window.location.search.replace(/^\?/, "");
    const next = matchFiltersQuery(current, filters);
    if (next === current) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`,
    );
  }, [filters]);

  // Back/Forward land on an entry whose `?f=` may differ from the state.
  useEffect(() => {
    const onPopState = () => setFilters(readLocationFilters());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setFilters]);

  const filteredPoints = useMemo(
    () => applyMatchFilters(points, filters, context),
    [points, filters, context],
  );
  const filtersActive = hasActiveMatchFilters(filters);

  const value = useMemo<MatchFiltersValue>(
    () => ({
      filters,
      setFilters,
      clearFilters,
      filteredPoints,
      filtersActive,
      context,
    }),
    [filters, setFilters, clearFilters, filteredPoints, filtersActive, context],
  );

  return <MatchFiltersContext value={value}>{children}</MatchFiltersContext>;
}

const noop = () => {};

/**
 * The applied filters, for any client component under `MatchDataProvider`.
 *
 * Without a `MatchFiltersProvider` above it (a harness, an offline spec) it
 * answers "nothing filtered": every point, `filtersActive` false, and a setter
 * that does nothing — never a throw, so a card renders the whole match rather
 * than crashing.
 */
export function useMatchFilters(): MatchFiltersValue {
  const provided = use(MatchFiltersContext);
  // Read unconditionally (hook order), used only when there is no provider.
  // The fallback's context carries no hands: nothing is filtered, so nothing
  // ever consults them, and building them would walk every shot per card.
  const { points } = useMatchData();
  const youIsPlayer1 = useMatchSides().you.isPlayer1;
  const fallback = useMemo<MatchFiltersValue>(
    () => ({
      filters: EMPTY_MATCH_FILTERS,
      setFilters: noop,
      clearFilters: noop,
      filteredPoints: points,
      filtersActive: false,
      context: { youIsPlayer1, hands: { player1: null, player2: null } },
    }),
    [points, youIsPlayer1],
  );
  return provided ?? fallback;
}
