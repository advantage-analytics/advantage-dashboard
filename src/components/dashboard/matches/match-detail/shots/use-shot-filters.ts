"use client";

import { useCallback, useMemo, useState } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  computeZoneStats,
  pointToServeDot,
  type ServeDot,
  type ZoneKey,
  type ZoneStats,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";
import type { CourtDot } from "@/components/dashboard/matches/visuals/half-court-svg";

// Re-export moved functions and types from viz-model.ts
export {
  deriveZoneFromX,
  getPointSide,
  isFirstServePoint,
  isReturnOnFirstServe,
  pointMatchesFilters,
  pointToReturnDots,
  returnOutcome,
  toServeInput,
  type BallFilter,
  type CourtSideFilter,
  type GameFilter,
  type PressureFilter,
  type RallyFilter,
  type ResultFilter,
  type ReturnOutcome,
  type SetFilter,
  type ShotFilterState,
  type ZoneFilter,
} from "./viz-model";
export { EMPTY_VIZ_FILTERS as EMPTY_SHOT_FILTERS } from "./viz-model";

/**
 * Filter model for the round-46 Shots & placement tab (artboard 47a's header
 * exposes every dimension here; 46b's page draws the result).
 *
 * Attribution (guardrails §4): "you" enters this file exactly once, as the
 * `youIsPlayer1` argument — which the tab reads from `useMatchSides()`, never
 * derives itself. Serve mode is YOUR serves (`serverIsPlayer1 === youIsPlayer1`),
 * return mode is YOUR returns, and Won/Lost mean the point went to YOU — all
 * three flip together for a player-2 viewer.
 */

/* ── Filter vocabulary ───────────────────────────────────────────────────── */

export type ShotMode = "serve" | "return";
export type CourtView = "zones" | "placements";

// Re-import ShotFilterState for use in this file's types
import type { ShotFilterState } from "./viz-model";

/* ── The cut sentence ─────────────────────────────────────────────────────
   Design-system Data Table rule 6: an applied filter is stated in words in a
   note strip — plain sentence · middot · "N of M" — never chips. Returns null
   when nothing is narrowing. Artboard reference: "First serves on break
   points, both courts". */

export function buildCutSentence(
  filters: ShotFilterState,
  mode: ShotMode,
): string | null {
  const active = hasActiveFilters(filters, mode);
  if (!active) return null;

  const subject =
    mode === "serve"
      ? filters.ball === "first"
        ? "First serves"
        : filters.ball === "second"
          ? "Second serves"
          : "Serves"
      : filters.ball === "first"
        ? "First-serve returns"
        : filters.ball === "second"
          ? "Second-serve returns"
          : "Returns";

  const phrases: string[] = [subject];
  if (mode === "serve" && filters.zone !== "any") {
    phrases.push(
      filters.zone === "t"
        ? "to the T"
        : filters.zone === "body"
          ? "into the body"
          : "out wide",
    );
  }
  if (filters.pressure === "break") phrases.push("on break points");
  if (filters.pressure === "setMatch") phrases.push("on set and match points");
  if (filters.result === "won") phrases.push("you won");
  if (filters.result === "lost") phrases.push("you lost");
  if (filters.result === "ace") phrases.push("that were aces");
  if (filters.rally !== "any") {
    phrases.push(
      filters.rally === "short"
        ? "in 1–4 shot rallies"
        : filters.rally === "medium"
          ? "in 5–8 shot rallies"
          : "in 9+ shot rallies",
    );
  }
  if (filters.set !== "any") phrases.push(`in set ${filters.set}`);
  if (filters.game === "serving") phrases.push("in service games");
  if (filters.game === "returning") phrases.push("in return games");

  const courts =
    filters.court === "deuce"
      ? "deuce court"
      : filters.court === "ad"
        ? "ad court"
        : "both courts";

  return `${phrases.join(" ")}, ${courts}`;
}

export function hasActiveFilters(
  filters: ShotFilterState,
  mode: ShotMode,
): boolean {
  return (
    filters.set !== "any" ||
    filters.game !== "any" ||
    filters.ball !== "any" ||
    filters.court !== "any" ||
    (mode === "serve" && filters.zone !== "any") ||
    filters.pressure !== "any" ||
    filters.result !== "any" ||
    filters.rally !== "any"
  );
}

/* ── The hook ─────────────────────────────────────────────────────────────── */

export interface ShotFiltersModel {
  mode: ShotMode;
  view: CourtView;
  filters: ShotFilterState;
  /** Distinct set numbers present in the match, ascending. */
  availableSets: number[];
  /** Shots matching the cut / shots in the mode's whole pool. */
  count: number;
  total: number;
  /** "serves" | "returns" — the artboard's count-sentence noun. */
  noun: string;
  /** Plain-words description of the cut, or null when nothing narrows. */
  cutSentence: string | null;
  isFiltered: boolean;
  serveDots: ServeDot[];
  returnDots: CourtDot[];
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  setMode: (mode: ShotMode) => void;
  setView: (view: CourtView) => void;
  updateFilter: <K extends keyof ShotFilterState>(
    key: K,
    value: ShotFilterState[K],
  ) => void;
  clearFilters: () => void;
}

// Import for use in the hook
import {
  EMPTY_VIZ_FILTERS,
  pointMatchesFilters,
  pointToReturnDots,
  toServeInput,
} from "./viz-model";

export function useShotFilters(
  points: MatchPoint[],
  youIsPlayer1: boolean,
): ShotFiltersModel {
  const [mode, setModeState] = useState<ShotMode>("serve");
  const [view, setView] = useState<CourtView>("zones");
  const [filters, setFilters] = useState<ShotFilterState>(EMPTY_VIZ_FILTERS);

  const setMode = useCallback((next: ShotMode) => {
    setModeState(next);
    if (next === "return") {
      // Zone and Ace are serve-frame options; carrying them into return mode
      // would silently empty the view with nothing in the UI saying why.
      setFilters((f) => ({
        ...f,
        zone: "any",
        result: f.result === "ace" ? "any" : f.result,
      }));
    }
  }, []);

  const updateFilter = useCallback(
    <K extends keyof ShotFilterState>(key: K, value: ShotFilterState[K]) => {
      setFilters((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => setFilters(EMPTY_VIZ_FILTERS), []);

  const availableSets = useMemo(() => {
    const sets = new Set<number>();
    for (const p of points) sets.add(p.setNumber);
    return [...sets].sort((a, b) => a - b);
  }, [points]);

  // The mode's whole pool — YOUR shots that can actually be drawn. Using the
  // drawable set as the denominator keeps the header's "N of M", the court
  // dots, and the six zone-cell counts all describing the same shots, which is
  // what lets the cells sum exactly to N.
  const servePool = useMemo(() => {
    const pool: { point: MatchPoint; dot: ServeDot }[] = [];
    for (const p of points) {
      if (p.serverIsPlayer1 !== youIsPlayer1) continue;
      const dot = pointToServeDot(toServeInput(p));
      if (dot) pool.push({ point: p, dot });
    }
    return pool;
  }, [points, youIsPlayer1]);

  const returnPool = useMemo(() => {
    const pool: { point: MatchPoint; dots: CourtDot[] }[] = [];
    for (const p of points) {
      if (p.serverIsPlayer1 === youIsPlayer1) continue;
      const dots = pointToReturnDots(p, youIsPlayer1);
      if (dots.length > 0) pool.push({ point: p, dots });
    }
    return pool;
  }, [points, youIsPlayer1]);

  const filteredServe = useMemo(
    () =>
      servePool.filter(({ point }) =>
        pointMatchesFilters(point, filters, "serve", youIsPlayer1),
      ),
    [servePool, filters, youIsPlayer1],
  );

  const filteredReturn = useMemo(
    () =>
      returnPool.filter(({ point }) =>
        pointMatchesFilters(point, filters, "return", youIsPlayer1),
      ),
    [returnPool, filters, youIsPlayer1],
  );

  const serveDots = useMemo(
    () => filteredServe.map((s) => s.dot),
    [filteredServe],
  );
  const returnDots = useMemo(
    () => filteredReturn.flatMap((r) => r.dots),
    [filteredReturn],
  );

  const zoneStats = useMemo(
    () => (mode === "serve" ? computeZoneStats(serveDots) : null),
    [mode, serveDots],
  );

  const total = mode === "serve" ? servePool.length : returnPool.length;
  const count = mode === "serve" ? filteredServe.length : filteredReturn.length;

  return {
    mode,
    view,
    filters,
    availableSets,
    count,
    total,
    noun: mode === "serve" ? "serves" : "returns",
    cutSentence: buildCutSentence(filters, mode),
    isFiltered: hasActiveFilters(filters, mode),
    serveDots,
    returnDots,
    zoneStats,
    setMode,
    setView,
    updateFilter,
    clearFilters,
  };
}
