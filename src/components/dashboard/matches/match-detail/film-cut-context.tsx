"use client";

import { createContext, use, useMemo, type ReactNode } from "react";
import {
  DEFAULT_FILM_FILTERS,
  type FilmFilters,
} from "@/components/dashboard/matches/match-detail/film/filters/types";

/**
 * A "watch this cut" intent on its way from the report into the Video tab
 * (Advantage Intelligence UI T2, shared plumbing for T3/T5).
 *
 * The report's parts ask for a cut through `MatchReportActions.watchCut`; the
 * provider switches the URL to `?tab=film` and parks the cut here. The film
 * tab, once mounted, takes it, applies it over the default filters, seeks to
 * the first admitted point and CLEARS it — so the intent is honoured exactly
 * once. Leaving and re-entering the Video view finds nothing pending and keeps
 * whatever filters the viewer has set since.
 *
 * Its own context, like `film-head-context.tsx`, for the same two reasons: the
 * film subtree must not depend on `useMatchReport()` (`film-tab.tsx`'s header
 * comment — its own harness mounts it bare), and only the film tab reads it,
 * so a pending cut re-renders nothing else in the report.
 *
 * Only the cut travels. Which player "you" is stays with `applyFilmFilters`
 * and `useMatchSides()` inside the film tab (guardrails §4): a cut's
 * `outcome`/`server` axes are you/opp-relative and are resolved there, never
 * here.
 */

/** The film filters a pending cut produces: the defaults with the cut over them. */
export function mergeFilmCut(cut: Partial<FilmFilters>): FilmFilters {
  return { ...DEFAULT_FILM_FILTERS, ...cut };
}

/**
 * A statistic's cut, narrowed to the set the report is scoped to. The
 * Statistics cards count only `scopePoints(points, activeSet)`, so the points a
 * click opens must be the same ones: `set` filters on `point.setNumber`, the
 * field `scopePoints` reads. `null` (the whole match) is sent explicitly, so a
 * cut is always exactly what the card counted.
 */
export function scopeCut(
  cut: Partial<FilmFilters>,
  activeSet: number | null,
): Partial<FilmFilters> {
  return { ...cut, set: activeSet };
}

/**
 * Take a pending cut: the filters it asks for, and nothing left pending.
 * `null` in gives `null` out — there was nothing to consume. Pure, so the
 * once-only rule is checkable without a provider.
 */
export function consumeFilmCut(
  pending: Partial<FilmFilters> | null,
): { filters: FilmFilters; pending: null } | null {
  if (!pending) return null;
  return { filters: mergeFilmCut(pending), pending: null };
}

export interface PendingFilmCut {
  cut: Partial<FilmFilters>;
  /** Called by the film tab once the cut has been applied. */
  clear(): void;
}

const PendingCutContext = createContext<Partial<FilmFilters> | null>(null);
const ClearCutContext = createContext<(() => void) | null>(null);

/**
 * Controlled: `MatchReportProvider` owns the pending value (its `watchCut`
 * action is the only writer) and hands it in with the clear the film tab
 * calls after applying it. `cut` is `null` whenever nothing is pending.
 */
export function FilmCutProvider({
  cut,
  onClear,
  children,
}: {
  cut: Partial<FilmFilters> | null;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <ClearCutContext value={onClear}>
      <PendingCutContext value={cut}>{children}</PendingCutContext>
    </ClearCutContext>
  );
}

/**
 * The pending cut for the film tab, or `null` when nothing is pending — and
 * `null` outside a provider too (the playback test harness mounts the tab
 * bare, exactly as `usePublishFilmHead` tolerates).
 */
export function usePendingFilmCut(): PendingFilmCut | null {
  const cut = use(PendingCutContext);
  const clear = use(ClearCutContext);
  return useMemo(() => (cut && clear ? { cut, clear } : null), [cut, clear]);
}

/**
 * A chart segment's click/keyboard wiring, when it opens a film cut.
 *
 * `watch` is `undefined` whenever there's no playable video, in which case
 * every attribute here is `undefined` too, so the segment renders as inert,
 * read-only markup. Shared by `point-endings-card.tsx` and
 * `rally-length-card.tsx` — both bars behave identically here, only their
 * segment shape and fill differ.
 */
export function watchableSegmentProps(
  watch: (() => void) | undefined,
  label: string,
): {
  role: "button" | undefined;
  "aria-label": string;
  onClick: (() => void) | undefined;
  onKeyDown: ((e: React.KeyboardEvent) => void) | undefined;
} {
  return {
    role: watch ? "button" : undefined,
    "aria-label": watch ? `${label} Watch in Video` : label,
    onClick: watch,
    onKeyDown: watch
      ? (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            watch();
          }
        }
      : undefined,
  };
}
