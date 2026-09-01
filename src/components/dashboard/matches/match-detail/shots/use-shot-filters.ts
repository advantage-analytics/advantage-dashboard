"use client";

import { useCallback, useMemo, useState } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  computeZoneStats,
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
  type ZoneKey,
  type ZoneStats,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";
import {
  CENTER_X,
  COURT_W,
  FULL_SVG_NET_Y,
  FULL_SVG_FAR_BASELINE,
  FULL_SVG_NEAR_BASELINE,
  FULL_SVG_PAD_BOTTOM,
  type CourtDot,
} from "@/components/dashboard/matches/visuals/half-court-svg";

/**
 * Filter model for the round-46 Shots & placement tab (artboard 47a's header
 * exposes every dimension here; 46b's page draws the result).
 *
 * Attribution (guardrails §4): "you" enters this file exactly once, as the
 * `youIsPlayer1` argument — which the tab reads from `useMatchSides()`, never
 * derives itself. Serve mode is YOUR serves (`serverIsPlayer1 === youIsPlayer1`),
 * return mode is YOUR returns, and Won/Lost mean the point went to YOU — all
 * three flip together for a player-2 viewer. The coordinate helpers below that
 * are copied rather than imported are copied from
 * `serve-placement/serve-placement-widget.tsx` (which keeps them private);
 * `pointToServeDot` / `computeZoneStats` are imported, not reimplemented, so
 * Placements-view dots land on exactly the pixels the old ServePlacementCard
 * drew.
 */

/* ── Filter vocabulary ───────────────────────────────────────────────────── */

export type ShotMode = "serve" | "return";
export type CourtView = "zones" | "placements";
export type SetFilter = "any" | number;
export type GameFilter = "any" | "serving" | "returning";
export type BallFilter = "any" | "first" | "second";
export type CourtSideFilter = "any" | "deuce" | "ad";
export type ZoneFilter = "any" | "t" | "body" | "wide";
export type PressureFilter = "any" | "break" | "setMatch";
export type ResultFilter = "any" | "won" | "lost" | "ace";
export type RallyFilter = "any" | "short" | "medium" | "long";

export interface ShotFilterState {
  set: SetFilter;
  game: GameFilter;
  ball: BallFilter;
  court: CourtSideFilter;
  zone: ZoneFilter;
  pressure: PressureFilter;
  result: ResultFilter;
  rally: RallyFilter;
}

export const EMPTY_SHOT_FILTERS: ShotFilterState = {
  set: "any",
  game: "any",
  ball: "any",
  court: "any",
  zone: "any",
  pressure: "any",
  result: "any",
  rally: "any",
};

/* ── Helpers copied from serve-placement-widget.tsx (private there) ──────── */

// Real-court frame (meters) — serve-placement-widget.tsx lines 193–196.
const REAL_HALF_DOUBLES = 5.485;
const REAL_NET_Y = 11.885;
const REAL_COURT_LENGTH = 23.77;

/**
 * SwingVision records landing coordinates in a fixed world frame; after the
 * end-change on odd games ly exceeds the net and lx mirrors. Flip both so
 * every shot reads in one canonical frame — `normalizeLanding`, widget
 * lines 204–209.
 */
function normalizeLanding(lx: number, ly: number): { lx: number; ly: number } {
  if (ly > REAL_NET_Y) {
    return { lx: -lx, ly: REAL_COURT_LENGTH - ly };
  }
  return { lx, ly };
}

// Score-parity deuce/ad — `getPointSide`, widget lines 242–252.
const SCORE_MAP: Record<string, number> = {
  "0": 0,
  "15": 1,
  "30": 2,
  "40": 3,
  A: 3,
  AD: 3,
};

export function getPointSide(pointScore: string | null | undefined): "deuce" | "ad" {
  const s = (pointScore ?? "").toUpperCase().trim();
  if (s === "DEUCE" || s === "40-40") return "deuce";
  if (/^AD?-|-AD?$/.test(s)) return "ad";
  const parts = s.split("-");
  return ((SCORE_MAP[parts[0]?.trim() ?? ""] ?? 0) +
    (SCORE_MAP[parts[1]?.trim() ?? ""] ?? 0)) %
    2 ===
    0
    ? "deuce"
    : "ad";
}

// `isFirstServePoint`, widget lines 254–256.
export function isFirstServePoint(p: MatchPoint): boolean {
  return !(p.firstShotType?.toLowerCase().includes("second") ?? false);
}

// Which serve did the returner actually return — `isReturnOnFirstServe`,
// widget lines 261–263: a faulted first serve is followed by a second-serve
// rally, so the return is on the 2nd ball even though shot[0] says "First".
export function isReturnOnFirstServe(p: MatchPoint): boolean {
  return p.firstShotType === "First Serve" && p.firstShotResult === "In";
}

// `deriveZoneFromX`, widget lines 294–297.
export function deriveZoneFromX(lx: number): "t" | "body" | "wide" {
  const a = Math.abs(lx);
  return a >= 2.74 ? "wide" : a >= 1.37 ? "body" : "t";
}

// `getLandingSide`, widget lines 1127–1131 — the landed side beats score
// parity when coordinates exist.
function serveLandingSide(p: MatchPoint): "deuce" | "ad" | null {
  if (p.firstShotLandingX == null || p.firstShotLandingY == null) return null;
  const { lx } = normalizeLanding(p.firstShotLandingX, p.firstShotLandingY);
  return lx < 0 ? "deuce" : "ad";
}

function serveZone(p: MatchPoint): "t" | "body" | "wide" | null {
  const z = p.firstShotZone?.toLowerCase();
  if (z === "t" || z === "body" || z === "wide") return z;
  if (p.firstShotLandingX != null) return deriveZoneFromX(p.firstShotLandingX);
  return null;
}

/** The exact input shape ServePlacementCard built — see serve-placement-card.tsx. */
export function toServeInput(p: MatchPoint): ServePointInput {
  return {
    id: p.id,
    serverIsPlayer1: p.serverIsPlayer1,
    firstShotLandingX: p.firstShotLandingX ?? null,
    firstShotLandingY: p.firstShotLandingY ?? null,
    firstShotZone: p.firstShotZone ?? null,
    firstShotSpin: p.firstShotSpin ?? null,
    firstShotType: p.firstShotType ?? null,
    firstShotResult: p.firstShotResult ?? null,
    resultType: p.resultType,
    wonByPlayer1: p.wonByPlayer1,
    setNumber: p.setNumber,
    pointScore: p.pointScore,
    gameScore: p.gameScore,
    secondShotLandingX: p.secondShotLandingX ?? null,
    secondShotLandingY: p.secondShotLandingY ?? null,
    secondShotContactX: p.secondShotContactX ?? null,
    secondShotContactY: p.secondShotContactY ?? null,
    secondShotType: p.secondShotType ?? null,
    secondShotSpin: p.secondShotSpin ?? null,
    secondShotResult: p.secondShotResult ?? null,
    rallyLength: p.rallyLength,
  };
}

/* ── Return dots — replicated from `pointToReturnCourtDots` ──────────────────
   (widget lines 1040–1125, private there). Same normalization, same mirrored
   behind-the-returner x, same net-artifact and clamping rules; only the colors
   move to design tokens and the tooltip meta is dropped. */

export type ReturnOutcome = "won" | "lost" | "outnet";

const RETURN_COLORS: Record<ReturnOutcome, string> = {
  won: "var(--viz-good)",
  lost: "var(--viz-bad)",
  outnet: "var(--ink-400)",
};

export function returnOutcome(
  p: MatchPoint,
  youIsPlayer1: boolean,
): ReturnOutcome {
  if (p.secondShotResult === "Out" || p.secondShotResult === "Net") {
    return "outnet";
  }
  // In return mode YOU are the returner, so returner-won ≡ you-won.
  return p.wonByPlayer1 === youIsPlayer1 ? "won" : "lost";
}

export function pointToReturnDots(
  p: MatchPoint,
  youIsPlayer1: boolean,
): CourtDot[] {
  if (p.secondShotLandingX == null || p.secondShotLandingY == null) return [];

  const typeLower = (p.secondShotType ?? "").toLowerCase();
  const shape: "circle" | "triangle" =
    typeLower.includes("backhand") || typeLower.startsWith("bh")
      ? "triangle"
      : "circle";
  const color = RETURN_COLORS[returnOutcome(p, youIsPlayer1)];

  const landingRaw = { lx: p.secondShotLandingX, ly: p.secondShotLandingY };
  const didFlip = landingRaw.ly > REAL_NET_Y;
  const landing = didFlip
    ? { lx: -landingRaw.lx, ly: REAL_COURT_LENGTH - landingRaw.ly }
    : landingRaw;

  const farH = FULL_SVG_NET_Y - FULL_SVG_FAR_BASELINE;
  // Mirrored world-x (leading minus) so the court reads from BEHIND the
  // returner — see the widget's comment at lines 1071–1073.
  const landingCx = CENTER_X - (landing.lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const landingCy = FULL_SVG_FAR_BASELINE + (landing.ly / REAL_NET_Y) * farH;
  const landingDot: CourtDot = {
    cx: Math.max(4, Math.min(COURT_W - 4, landingCx)),
    cy: Math.max(
      FULL_SVG_FAR_BASELINE + 4,
      Math.min(FULL_SVG_NET_Y - 4, landingCy),
    ),
    color,
    opacity: 0.85,
    id: p.id,
    pairId: p.id,
    variant: "landing",
    shape,
  };

  if (p.secondShotContactX == null || p.secondShotContactY == null) {
    return [landingDot];
  }
  const contactNorm = didFlip
    ? { lx: -p.secondShotContactX, ly: REAL_COURT_LENGTH - p.secondShotContactY }
    : { lx: p.secondShotContactX, ly: p.secondShotContactY };
  const nearH = FULL_SVG_NEAR_BASELINE - FULL_SVG_NET_Y;
  const nearSpanY = REAL_COURT_LENGTH - REAL_NET_Y;
  const contactCx =
    CENTER_X - (contactNorm.lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const contactCy =
    FULL_SVG_NET_Y + ((contactNorm.ly - REAL_NET_Y) / nearSpanY) * nearH;
  // Contact on/in front of the net is a tracking artifact, not a real strike.
  if (contactCy <= FULL_SVG_NET_Y + 4) {
    return [landingDot];
  }
  const contactDot: CourtDot = {
    cx: Math.max(4, Math.min(COURT_W - 4, contactCx)),
    cy: Math.max(
      FULL_SVG_NET_Y + 4,
      Math.min(FULL_SVG_NEAR_BASELINE + FULL_SVG_PAD_BOTTOM - 4, contactCy),
    ),
    color,
    opacity: 0.85,
    id: `${p.id}:contact`,
    pairId: p.id,
    variant: "contact",
    shape,
  };

  return [landingDot, contactDot];
}

/* ── The filter predicate (pure — exported for spot-check scripts) ───────── */

export function pointMatchesFilters(
  p: MatchPoint,
  filters: ShotFilterState,
  mode: ShotMode,
  youIsPlayer1: boolean,
): boolean {
  if (filters.set !== "any" && p.setNumber !== filters.set) return false;

  if (filters.game !== "any") {
    const youServed = p.serverIsPlayer1 === youIsPlayer1;
    if (filters.game === "serving" && !youServed) return false;
    if (filters.game === "returning" && youServed) return false;
  }

  if (filters.ball !== "any") {
    // In serve mode the ball is the serve you struck; in return mode it is
    // the serve you returned — a faulted first ball means the return happened
    // on the second (see isReturnOnFirstServe).
    const isFirst =
      mode === "serve" ? isFirstServePoint(p) : isReturnOnFirstServe(p);
    if (filters.ball === "first" && !isFirst) return false;
    if (filters.ball === "second" && isFirst) return false;
  }

  if (filters.court !== "any") {
    const side =
      mode === "serve"
        ? (serveLandingSide(p) ?? getPointSide(p.pointScore))
        : getPointSide(p.pointScore);
    if (side !== filters.court) return false;
  }

  // Zone is a serve-box concept — the group is hidden in return mode and the
  // state is reset on mode switch, so it never silently narrows returns.
  if (mode === "serve" && filters.zone !== "any") {
    if (serveZone(p) !== filters.zone) return false;
  }

  if (filters.pressure === "break" && !p.isBreakPoint) return false;
  if (filters.pressure === "setMatch" && !p.isSetPoint && !p.isMatchPoint) {
    return false;
  }

  if (filters.result !== "any") {
    if (filters.result === "ace") {
      if (p.resultType !== "Ace") return false;
    } else {
      const youWon = p.wonByPlayer1 === youIsPlayer1;
      if (filters.result === "won" && !youWon) return false;
      if (filters.result === "lost" && youWon) return false;
    }
  }

  if (filters.rally !== "any") {
    const len = p.rallyLength;
    if (filters.rally === "short" && !(len >= 1 && len <= 4)) return false;
    if (filters.rally === "medium" && !(len >= 5 && len <= 8)) return false;
    if (filters.rally === "long" && len < 9) return false;
  }

  return true;
}

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

export function useShotFilters(
  points: MatchPoint[],
  youIsPlayer1: boolean,
): ShotFiltersModel {
  const [mode, setModeState] = useState<ShotMode>("serve");
  const [view, setView] = useState<CourtView>("zones");
  const [filters, setFilters] = useState<ShotFilterState>(EMPTY_SHOT_FILTERS);

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

  const clearFilters = useCallback(() => setFilters(EMPTY_SHOT_FILTERS), []);

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
