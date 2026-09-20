/**
 * Pure per-subject visualization model for the Visualizations tab redesign.
 * No React, no "use client" — this is testable with Playwright as a plain module.
 *
 * Attribution (guardrails §4): "you" enters this file exactly once, as the
 * `subjectIsPlayer1` argument. Serve cut is subject's serves, return cut is
 * subject's returns, and Won/Lost mean the subject won the point — all flip
 * together for a player-2 viewer.
 */

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import {
  computeZoneStats as computeZoneStatsFromServeZones,
  pointToServeDot as pointToServeDotFromServeZones,
  type ServeDot,
  type ServePointInput,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";
import {
  projectServeDot,
  projectReturnDot,
  SERVE_HEAT_BOUNDS,
  RETURN_HEAT_BOUNDS,
  SERVE_HEAT_GRID,
  RETURN_HEAT_GRID,
  RALLY_HEAT_GRID,
  type HeatBounds,
} from "./court-geometry";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type Cut =
  "serve" | "returnPlacement" | "returnContact" | "rallyPosition";
export type Chart = "scatter" | "zones" | "heat";
export type PlayerFilter = "you" | "opponent";

// Every dimension below is multi-select: an empty list means "any" (no
// narrowing), and a non-empty list is OR'd — a point matches the group when
// it matches ANY selected value. `player` is the one exception and stays a
// single scalar (it picks whose court is drawn, not a predicate to OR).
export type GameValue = "serving" | "returning";
export type BallValue = "first" | "second";
export type CourtSideValue = "deuce" | "ad";
export type ZoneValue = "t" | "body" | "wide";
export type PressureValue = "break" | "setMatch";
export type ResultValue = "won" | "lost" | "ace";
export type RallyValue = "short" | "medium" | "long";

export type SetFilter = readonly number[];
export type GameFilter = readonly GameValue[];
export type BallFilter = readonly BallValue[];
export type CourtSideFilter = readonly CourtSideValue[];
export type ZoneFilter = readonly ZoneValue[];
export type PressureFilter = readonly PressureValue[];
export type ResultFilter = readonly ResultValue[];
export type RallyFilter = readonly RallyValue[];

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
  set: [],
  game: [],
  ball: [],
  court: [],
  zone: [],
  pressure: [],
  result: [],
  rally: [],
};

export type Outcome = "won" | "lost" | "miss";

/**
 * Serve dots carry a 0..1 service-box fraction (`x`/`y`) — `projectServeDot`
 * in `court-geometry.ts` maps that onto the serve frame. Return dots carry
 * normalised court METRES instead (`lateralM`/`depthM`) — `projectReturnDot`
 * maps those onto the shared return frame, which kind (`returnPlacement` vs
 * `returnContact`) determining how `depthM` is read. `cut` (known by every
 * caller already) says which fields are populated; `x`/`y` are always 0 on a
 * return dot and `lateralM`/`depthM` are always 0 on a serve dot, rather than
 * making every caller narrow a union for two fields it already knows how to
 * read.
 *
 * `shape: "star"` is a serve-only addition (G2b): an ace draws as a star
 * instead of the usual outcome-coloured circle. Return dots never take this
 * shape — their circle/triangle already encodes forehand/backhand, an
 * orthogonal axis from "was this an ace".
 */
export interface VizDot {
  id: string;
  outcome: Outcome;
  shape: "circle" | "triangle" | "star";
  x: number;
  y: number;
  lateralM: number;
  depthM: number;
}

/** One binned heat grid — `cells[row][col]` counts, `max` the busiest cell
 * (0 when every dot binned, including when there are no dots at all). */
export interface HeatGrid {
  cells: number[][];
  max: number;
}

export interface VizResult {
  dots: VizDot[];
  count: number; // points matching the filters (rallyPosition: matching SHOTS)
  total: number; // drawable points in the cut's pool (rallyPosition: drawable SHOTS)
  noun: "serves" | "returns" | "shots";
  zoneStats: Record<ZoneKey, ZoneStats> | null; // serve cut only
  /** Populated only when the caller's chart is "heat" — null otherwise
   * (including for chart === "zones", where the cells ARE the chart). */
  heat: HeatGrid | null;
}

/**
 * Zones only exists off serve; scatter and heat draw on every cut. The one
 * pure rule behind every chart-coercion decision in the tab: `parseVizState`
 * (a garbage/legacy URL), `cut-menu.tsx`'s `selectCut` (switching cuts keeps
 * the current chart when it's still legal, drops to scatter otherwise — so
 * heat survives a cut switch but zones doesn't survive leaving serve) and
 * `validateVizInput` (a saved-view row) all decide "is this chart legal on
 * this cut" through this function, never by re-deriving the rule inline.
 */
export function chartAllowedOn(cut: Cut, chart: Chart): boolean {
  if (chart === "zones") return cut === "serve";
  return true;
}

/**
 * Bins projected dot positions into a `cols`×`rows` grid over `bounds` (the
 * SAME projected coordinate space `court-art.tsx` draws dots in — see
 * `court-geometry.ts`'s heat-bounds doc comment). A dot outside `bounds`
 * clamps into the nearest edge cell rather than being dropped, so
 * `sum(cells) === dots.length` always holds. Pure — no VizDot/Cut knowledge,
 * so a caller projects first (`projectServeDot`/`projectReturnDot`) and bins
 * second.
 */
export function binDots(
  dots: { x: number; y: number }[],
  cols: number,
  rows: number,
  bounds: HeatBounds,
): HeatGrid {
  const cells: number[][] = Array.from(
    { length: rows },
    () => new Array(cols).fill(0) as number[],
  );
  const xSpan = bounds.xMax - bounds.xMin || 1;
  const ySpan = bounds.yMax - bounds.yMin || 1;

  for (const d of dots) {
    const colFrac = (d.x - bounds.xMin) / xSpan;
    const rowFrac = (d.y - bounds.yMin) / ySpan;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(colFrac * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(rowFrac * rows)));
    cells[row][col]++;
  }

  let max = 0;
  for (const row of cells) {
    for (const v of row) {
      if (v > max) max = v;
    }
  }

  return { cells, max };
}

/** `computeViz`'s heat pass, once its dots are known — projects each dot
 * through the same frame `court-art.tsx` draws it in, then bins. Serve dots
 * carry `x`/`y` (0..1 service-box fractions); return/rally dots carry
 * `lateralM`/`depthM` — `projectServeDot`/`projectReturnDot` read whichever
 * pair the cut populates (see `VizDot`'s own doc comment). rallyPosition
 * always projects through the "contact" kind, same as its scatter dots. */
function computeHeatForCut(cut: Cut, dots: VizDot[]): HeatGrid {
  if (cut === "serve") {
    const projected = dots.map((d) => projectServeDot({ x: d.x, y: d.y }));
    return binDots(
      projected.map((p) => ({ x: p.cx, y: p.cy })),
      SERVE_HEAT_GRID.cols,
      SERVE_HEAT_GRID.rows,
      SERVE_HEAT_BOUNDS,
    );
  }
  const kind = cut === "returnPlacement" ? "placement" : "contact";
  const grid = cut === "rallyPosition" ? RALLY_HEAT_GRID : RETURN_HEAT_GRID;
  const projected = dots.map((d) =>
    projectReturnDot(kind, { lateralM: d.lateralM, depthM: d.depthM }),
  );
  return binDots(
    projected.map((p) => ({ x: p.cx, y: p.cy })),
    grid.cols,
    grid.rows,
    RETURN_HEAT_BOUNDS,
  );
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

export interface ReturnDotMetric {
  id: string;
  variant: "landing" | "contact";
  shape: "circle" | "triangle";
  /** Signed metres from the centre line — positive = the returner's right. */
  lateralM: number;
  /**
   * Landing: metres from the net (`projectReturnDot`'s "placement" depth).
   * Contact: signed metres behind (+) / inside (−) the returner's own
   * baseline (`projectReturnDot`'s "contact" depth).
   */
  depthM: number;
}

/**
 * The return frame's two dot kinds, in normalised court METRES rather than
 * any one SVG frame's pixels — `court-geometry.ts`'s `projectReturnDot`
 * turns these into the shared return frame's coordinates, separately for
 * "placement" (landing) and "contact".
 *
 * Same end-change normalisation the legacy pixel version used: SwingVision
 * doesn't tag which end of the court a shot happened at, so a landing whose
 * raw `ly` falls beyond the net (`REAL_NET_Y`) is read as having happened at
 * the FAR end and gets mirrored (`didFlip`) onto the near end before use —
 * both the landing and (when present) the contact point share that one
 * flip decision, since they're the same shot.
 */
interface ContactMetrics {
  lateralM: number;
  depthM: number;
}

/**
 * The contact-dot mirroring `pointToReturnDots` used to compute inline,
 * pulled out so G3's rally dots — any shot with its own contact/landing
 * pair, not just a point's second shot — reuse the IDENTICAL conversion.
 * `landingX`/`landingY` decide which raw half (near/far) the shot happened
 * at (SwingVision doesn't tag ends, so a landing beyond the net reads as
 * the FAR end and gets mirrored onto the near one — `didFlip`); that same
 * decision then carries over to `contactX`/`contactY`, since a shot's
 * contact and its own landing are always the same shot, always the same
 * end. A point doesn't change ends mid-rally, so calling this once per
 * SHOT (rather than once per point, as `pointToReturnDots` effectively
 * does for the second shot) still lands on the same `didFlip` for every
 * shot in that point — it's just derived from data every shot already
 * carries, rather than assumed to match the second shot's.
 *
 * Returns null when either pair is missing (nothing to place), or when the
 * flipped contact doesn't clear the net — a tracking artifact, not a real
 * strike, since the hitter's own baseline sits at `REAL_COURT_LENGTH` in
 * this normalised frame and `ly` at/below the net is nowhere near it.
 */
function contactMetricsFromLanding(
  contactX: number | null | undefined,
  contactY: number | null | undefined,
  landingX: number | null | undefined,
  landingY: number | null | undefined,
): ContactMetrics | null {
  if (landingX == null || landingY == null) return null;
  if (contactX == null || contactY == null) return null;

  const didFlip = landingY > REAL_NET_Y;
  const contactNorm = didFlip
    ? { lx: -contactX, ly: REAL_COURT_LENGTH - contactY }
    : { lx: contactX, ly: contactY };
  if (contactNorm.ly <= REAL_NET_Y) return null;

  return {
    lateralM: -contactNorm.lx,
    // Positive = behind the baseline (outside the court), negative = inside
    // it — signed distance from `REAL_COURT_LENGTH`, the hitter's own
    // baseline in this normalised frame.
    depthM: contactNorm.ly - REAL_COURT_LENGTH,
  };
}

export function pointToReturnDots(
  p: MatchPoint,
  subjectIsPlayer1: boolean,
): ReturnDotMetric[] {
  if (p.secondShotLandingX == null || p.secondShotLandingY == null) return [];

  const typeLower = (p.secondShotType ?? "").toLowerCase();
  const shape: "circle" | "triangle" =
    typeLower.includes("backhand") || typeLower.startsWith("bh")
      ? "triangle"
      : "circle";

  const landingRaw = { lx: p.secondShotLandingX, ly: p.secondShotLandingY };
  const didFlip = landingRaw.ly > REAL_NET_Y;
  const landing = didFlip
    ? { lx: -landingRaw.lx, ly: REAL_COURT_LENGTH - landingRaw.ly }
    : landingRaw;

  // Mirrored world-x (leading minus) so the court reads from BEHIND the
  // returner — positive lateralM is the returner's RIGHT.
  const landingDot: ReturnDotMetric = {
    id: p.id,
    variant: "landing",
    shape,
    lateralM: -landing.lx,
    depthM: landing.ly, // already 0 (net) .. ~11.885 (that half's baseline)
  };

  const contact = contactMetricsFromLanding(
    p.secondShotContactX,
    p.secondShotContactY,
    p.secondShotLandingX,
    p.secondShotLandingY,
  );
  if (!contact) {
    return [landingDot];
  }
  const contactDot: ReturnDotMetric = {
    id: `${p.id}:contact`,
    variant: "contact",
    shape,
    lateralM: contact.lateralM,
    depthM: contact.depthM,
  };

  return [landingDot, contactDot];
}

/**
 * Every group below is OR'd within itself (an empty list means "any", a
 * non-empty list matches when the point satisfies AT LEAST ONE selected
 * value) and the groups are AND'd against each other — a point must clear
 * every non-empty group to match. `pressure` and `result` aren't a single
 * derived value compared against the list (unlike `game`/`ball`/`court`/
 * `zone`/`rally`): each selected value is its own predicate over the point,
 * and any one of them being true is enough (`break` OR `setMatch`; `won`/
 * `lost` relative to the subject OR the orthogonal `ace` check).
 */
export function pointMatchesFilters(
  p: MatchPoint,
  filters: ShotFilterState,
  frame: "serve" | "return",
  subjectIsPlayer1: boolean,
  /**
   * The frame the `court` filter reads, independent of `frame` (which only
   * governs `ball`'s first/second-serve meaning). Defaults to `frame`, which
   * is correct for the serve and return cuts (their `court` and `ball`
   * agree). `computeRallyViz` is the one caller that diverges: it passes
   * `frame: "serve"` purely for `ball`'s meaning (which serve started the
   * point) while the rally shot itself has no serve-box landing side of its
   * own, so `court` must stay score-based — pass `courtFrame: "return"`
   * there, same as the other non-serve cuts.
   */
  courtFrame: "serve" | "return" = frame,
): boolean {
  if (filters.set.length && !filters.set.includes(p.setNumber)) return false;

  if (filters.game.length) {
    const subjectServed = p.serverIsPlayer1 === subjectIsPlayer1;
    const value: GameValue = subjectServed ? "serving" : "returning";
    if (!filters.game.includes(value)) return false;
  }

  if (filters.ball.length) {
    // In serve frame the ball is the serve struck; in return frame it is
    // the serve returned — a faulted first ball means the return happened
    // on the second (see isReturnOnFirstServe).
    const isFirst =
      frame === "serve" ? isFirstServePoint(p) : isReturnOnFirstServe(p);
    const value: BallValue = isFirst ? "first" : "second";
    if (!filters.ball.includes(value)) return false;
  }

  if (filters.court.length) {
    const side =
      courtFrame === "serve"
        ? (serveLandingSide(p) ?? getPointSide(p.pointScore))
        : getPointSide(p.pointScore);
    if (!filters.court.includes(side)) return false;
  }

  // Zone is a serve-box concept — the group is hidden in return mode and the
  // state is reset on mode switch, so it never silently narrows returns.
  if (frame === "serve" && filters.zone.length) {
    const zone = serveZone(p);
    if (zone === null || !filters.zone.includes(zone)) return false;
  }

  if (filters.pressure.length) {
    const matches = filters.pressure.some((v) =>
      v === "break" ? p.isBreakPoint : p.isSetPoint || p.isMatchPoint,
    );
    if (!matches) return false;
  }

  if (filters.result.length) {
    const subjectWon = p.wonByPlayer1 === subjectIsPlayer1;
    const matches = filters.result.some((v) => {
      if (v === "ace") return p.resultType === "Ace";
      return v === "won" ? subjectWon : !subjectWon;
    });
    if (!matches) return false;
  }

  if (filters.rally.length) {
    const len = p.rallyLength;
    const matches = filters.rally.some((v) => {
      if (v === "short") return len >= 1 && len <= 4;
      if (v === "medium") return len >= 5 && len <= 8;
      return len >= 9;
    });
    if (!matches) return false;
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

/** Backhand-vs-forehand shape, from a shot's own `shotType` — the same
 * regex `pointToReturnDots` applies to `secondShotType`, generalised to any
 * shot rather than just a point's second one. */
function shapeFromShotType(
  shotType: string | null | undefined,
): "circle" | "triangle" {
  const typeLower = (shotType ?? "").toLowerCase();
  return typeLower.includes("backhand") || typeLower.startsWith("bh")
    ? "triangle"
    : "circle";
}

/**
 * Rally position (G3a): every shot AFTER the return (`shotNumber >= 3`) the
 * SUBJECT struck, across every point — not gated on who served, unlike the
 * serve/return arms above, since a rally shot can come from either the
 * server or the returner. `count`/`total`/`noun` are shot-counted rather
 * than point-counted (a single point can contribute several dots): `total`
 * is every qualifying rally shot regardless of filters (the drawable pool,
 * same "before filtering" meaning `total` carries for every other cut, just
 * measured in shots here), `count` the ones whose POINT also passes
 * `filters`. Outcome is the subject's own point result (won/lost — no
 * "miss" class; a rally shot's own placement carries no separate
 * ace/fault-style failure the way a serve or a return does).
 */
function computeRallyViz(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  chart: Chart,
): VizResult {
  let total = 0;
  let count = 0;
  const dots: VizDot[] = [];

  for (const p of points) {
    // "ball" reads as the serve-frame meaning here (first/second serve
    // point) — the rally itself has no "first/second" concept of its own,
    // it's whichever serve started the point that's being asked about. But
    // "court" must stay score-based (courtFrame: "return") — a rally shot
    // has no serve-box landing side of its own, unlike the actual serve cut.
    const passes = pointMatchesFilters(
      p,
      filters,
      "serve",
      subjectIsPlayer1,
      "return",
    );
    const subjectWon = p.wonByPlayer1 === subjectIsPlayer1;

    for (const shot of p.shots ?? []) {
      if (shot.shotNumber < 3) continue;
      if (shot.isPlayer1 !== subjectIsPlayer1) continue;

      const metrics = contactMetricsFromLanding(
        shot.contactX,
        shot.contactY,
        shot.landingX,
        shot.landingY,
      );
      if (!metrics) continue;

      total++;
      if (!passes) continue;
      count++;

      dots.push({
        id: shot.id,
        x: 0,
        y: 0,
        lateralM: metrics.lateralM,
        depthM: metrics.depthM,
        outcome: subjectWon ? "won" : "lost",
        shape: shapeFromShotType(shot.shotType),
      });
    }
  }

  return {
    dots,
    count,
    total,
    noun: "shots",
    zoneStats: null,
    heat: chart === "heat" ? computeHeatForCut("rallyPosition", dots) : null,
  };
}

export function computeViz(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  chart: Chart = "scatter",
): VizResult {
  if (cut === "rallyPosition") {
    return computeRallyViz(points, filters, subjectIsPlayer1, chart);
  }

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
        lateralM: 0,
        depthM: 0,
        outcome: serveOutcome(dot.result),
        // G2b: an ace draws as a star — already gated to the subject's own
        // serves by the `p.serverIsPlayer1 !== subjectIsPlayer1` check above.
        shape: p.resultType === "Ace" ? "star" : "circle",
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
          id: d.id,
          x: 0,
          y: 0,
          lateralM: d.lateralM,
          depthM: d.depthM,
          outcome: o === "outnet" ? "miss" : o,
          shape: d.shape,
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
    heat: chart === "heat" ? computeHeatForCut(cut, dots) : null,
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

/* ── Stats card (Task F3) ──────────────────────────────────────────────────
 * Row builders for the focused-view stats card. Every function below reads
 * the SAME `points`/`cut`/`filters`/`subjectIsPlayer1` a caller passed to
 * `computeViz` for the same render, and starts from `computeViz`'s own
 * output — never a second, independently-filtered pass — so the card's
 * counts can never drift from what the court draws. `VizStats.total` is
 * always `computeViz(...).count`; the subtitle's own count can be smaller
 * for `returnPlacement`, where out/net returns are excluded from the
 * Direction/Depth rows (see `isPlacementRow` below). When that happens the
 * subtitle spells out the gap ("3 of 4 returns landed in") instead of
 * quietly printing the smaller number next to a court/header that still
 * shows the full total.
 */

export interface StatRow {
  key: string;
  label: string;
  count: number;
  won: number;
  winPct: number | null; // null when count === 0
}

/**
 * The single accessible sentence for one stat row — "Crosscourt: 100% of 4
 * points won" / "Ad T: no points". The only place this string is built:
 * `stats-card.tsx` renders it verbatim into a visually-hidden node and
 * hides its own visible label/number markup from assistive tech, so a
 * screen reader announces this sentence exactly once per row, never the
 * label alone and never twice. A test in `tests/viz-model.spec.ts` builds
 * rows through `computeVizStats` (not by hand) so a card row can never ship
 * with an empty label again the way the live app briefly did.
 */
export function statRowAnnouncement(row: StatRow): string {
  if (row.winPct === null) return `${row.label}: no points`;
  return `${row.label}: ${row.winPct}% of ${row.count} points won`;
}

export interface StatGroup {
  key: string;
  label: string | null;
  rows: StatRow[];
}

export interface VizStats {
  title: string;
  subtitle: string;
  groups: StatGroup[];
  sentence: string | null;
  total: number;
}

/**
 * M4: whether the stats card should show its empty state. `stats.total` is
 * always `computeViz(...).count`, but for `returnPlacement` a nonzero total
 * can still leave every Direction/Depth row at `count === 0` — every return
 * landed out/net (see `isPlacementRow`) — which used to render six rows of
 * "—" instead of the honest empty copy. True when every row in every group
 * has `count === 0` (vacuously true when there are no rows/groups at all,
 * same as `total === 0`).
 */
export function statsAreEmpty(stats: VizStats): boolean {
  return stats.groups.every((g) => g.rows.every((r) => r.count === 0));
}

const ZONE_ROWS: { key: ZoneKey; label: string }[] = [
  { key: "deuce-wide", label: "Deuce wide" },
  { key: "deuce-body", label: "Deuce body" },
  { key: "deuce-t", label: "Deuce T" },
  { key: "ad-t", label: "Ad T" },
  { key: "ad-body", label: "Ad body" },
  { key: "ad-wide", label: "Ad wide" },
];

// Singles court is 8.23m wide — 4.115m either side of the center line. Same
// value `court-geometry.ts`'s `SINGLES_HALF_WIDTH_M` uses for the drawn
// court; kept as a local constant here rather than imported, since that file
// is a client-adjacent geometry/SVG module and this one stays plain.
const REAL_SINGLES_HALF_M = 4.115;
const LATERAL_THIRD_M = REAL_SINGLES_HALF_M / 3; // ≈1.372m
const DEPTH_THIRD_M = REAL_NET_Y / 3; // ≈3.962m — thirds of the landing half
const FIVE_FEET_M = 1.524;
const IN_COURT_EPS = 1e-6;

function makeRow(
  key: string,
  label: string,
  count: number,
  won: number,
): StatRow {
  return {
    key,
    label,
    count,
    won,
    winPct: count === 0 ? null : Math.round((won / count) * 100),
  };
}

function rowTieBreak(a: StatRow, b: StatRow): number {
  if (b.count !== a.count) return b.count - a.count;
  return a.label.localeCompare(b.label);
}

/** Rows sorted by win rate, highest first; zero-count (`winPct: null`) rows
 * sort last; ties by count desc, then label. */
function sortRows(rows: StatRow[]): StatRow[] {
  return [...rows].sort((a, b) => {
    if (a.winPct === null && b.winPct === null) return rowTieBreak(a, b);
    if (a.winPct === null) return 1;
    if (b.winPct === null) return -1;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return rowTieBreak(a, b);
  });
}

/**
 * The claim→evidence sentence. Only rows with `count >= 3` ("qualifying")
 * take part — as the headline AND as the comparison set — so the clause
 * never gets its ceiling from a small-sample row a reader has no reason to
 * trust (review F3 round 1: a 2-serve 100% zone was inflating the "every
 * other zone" ceiling above the headline's own win rate, reading as
 * nonsense: "75% won — every other zone sits at or under 100%.").
 *
 * Headline: the qualifying row with the highest `winPct`, ties broken by
 * higher `count`. Comparison ceiling: the highest `winPct` among the OTHER
 * qualifying rows in the HEADLINE'S OWN GROUP only — a return-placement
 * headline in "Direction" is never compared against "Depth" rows, since
 * they answer different questions and a shared ceiling there would be as
 * misleading as the small-sample bug this replaces.
 *
 * Three shapes, depending on what the headline's group offers:
 * - a strictly lower ceiling → "…— every other {rowNoun} with 3+ {noun}
 *   sits at or under {ceiling}%."
 * - a tied ceiling → "…— level with {otherLabel}." (never "at or under
 *   100%" when another qualifying row EQUALS the headline — that reads as
 *   true of everything and states nothing)
 * - no other qualifying row in the group → the clause is dropped entirely:
 *   "{label}: {winPct}% won on {count} {noun}."
 *
 * `null` when no row clears the `count >= 3` bar at all.
 */
function buildSentence(groups: StatGroup[], noun: string): string | null {
  const flat = groups.flatMap((g) => g.rows.map((row) => ({ row, group: g })));
  const qualifying = flat.filter((e) => e.row.count >= 3);
  if (qualifying.length === 0) return null;

  const top = qualifying.reduce((best, e) => {
    if (e.row.winPct! > best.row.winPct!) return e;
    if (e.row.winPct! === best.row.winPct! && e.row.count > best.row.count) {
      return e;
    }
    return best;
  });

  const headline = `${top.row.label}: ${top.row.winPct}% won on ${top.row.count} ${noun}`;

  const sameGroupOthers = qualifying.filter(
    (e) => e.group === top.group && e !== top,
  );
  if (sameGroupOthers.length === 0) return `${headline}.`;

  const ceiling = Math.max(...sameGroupOthers.map((e) => e.row.winPct!));
  if (ceiling < top.row.winPct!) {
    const rowNoun = top.group.label ? top.group.label.toLowerCase() : "zone";
    return `${headline} — every other ${rowNoun} with 3+ ${noun} sits at or under ${ceiling}%.`;
  }

  // Tied ceiling (never a HIGHER one: `top` is the global max, so a same-
  // group row can equal it but never exceed it).
  const tiedOther = sameGroupOthers.find((e) => e.row.winPct === ceiling)!;
  return `${headline} — level with ${tiedOther.row.label}.`;
}

/** Singular when `count === 1` ("1 serve", "1 first serve", "1 second
 * serve"), plural otherwise — including `count === 0` ("0 serves"). The
 * "first"/"second" wording only applies when the ball filter narrows to
 * EXACTLY one value; two selected (or none) reads as the plain noun, since
 * "first and second serves" is just "serves". */
function serveNoun(ball: BallFilter, count: number): string {
  const serve = count === 1 ? "serve" : "serves";
  if (ball.length === 1 && ball[0] === "first") return `first ${serve}`;
  if (ball.length === 1 && ball[0] === "second") return `second ${serve}`;
  return serve;
}

/** Singular when `count === 1` ("1 return", "1 first-serve return", "1
 * second-serve return"), plural otherwise — including `count === 0` ("0
 * returns"). Same single-value rule as `serveNoun` above. */
function returnNoun(ball: BallFilter, count: number): string {
  const ret = count === 1 ? "return" : "returns";
  if (ball.length === 1 && ball[0] === "first") return `first-serve ${ret}`;
  if (ball.length === 1 && ball[0] === "second") return `second-serve ${ret}`;
  return ret;
}

function serveStatsGroup(
  zoneStats: Record<ZoneKey, ZoneStats> | null,
): StatGroup {
  const rows = ZONE_ROWS.map(({ key, label }) => {
    const zs = zoneStats?.[key];
    return makeRow(key, label, zs?.count ?? 0, (zs?.won ?? 0) + (zs?.ace ?? 0));
  });
  return { key: "serve-zones", label: null, rows: sortRows(rows) };
}

/**
 * A return landing counts toward the Direction/Depth rows only when it's a
 * real in-play landing: not an out/net miss (`outcome !== "miss"`, the same
 * flag `computeViz` sets from `returnOutcome`'s "outnet" case) and within
 * the court's real bounds (singles width, net-to-baseline depth) — a wide or
 * long return's landing coordinates fall outside those bounds by
 * construction. Excluded returns still count in `VizStats.total` (which
 * always equals `computeViz(...).count`); they just aren't one of these
 * rows' denominator, and the subtitle's own count reflects that.
 */
function isPlacementRow(d: VizDot): boolean {
  if (d.outcome === "miss") return false;
  return (
    Math.abs(d.lateralM) <= REAL_SINGLES_HALF_M + IN_COURT_EPS &&
    d.depthM >= -IN_COURT_EPS &&
    d.depthM <= REAL_NET_Y + IN_COURT_EPS
  );
}

/**
 * Direction (Crosscourt / Middle / Down the line): a return's landing sits
 * in one of three lateral thirds of the landing half's singles width. Which
 * outer third counts as "crosscourt" depends on which side the SERVE was
 * hit from/to (`getPointSide`, "deuce" ⇒ the serve landed with a negative
 * world-x, "ad" ⇒ positive — `serveLandingSide`'s own convention above).
 * `lateralM` is mirrored to read from BEHIND the returner
 * (`pointToReturnDots`'s doc comment), so `-lateralM` recovers that same
 * world-x sign. A return whose landing half matches the serve's side is
 * Down the line (it stayed on the side it was served to); the opposite side
 * is Crosscourt; the middle third is always Middle regardless of serve side.
 */
function directionKey(
  lateralM: number,
  serveSide: "deuce" | "ad",
): "crosscourt" | "middle" | "dtl" {
  const rawLx = -lateralM;
  const landingHalf: "deuce" | "ad" | "middle" =
    rawLx < -LATERAL_THIRD_M
      ? "deuce"
      : rawLx > LATERAL_THIRD_M
        ? "ad"
        : "middle";
  if (landingHalf === "middle") return "middle";
  return landingHalf === serveSide ? "dtl" : "crosscourt";
}

/** Deep / Mid / Short: thirds of the landing half's depth, measured from the
 * net (`depthM` 0 = net). Deep is the third nearest the baseline. */
function depthKeyPlacement(depthM: number): "deep" | "mid" | "short" {
  if (depthM < DEPTH_THIRD_M) return "short";
  if (depthM < 2 * DEPTH_THIRD_M) return "mid";
  return "deep";
}

function returnPlacementStats(
  result: VizResult,
  points: MatchPoint[],
): { subtitleCount: number; groups: StatGroup[] } {
  const pointById = new Map(points.map((p) => [p.id, p]));
  const eligible = result.dots.filter(isPlacementRow);

  const direction: Record<
    "crosscourt" | "middle" | "dtl",
    { count: number; won: number }
  > = {
    crosscourt: { count: 0, won: 0 },
    middle: { count: 0, won: 0 },
    dtl: { count: 0, won: 0 },
  };
  const depth: Record<
    "deep" | "mid" | "short",
    { count: number; won: number }
  > = {
    deep: { count: 0, won: 0 },
    mid: { count: 0, won: 0 },
    short: { count: 0, won: 0 },
  };

  for (const d of eligible) {
    const wonInc = d.outcome === "won" ? 1 : 0;
    const point = pointById.get(d.id);
    const serveSide = getPointSide(point?.pointScore);
    const dKey = directionKey(d.lateralM, serveSide);
    direction[dKey].count++;
    direction[dKey].won += wonInc;
    const pKey = depthKeyPlacement(d.depthM);
    depth[pKey].count++;
    depth[pKey].won += wonInc;
  }

  const directionGroup: StatGroup = {
    key: "direction",
    label: "Direction",
    rows: sortRows([
      makeRow(
        "crosscourt",
        "Crosscourt",
        direction.crosscourt.count,
        direction.crosscourt.won,
      ),
      makeRow("middle", "Middle", direction.middle.count, direction.middle.won),
      makeRow("dtl", "Down the line", direction.dtl.count, direction.dtl.won),
    ]),
  };
  const depthGroup: StatGroup = {
    key: "depth",
    label: "Depth",
    rows: sortRows([
      makeRow("deep", "Deep", depth.deep.count, depth.deep.won),
      makeRow("mid", "Mid", depth.mid.count, depth.mid.won),
      makeRow("short", "Short", depth.short.count, depth.short.won),
    ]),
  };

  return {
    subtitleCount: eligible.length,
    groups: [directionGroup, depthGroup],
  };
}

/** Inside the baseline / 0–5 ft behind / 5 ft+ behind — signed distance from
 * the returner's own baseline (`depthM`: negative = inside the court,
 * positive = behind it). 5ft = 1.524m; exactly on the baseline (`depthM ===
 * 0`) counts as 0–5 ft behind, matching the task's "on the line" rule. */
function contactDepthKey(depthM: number): "inside" | "near" | "far" {
  if (depthM < 0) return "inside";
  if (depthM < FIVE_FEET_M) return "near";
  return "far";
}

function returnContactStats(result: VizResult): StatGroup[] {
  const depth = {
    inside: { count: 0, won: 0 },
    near: { count: 0, won: 0 },
    far: { count: 0, won: 0 },
  };
  const stroke = {
    forehand: { count: 0, won: 0 },
    backhand: { count: 0, won: 0 },
  };

  for (const d of result.dots) {
    const wonInc = d.outcome === "won" ? 1 : 0;
    const dKey = contactDepthKey(d.depthM);
    depth[dKey].count++;
    depth[dKey].won += wonInc;
    const sKey = d.shape === "triangle" ? "backhand" : "forehand";
    stroke[sKey].count++;
    stroke[sKey].won += wonInc;
  }

  const depthGroup: StatGroup = {
    key: "depth",
    label: "Depth",
    rows: sortRows([
      makeRow(
        "inside",
        "Inside the baseline",
        depth.inside.count,
        depth.inside.won,
      ),
      makeRow("near", "0–5 ft behind", depth.near.count, depth.near.won),
      makeRow("far", "5 ft+ behind", depth.far.count, depth.far.won),
    ]),
  };
  const strokeGroup: StatGroup = {
    key: "stroke",
    label: "Stroke",
    rows: sortRows([
      makeRow(
        "forehand",
        "Forehand",
        stroke.forehand.count,
        stroke.forehand.won,
      ),
      makeRow(
        "backhand",
        "Backhand",
        stroke.backhand.count,
        stroke.backhand.won,
      ),
    ]),
  };

  return [depthGroup, strokeGroup];
}

/**
 * The stats card's data, for every cut — pure and built from the exact same
 * filtered pool `computeViz` produces for the same arguments, so a card can
 * never show a count the court doesn't back up. See the module doc comment
 * above for the `total` vs. subtitle-count distinction.
 *
 * `precomputed` (M2): pass a `VizResult` a caller already computed for the
 * SAME `points`/`cut`/`filters`/`subjectIsPlayer1` to skip a second,
 * identical `computeViz` pass — `viz-focused.tsx` needs both the court's
 * own result and these stats for one render. Omit it and this still runs
 * `computeViz` itself; behaviour is identical either way, since a caller
 * that passes it is only avoiding a redundant recompute of the exact same
 * inputs.
 */
export function computeVizStats(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  precomputed?: VizResult,
): VizStats {
  const result =
    precomputed ?? computeViz(points, cut, filters, subjectIsPlayer1);
  const total = result.count;

  if (cut === "serve") {
    const noun = serveNoun(filters.ball, total);
    const groups = [serveStatsGroup(result.zoneStats)];
    return {
      title: "Where the serve went",
      subtitle: `Points won by zone · ${total} ${noun}`,
      groups,
      sentence: buildSentence(groups, noun),
      total,
    };
  }

  if (cut === "returnPlacement") {
    const { subtitleCount, groups } = returnPlacementStats(result, points);
    const noun = returnNoun(filters.ball, subtitleCount);
    // The rows' denominator (subtitleCount) can be smaller than the total
    // drawable pool (total) when some returns landed out/net — say so
    // instead of printing a bare count that looks orphaned next to a court
    // and Filters header that both show `total`. The noun agrees with
    // whichever number it sits next to.
    const subtitle =
      subtitleCount === total
        ? `Points won by placement · ${subtitleCount} ${noun}`
        : `Points won by placement · ${subtitleCount} of ${total} ${returnNoun(filters.ball, total)} landed in`;
    return {
      title: "Where the return went",
      subtitle,
      groups,
      sentence: buildSentence(groups, noun),
      total,
    };
  }

  if (cut === "rallyPosition") {
    // Same depth-band + Forehand/Backhand builder returnContact uses —
    // `returnContactStats` only reads `result.dots`' `depthM`/`shape`, which
    // rally dots carry in the identical shape, so nothing rally-specific is
    // needed here beyond the noun and copy.
    const noun = total === 1 ? "shot" : "shots";
    const groups = returnContactStats(result);
    return {
      title: "Where rally shots were struck",
      subtitle: `Points won by contact point · ${total} ${noun}`,
      groups,
      sentence: buildSentence(groups, noun),
      total,
    };
  }

  // A1: the contact-cut subtitle noun follows the ball filter exactly as
  // returnPlacement's does, instead of hardcoding "returns".
  const noun = returnNoun(filters.ball, total);
  const groups = returnContactStats(result);
  return {
    title: "Where the return was struck",
    subtitle: `Points won by contact point · ${total} ${noun}`,
    groups,
    sentence: buildSentence(groups, noun),
    total,
  };
}
