/**
 * Pure per-subject visualization model for the Visualizations tab redesign.
 * No React, no "use client" — this is testable with Playwright as a plain module.
 *
 * Attribution (guardrails §4): "you" enters this file exactly once, as the
 * `subjectIsPlayer1` argument. Serve cut is subject's serves, return cut is
 * subject's returns, and Won/Lost mean the subject won the point — all flip
 * together for a player-2 viewer.
 */

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  computeZoneStats as computeZoneStatsFromServeZones,
  pointToServeDot as pointToServeDotFromServeZones,
  type ServeDot,
  type ServePointInput,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";
import {
  CENTER_X,
  COURT_W,
  FULL_SVG_NET_Y,
  FULL_SVG_FAR_BASELINE,
  FULL_SVG_NEAR_BASELINE,
  FULL_SVG_PAD_BOTTOM,
  type CourtDot,
} from "@/components/dashboard/matches/visuals/half-court-svg";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type Cut = "serve" | "returnPlacement" | "returnContact";
export type Chart = "scatter" | "zones";
export type PlayerFilter = "you" | "opponent";

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

export interface VizFilters extends ShotFilterState {
  player: PlayerFilter;
}

export const EMPTY_VIZ_FILTERS: VizFilters = {
  player: "you",
  set: "any",
  game: "any",
  ball: "any",
  court: "any",
  zone: "any",
  pressure: "any",
  result: "any",
  rally: "any",
};

export type Outcome = "won" | "lost" | "miss";

export interface VizDot {
  id: string;
  x: number;
  y: number;
  outcome: Outcome;
  shape: "circle" | "triangle";
}

export interface VizResult {
  dots: VizDot[];
  count: number; // points matching the filters
  total: number; // drawable points in the cut's pool
  noun: "serves" | "returns";
  zoneStats: Record<ZoneKey, ZoneStats> | null; // serve cut only
}

/* ── Helpers moved from the retired shot-filters hook ────────────────────── */

const REAL_HALF_DOUBLES = 5.485;
const REAL_NET_Y = 11.885;
const REAL_COURT_LENGTH = 23.77;

function normalizeLanding(lx: number, ly: number): { lx: number; ly: number } {
  if (ly > REAL_NET_Y) {
    return { lx: -lx, ly: REAL_COURT_LENGTH - ly };
  }
  return { lx, ly };
}

const SCORE_MAP: Record<string, number> = {
  "0": 0,
  "15": 1,
  "30": 2,
  "40": 3,
  A: 3,
  AD: 3,
};

export function getPointSide(
  pointScore: string | null | undefined,
): "deuce" | "ad" {
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

export function isFirstServePoint(p: MatchPoint): boolean {
  return !(p.firstShotType?.toLowerCase().includes("second") ?? false);
}

export function isReturnOnFirstServe(p: MatchPoint): boolean {
  return p.firstShotType === "First Serve" && p.firstShotResult === "In";
}

export function deriveZoneFromX(lx: number): "t" | "body" | "wide" {
  const a = Math.abs(lx);
  return a >= 2.74 ? "wide" : a >= 1.37 ? "body" : "t";
}

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

export type ReturnOutcome = "won" | "lost" | "outnet";

export function returnOutcome(
  p: MatchPoint,
  subjectIsPlayer1: boolean,
): ReturnOutcome {
  if (p.secondShotResult === "Out" || p.secondShotResult === "Net") {
    return "outnet";
  }
  // In return mode SUBJECT is the returner, so returner-won ≡ subject-won.
  return p.wonByPlayer1 === subjectIsPlayer1 ? "won" : "lost";
}

export function pointToReturnDots(
  p: MatchPoint,
  subjectIsPlayer1: boolean,
): CourtDot[] {
  if (p.secondShotLandingX == null || p.secondShotLandingY == null) return [];

  const typeLower = (p.secondShotType ?? "").toLowerCase();
  const shape: "circle" | "triangle" =
    typeLower.includes("backhand") || typeLower.startsWith("bh")
      ? "triangle"
      : "circle";
  const outcome = returnOutcome(p, subjectIsPlayer1);
  const color =
    outcome === "won"
      ? "var(--viz-good)"
      : outcome === "lost"
        ? "var(--viz-bad)"
        : "var(--ink-400)";

  const landingRaw = { lx: p.secondShotLandingX, ly: p.secondShotLandingY };
  const didFlip = landingRaw.ly > REAL_NET_Y;
  const landing = didFlip
    ? { lx: -landingRaw.lx, ly: REAL_COURT_LENGTH - landingRaw.ly }
    : landingRaw;

  const farH = FULL_SVG_NET_Y - FULL_SVG_FAR_BASELINE;
  // Mirrored world-x (leading minus) so the court reads from BEHIND the
  // returner.
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
    ? {
        lx: -p.secondShotContactX,
        ly: REAL_COURT_LENGTH - p.secondShotContactY,
      }
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

export function pointMatchesFilters(
  p: MatchPoint,
  filters: ShotFilterState,
  frame: "serve" | "return",
  subjectIsPlayer1: boolean,
): boolean {
  if (filters.set !== "any" && p.setNumber !== filters.set) return false;

  if (filters.game !== "any") {
    const subjectServed = p.serverIsPlayer1 === subjectIsPlayer1;
    if (filters.game === "serving" && !subjectServed) return false;
    if (filters.game === "returning" && subjectServed) return false;
  }

  if (filters.ball !== "any") {
    // In serve frame the ball is the serve struck; in return frame it is
    // the serve returned — a faulted first ball means the return happened
    // on the second (see isReturnOnFirstServe).
    const isFirst =
      frame === "serve" ? isFirstServePoint(p) : isReturnOnFirstServe(p);
    if (filters.ball === "first" && !isFirst) return false;
    if (filters.ball === "second" && isFirst) return false;
  }

  if (filters.court !== "any") {
    const side =
      frame === "serve"
        ? (serveLandingSide(p) ?? getPointSide(p.pointScore))
        : getPointSide(p.pointScore);
    if (side !== filters.court) return false;
  }

  // Zone is a serve-box concept — the group is hidden in return mode and the
  // state is reset on mode switch, so it never silently narrows returns.
  if (frame === "serve" && filters.zone !== "any") {
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
      const subjectWon = p.wonByPlayer1 === subjectIsPlayer1;
      if (filters.result === "won" && !subjectWon) return false;
      if (filters.result === "lost" && subjectWon) return false;
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

/* ── Main public functions ──────────────────────────────────────────────── */

export function cutFrame(cut: Cut): "serve" | "return" {
  return cut === "serve" ? "serve" : "return";
}

const BASE_KEYS = [
  "player",
  "set",
  "game",
  "ball",
  "court",
  "pressure",
  "result",
  "rally",
] as const;

export function filterKeysFor(cut: Cut): (keyof VizFilters)[] {
  return cut === "serve" ? [...BASE_KEYS, "zone"] : [...BASE_KEYS];
}

export function subjectFor(
  filters: VizFilters,
  youIsPlayer1: boolean,
): boolean {
  return filters.player === "you" ? youIsPlayer1 : !youIsPlayer1;
}

function serveOutcome(r: ServeDot["result"]): Outcome {
  return r === "lost" ? "lost" : r === "doubleFault" ? "miss" : "won";
}

export function computeViz(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
): VizResult {
  const frame = cutFrame(cut);
  let total = 0;
  let count = 0;
  const dots: VizDot[] = [];
  const serveDots: ServeDot[] = [];

  for (const p of points) {
    if (frame === "serve") {
      if (p.serverIsPlayer1 !== subjectIsPlayer1) continue;
      const dot = pointToServeDotFromServeZones(toServeInput(p));
      if (!dot) continue;
      total++;
      if (!pointMatchesFilters(p, filters, "serve", subjectIsPlayer1)) continue;
      count++;
      serveDots.push(dot);
      dots.push({
        id: p.id,
        x: dot.x,
        y: dot.y,
        outcome: serveOutcome(dot.result),
        shape: "circle",
      });
    } else {
      if (p.serverIsPlayer1 === subjectIsPlayer1) continue;
      const want = cut === "returnPlacement" ? "landing" : "contact";
      const mine = pointToReturnDots(p, subjectIsPlayer1).filter(
        (d) => d.variant === want,
      );
      if (mine.length === 0) continue;
      total++;
      if (!pointMatchesFilters(p, filters, "return", subjectIsPlayer1))
        continue;
      count++;
      const o = returnOutcome(p, subjectIsPlayer1);
      for (const d of mine) {
        dots.push({
          id: String(d.id),
          x: d.cx,
          y: d.cy,
          outcome: o === "outnet" ? "miss" : o,
          shape: d.shape ?? "circle",
        });
      }
    }
  }

  return {
    dots,
    count,
    total,
    noun: frame === "serve" ? "serves" : "returns",
    zoneStats:
      cut === "serve" ? computeZoneStatsFromServeZones(serveDots) : null,
  };
}

/**
 * The tile-footer count label (review M10) — `"{count} of {total}"` for
 * every cut. Serve and return tiles used to read differently ("38 of 50" vs.
 * "12 returns"), which made a return tile look like it had no denominator
 * when it does (`result.total` is always the cut's drawable pool). Pulled
 * out once here so `viz-wall.tsx` and `saved-views-band.tsx` build their
 * count label the same way instead of each spelling out the same ternary.
 */
export function tileCountLabel(result: {
  count: number;
  total: number;
}): string {
  return `${result.count} of ${result.total}`;
}

export function availableSets(points: MatchPoint[]): number[] {
  const sets = new Set<number>();
  for (const p of points) sets.add(p.setNumber);
  return [...sets].sort((a, b) => a - b);
}
