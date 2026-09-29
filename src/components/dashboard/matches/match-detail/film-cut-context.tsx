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
  type PlayerSide,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * A "watch this cut" intent on its way from the report into the Video tab
 * (Advantage Intelligence UI T2; rewritten onto the shared match filters in
 * T7).
 *
 * The report's parts ask for a cut through `MatchReportActions.watchCut`; the
 * provider switches the URL to `?tab=film` and parks the cut here. The film
 * tab, once mounted, takes it, lands it in the shared match filters (plus
 * the Film-only remainder), seeks to the first admitted point and CLEARS the
 * intent — so it is honoured exactly once. Leaving and re-entering the Video view finds nothing pending.
 *
 * ── What a cut is ────────────────────────────────────────────────────────
 * A `FilmCut` is a `Partial<MatchFilters>` — the same vocabulary as the
 * Video tab's filters — plus a few Film-only extras for what that vocabulary
 * cannot say without changing a count (`FilmCutExtras`). Landing splits it
 * (`landFilmCut`, `film/film-list-filters.ts`): the `MatchFilters` half is
 * WRITTEN into the shared filters (`MatchFiltersProvider`, mirrored to
 * `?f=`), key by key, so the filters drawer's pills show it pressed — the
 * Statistics tab is always the whole match, so nothing there moves. The
 * extras are the `FilmCutRemainder`: never pills (Result › Ending "error"
 * would widen "Unforced errors", "winner" fold the aces into "Winners"),
 * held beside the shared filters above the view switch and named in the
 * Video tab's filter strip ("…, from Statistics"). A card counts its "Watch
 * all N" with `applyFilmCut` over the WHOLE match (`applyFilmCut(points,
 * points, …)`); with no other Video filter applied, the points a click opens
 * are exactly the points the card counted.
 *
 * Its own context, like `film-head-context.tsx`, for the same two reasons: the
 * film subtree must not depend on `useMatchReport()` (`film-tab.tsx`'s header
 * comment — its own harness mounts it bare), and only the film tab reads it,
 * so a pending cut re-renders nothing else in the report.
 *
 * Only the cut travels. Which player "you" is stays with the filter context
 * (`MatchFilterContext.youIsPlayer1`, from `useMatchSides()`, guardrails §4):
 * a cut's `server`/`resultPlayer` are you/opponent-relative, and its
 * `resultOutcome` is read from the viewer's side; all are resolved there,
 * never here.
 */

/* ── The cut ─────────────────────────────────────────────────────────────── */

/**
 * A result-type bucket the report's own tallies count by, which the shared
 * Result › Ending cannot separate. Film only.
 *
 * - `winner` — `resultType` containing "winner" (the published
 *   `LIKE '%Winner%'`), which leaves aces out: the report counts them on their
 *   own line, and Result › Ending "winner" would fold them back in
 *   (`winnerHitBy` credits an ace to the server as a winner).
 * - `unforced-error` — `resultType` containing "unforced error". Result ›
 *   Ending "error" covers forced errors too, and video matches do not
 *   separate the two.
 *
 * Aces, return winners and the rally bands are exact shared filters (Serve ›
 * Result "Ace", Return › Result "Winner", Result › Rally length), so their
 * cuts are pure and land entirely as pills.
 */
export type FilmCutEnding = "winner" | "unforced-error";

/** What a cut adds that `MatchFilters` cannot say. Film only. */
export interface FilmCutExtras {
  /** One of the report's own result-type buckets (see `FilmCutEnding`). */
  ending?: FilmCutEnding | null;
}

/** A statistic's cut: the shared vocabulary plus the Film-only extras. */
export type FilmCut = Partial<MatchFilters> & FilmCutExtras;

/** The extras' keys — every other key of a `FilmCut` is a `MatchFilters` key. */
export const FILM_CUT_EXTRA_KEYS: readonly (keyof FilmCutExtras)[] = ["ending"];

/**
 * A cut on its way to the Video tab, and the words the filter strip reads —
 * the statistic's own label ("Aces · Stepanov", "Short rallies · 1–4 shots"),
 * so the strip names what was clicked rather than paraphrasing the predicate.
 */
export interface FilmCutIntent {
  cut: FilmCut;
  label: string;
}

/** `base` with every `MatchFilters` key the cut sets replaced by the cut's. */
export function overlayCutFilters(
  base: MatchFilters,
  cut: FilmCut,
): MatchFilters {
  const out: Record<string, unknown> = { ...base };
  for (const key of MATCH_FILTER_KEYS) {
    if (cut[key] !== undefined) out[key] = cut[key];
  }
  return out as unknown as MatchFilters;
}

/** The cut's `MatchFilters` part, over the empty filters. */
export function filmCutFilters(cut: FilmCut): MatchFilters {
  return overlayCutFilters(EMPTY_MATCH_FILTERS, cut);
}

/**
 * The cut's Film-only extras that are actually set (a `null` bound is no
 * bound), or `null` when it has none — a "pure" cut, every key of which is a
 * shared filter.
 */
export function filmCutExtras(cut: FilmCut): FilmCutExtras | null {
  const out: Record<string, unknown> = {};
  for (const key of FILM_CUT_EXTRA_KEYS) {
    const value = cut[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as FilmCutExtras) : null;
}

/**
 * What stays Film-only once a cut has landed: its extras and the statistic's
 * label the filter strip names them by. No `MatchFilters` key — landing
 * wrote that half into the shared filters, the only place it is evaluated.
 */
export interface FilmCutRemainder {
  label: string;
  extras: FilmCutExtras;
}

/**
 * A remainder as `MatchFiltersProvider` holds it, above the view switch:
 * plus `landed`, the shared filters its landing wrote — the strip reads
 * "Back to all points" only while the shared filters still equal it.
 */
export interface LandedFilmCut extends FilmCutRemainder {
  landed: MatchFilters;
}

/** Whether a cut narrows anything at all. `{}` (a whole-match row) does not. */
export function hasFilmCut(cut: FilmCut | null | undefined): boolean {
  if (!cut) return false;
  return (
    hasActiveMatchFilters(filmCutFilters(cut)) || filmCutExtras(cut) !== null
  );
}

function matchesFilmCutEnding(
  point: MatchPoint,
  ending: FilmCutEnding,
): boolean {
  const result = (point.resultType ?? "").trim().toLowerCase();
  switch (ending) {
    case "winner":
      return result.includes("winner");
    case "unforced-error":
      return result.includes("unforced error");
  }
}

/** Whether one point passes the cut's Film-only extras. */
export function matchesFilmCutExtras(point: MatchPoint, cut: FilmCut): boolean {
  const ending = cut.ending ?? null;
  if (ending !== null && !matchesFilmCutEnding(point, ending)) return false;
  return true;
}

/**
 * The cut laid over `base`: the points of `base` the cut also admits, in
 * `base`'s order. `base` is the whole match for a Statistics card's count;
 * `points` is the WHOLE match in match order, because the cut's
 * `MatchFilters` part is evaluated over it (a service court is a running
 * count within each game, so it cannot be read off a filtered subset). No
 * cut, or an empty one, is `base` itself.
 *
 * Every card's "Watch all N" count. The Film list never calls it: a landed
 * cut's `MatchFilters` half is in the shared filters and its extras are
 * `matchesFilmCutExtras` — the same two predicates this ANDs, so with
 * nothing else applied the count and the list cannot disagree.
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

/* ── A side laid over a cut ──────────────────────────────────────────────── */

/**
 * One value cell's cut: the row's cut with the cell's side laid over it, in
 * the shared filters' vocabulary.
 *
 * - `server` (the default): the side SERVED the point (Serve › Player) — a
 *   player's first-serve points are the ones they served.
 * - `returner`: the side RETURNED it, so Serve › Player is the other one —
 *   your first-serve returns are the opponent's first serves.
 * - `player`: the side is Result › Hit by, the point of view Result › Ending
 *   reads — whoever hit the winner or made the error (a double fault is the
 *   server's, an ace the server's).
 *
 * `won` adds Result › Outcome, which is always read from the VIEWER's side:
 * "Won" for you, "Lost" for the opponent — the opponent's 26 of 100 are the
 * points you lost. It never writes Hit by, since a point won from a side is
 * that side's whoever struck the last ball (the opponent's error is still
 * your point); so under `won` a `player` side is the outcome alone, and a
 * `server`/`returner` side still narrows to the points that side served or
 * returned.
 *
 * `you`/`opp` are relative, resolved through the filter context's
 * `youIsPlayer1` inside the film tab (guardrails §4); nothing here reads
 * player order. Shared by `head-to-head-card.tsx` and `point-endings-card.tsx`
 * — both compose a `FilmCut` this same way.
 */
export type CutSide = "server" | "returner" | "player";

function playerSide(side: "you" | "opp"): PlayerSide {
  return side === "you" ? "you" : "opponent";
}

function otherSide(side: "you" | "opp"): PlayerSide {
  return side === "you" ? "opponent" : "you";
}

export function sideCut(
  cut: FilmCut,
  side: "you" | "opp",
  by: CutSide = "server",
  won = false,
): FilmCut {
  const who = playerSide(side);
  const attributed: FilmCut =
    by === "player"
      ? won
        ? cut
        : { ...cut, resultPlayer: who }
      : { ...cut, server: by === "returner" ? otherSide(side) : who };
  return won
    ? { ...attributed, resultOutcome: [side === "you" ? "won" : "lost"] }
    : attributed;
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
