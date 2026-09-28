"use client";

import { createContext, use, useMemo, type ReactNode } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  applyMatchFilters,
  EMPTY_MATCH_FILTERS,
  hasActiveMatchFilters,
  MATCH_FILTER_KEYS,
  type MatchFilterContext,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * A "watch this cut" intent on its way from the report into the Video tab
 * (Advantage Intelligence UI T2; rewritten onto the shared match filters in
 * T7).
 *
 * The report's parts ask for a cut through `MatchReportActions.watchCut`; the
 * provider switches the URL to `?tab=film` and parks the cut here. The film
 * tab, once mounted, takes it, lays it OVER the shared match filters, seeks to
 * the first admitted point and CLEARS the intent — so it is honoured exactly
 * once. Leaving and re-entering the Video view finds nothing pending.
 *
 * ── What a cut is ────────────────────────────────────────────────────────
 * A `FilmCut` is a `Partial<MatchFilters>` — the same vocabulary as the
 * Video tab's filters — plus a few Film-only extras for what that vocabulary
 * cannot say without changing a count (`FilmCutExtras`). In Film it is ANDed
 * on top of the shared filters (`applyFilmCut`), named in the Video tab's
 * filter strip ("…, from Statistics"), and never written to `MatchFiltersProvider`: the Statistics tab and
 * the `?f=` URL know nothing about it. A card counts its "Watch all N" with
 * the very same predicate over the WHOLE match (`applyFilmCut(points,
 * points, …)`), since Statistics is never filtered; with no Video filter
 * applied, the points a click opens are exactly the points the card counted.
 *
 * Its own context, like `film-head-context.tsx`, for the same two reasons: the
 * film subtree must not depend on `useMatchReport()` (`film-tab.tsx`'s header
 * comment — its own harness mounts it bare), and only the film tab reads it,
 * so a pending cut re-renders nothing else in the report.
 *
 * Only the cut travels. Which player "you" is stays with the filter context
 * (`MatchFilterContext.youIsPlayer1`, from `useMatchSides()`, guardrails §4):
 * a cut's `server`/`resultPlayer` are you/opponent-relative and are resolved
 * there, never here.
 */

/* ── The cut ─────────────────────────────────────────────────────────────── */

/**
 * A result-type bucket the report's own tallies count by, which the shared
 * Result › Outcome cannot separate. Film only.
 *
 * - `ace` — `resultType` "Ace". Result › Winner (+ Serve) also admits every
 *   unreturned serve the video pipeline writes as "Service Winner", which the
 *   report counts as a winner, never an ace.
 * - `winner` — `resultType` containing "winner" (the published
 *   `LIKE '%Winner%'`), which leaves aces out: the report counts them on their
 *   own line, and Result › Winner would fold them back in.
 * - `unforced-error` — `resultType` containing "unforced error". Result › Error
 *   covers forced errors too, and video matches do not separate the two.
 * - `return-winner` — `isReturnWinner`: the return landed, the rally was at
 *   most two shots and it ended on a winner that is not a service winner.
 *   Result › Shot "Return" needs shot rows to find the return, and the
 *   statistic is read off the point's own serve/return columns.
 */
export type FilmCutEnding =
  "ace" | "winner" | "unforced-error" | "return-winner";

/** What a cut adds that `MatchFilters` cannot say. Film only. */
export interface FilmCutExtras {
  /**
   * Rallies of at least this many shots. With `rallyMax` a closed band — the
   * rally-length card's Short (1–4) and Medium (5–8). Either bound set drops
   * points with no recorded shot count (`rallyLength === 0`), as that card
   * does.
   */
  rallyMin?: number | null;
  /** Rallies of at most this many shots, or no upper bound. */
  rallyMax?: number | null;
  /** One of the report's own result-type buckets (see `FilmCutEnding`). */
  ending?: FilmCutEnding | null;
}

/** A statistic's cut: the shared vocabulary plus the Film-only extras. */
export type FilmCut = Partial<MatchFilters> & FilmCutExtras;

/** The extras' keys — every other key of a `FilmCut` is a `MatchFilters` key. */
export const FILM_CUT_EXTRA_KEYS: readonly (keyof FilmCutExtras)[] = [
  "rallyMin",
  "rallyMax",
  "ending",
];

/**
 * A cut on its way to the Video tab, and the words the filter strip reads —
 * the statistic's own label ("Aces · Stepanov", "Short rallies · 1–4 shots"),
 * so the strip names what was clicked rather than paraphrasing the predicate.
 */
export interface FilmCutIntent {
  cut: FilmCut;
  label: string;
}

/** The cut's `MatchFilters` part, over the empty filters. */
export function filmCutFilters(cut: FilmCut): MatchFilters {
  const out: Record<string, unknown> = { ...EMPTY_MATCH_FILTERS };
  for (const key of MATCH_FILTER_KEYS) {
    if (cut[key] !== undefined) out[key] = cut[key];
  }
  return out as unknown as MatchFilters;
}

function hasExtras(cut: FilmCut): boolean {
  return (
    (cut.rallyMin ?? null) !== null ||
    (cut.rallyMax ?? null) !== null ||
    (cut.ending ?? null) !== null
  );
}

/** Whether a cut narrows anything at all. `{}` (a whole-match row) does not. */
export function hasFilmCut(cut: FilmCut | null | undefined): boolean {
  if (!cut) return false;
  return hasActiveMatchFilters(filmCutFilters(cut)) || hasExtras(cut);
}

/**
 * The point ended on a winning return: the head-to-head card's Return winners
 * row counts exactly these (adding that the returner won the point), and the
 * `return-winner` ending admits exactly these. One definition, so the figure
 * and the points a click opens cannot drift apart. Moved here from
 * `film/filters/types.ts` (T7), whose model T8 deletes.
 */
export function isReturnWinner(point: MatchPoint): boolean {
  const result = point.secondShotResult;
  const type = (point.resultType ?? "").trim();
  return (
    result === "In" &&
    point.rallyLength > 0 &&
    point.rallyLength <= 2 &&
    /winner$/i.test(type) &&
    type !== "Service Winner"
  );
}

function matchesEnding(point: MatchPoint, ending: FilmCutEnding): boolean {
  const result = (point.resultType ?? "").trim().toLowerCase();
  switch (ending) {
    case "ace":
      return result === "ace";
    case "winner":
      return result.includes("winner");
    case "unforced-error":
      return result.includes("unforced error");
    case "return-winner":
      return isReturnWinner(point);
  }
}

/** Whether one point passes the cut's Film-only extras. */
export function matchesFilmCutExtras(point: MatchPoint, cut: FilmCut): boolean {
  const min = cut.rallyMin ?? null;
  const max = cut.rallyMax ?? null;
  if (min !== null || max !== null) {
    // 0 is "no shot count recorded", not a one-shot rally, so it belongs to
    // no bounded range — the same exclusion rally-length-card.tsx makes.
    if (point.rallyLength < 1) return false;
    if (min !== null && point.rallyLength < min) return false;
    if (max !== null && point.rallyLength > max) return false;
  }
  const ending = cut.ending ?? null;
  if (ending !== null && !matchesEnding(point, ending)) return false;
  return true;
}

/**
 * The cut laid over `base`: the points of `base` the cut also admits, in
 * `base`'s order. `base` is the Video list's shared filters' result
 * (`useMatchFilters().filteredPoints`), or the whole match for a Statistics
 * card's count; `points` is the WHOLE match in match
 * order, because the cut's `MatchFilters` part is evaluated over it (a
 * service court is a running count within each game, so it cannot be read
 * off a filtered subset). No cut, or an empty one, is `base` itself.
 *
 * The one predicate behind the Film list, ↑/↓, and every card's "Watch all N"
 * count — so the count and the list cannot disagree.
 */
export function applyFilmCut(
  points: MatchPoint[],
  base: MatchPoint[],
  cut: FilmCut | null | undefined,
  ctx: MatchFilterContext,
): MatchPoint[] {
  if (!cut || !hasFilmCut(cut)) return base;
  const filters = filmCutFilters(cut);
  const admitted = hasActiveMatchFilters(filters)
    ? new Set(applyMatchFilters(points, filters, ctx).map((p) => p.id))
    : null;
  return base.filter(
    (point) =>
      (admitted === null || admitted.has(point.id)) &&
      matchesFilmCutExtras(point, cut),
  );
}

/**
 * Take a pending cut: the cut it asks for, and nothing left pending. `null`
 * in gives `null` out — there was nothing to consume. Pure, so the once-only
 * rule is checkable without a provider. It returns the cut and never a
 * `MatchFilters` value: taking a cut changes nothing the shared provider
 * holds.
 */
export function consumeFilmCut(
  pending: FilmCutIntent | null,
): { intent: FilmCutIntent; pending: null } | null {
  if (!pending) return null;
  return { intent: pending, pending: null };
}

/* ── The pending intent ──────────────────────────────────────────────────── */

export interface PendingFilmCut {
  intent: FilmCutIntent;
  /** Called by the film tab once the cut has been applied. */
  clear(): void;
}

const PendingCutContext = createContext<FilmCutIntent | null>(null);
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
  cut: FilmCutIntent | null;
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
  const intent = use(PendingCutContext);
  const clear = use(ClearCutContext);
  return useMemo(
    () => (intent && clear ? { intent, clear } : null),
    [intent, clear],
  );
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
