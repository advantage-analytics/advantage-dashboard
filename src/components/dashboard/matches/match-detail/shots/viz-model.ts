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
  isFeedShotType,
  isServeShotType,
  pickRallyShots,
  pickServeShotBy,
} from "@/lib/data/serve-return-shots";
import {
  classifyPointResult,
  computeZoneStats as computeZoneStatsFromServeZones,
  pointToServeDot as pointToServeDotFromServeZones,
  type ServeDot,
  type ServePointInput,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";
import {
  DEFAULT_BANDS,
  contactBandRows,
  depthBandRows,
  makeContactBucketer,
  makeDepthBucketer,
  type BandRow,
  type BandSettings,
} from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";

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
 * Per-dot readout for the fullscreen viewer's hover card (Phase 2A, Task 2)
 * — every field is either already on the `MatchPoint`/`MatchShot` this dot
 * came from, or trivially derived from it; nothing here is fetched
 * separately, so the hover card can never show a value `computeViz` itself
 * didn't already have in hand.
 *
 * `wonBySubject` derives from `subjectIsPlayer1` (guardrails §4: "you" is
 * resolved once, everything below takes the resolved boolean), never from a
 * literal `"player1"` check — a player-2 viewer must see their OWN
 * won/lost, not the raw server-side winner.
 *
 * `speedMph` is `null` whenever the shot's own `MatchShot.speedMph` is
 * null (never fabricated — Global Constraints: "no fabricated serve
 * speed") — it does NOT reach back to a heavier per-shot query the way, say,
 * video alignment does; if a shot row has no speed, this dot has no speed.
 */
export interface VizDotMeta {
  setNumber: number;
  pointScore: string | null;
  wonBySubject: boolean;
  shotType: string | null;
  result: string | null;
  /**
   * Fix round 1: an ace is a POINT fact (`MatchPoint.resultType === "Ace"`),
   * not a shot `result` — a shot row for an ace still reads `"In"` — so the
   * readout could never say "Ace" off `result` alone. Threaded down from the
   * SAME expression that gives the dot its star shape (`computeViz`'s serve
   * branch), never re-derived here or downstream, so the star and the word
   * can't disagree. Always `false` off the serve cut: no other cut has aces.
   */
  isAce: boolean;
  speedMph: number | null;
}

/**
 * Every cut carries normalised court METRES (`lateralM`/`depthM`) —
 * `court-geometry.ts`'s `projectServeMetricDot`/`projectReturnDot` map those
 * onto their frame. Serve dots (Task 2): `depthM` holds
 * `ServePlacementMetrics.depthPastNetM` — negative for a net ball — and
 * `lateralM` the same signed metres `normalizeLanding` always produced.
 * Return dots: `projectReturnDot`'s "placement" vs "contact" kind
 * (`returnPlacement` vs `returnContact`) determines how `depthM` is read.
 *
 * (Fix round 1, F3: this type used to also carry `x`/`y`, the legacy 0..1
 * service-box fraction `mapRealCoordsToServeDot` produces — Task 2 moved
 * both `court-art.tsx` serve call sites onto the metre fields above (an
 * out/net serve can't be represented as an in-box fraction), which left
 * `x`/`y` hardcoded to 0 and read by nothing. Removed rather than left
 * unexplained; `projectServeDot`/`ServeDotFraction` in `court-geometry.ts`
 * still exist as a plain, independently-tested projection function — see
 * that file's own note — they just no longer feed this type.)
 *
 * `shape: "star"` is a serve-only addition (G2b): an ace draws as a star
 * instead of the usual outcome-coloured circle. Return-contact and rally
 * dots never take it — their circle/triangle already encodes
 * forehand/backhand, an axis orthogonal to "how did this shot end".
 *
 * `atNet` (fix round 4A) is a POSITION fact, not a style one — "this ball
 * never crossed the net, so its real (hitter's-own-side) coordinates aren't
 * where it should be drawn; draw it at the net line instead" — deliberately
 * separate from `shape`/`outcome`. A netted ball draws with the SAME shape
 * and colour an ordinary miss of that cut already has (a grey circle on
 * serve; the cut's own forehand-circle/backhand-triangle on the two return
 * cuts) — the user's explicit call: "Net should be folded into Miss as the
 * grey circle (triangle as well if it is a return/rally contact/
 * placement)." `court-geometry.ts`'s `netGutterFor` is the fixed position
 * `court-art.tsx` substitutes in when this is true; `atNet` dots are also
 * excluded from the heat density blobs (not a real position). Only
 * `serve` and `returnPlacement` dots ever set it — `returnContact`/
 * `rallyPosition` dots are drawn at their own contact point, which has no
 * "never crossed the net" concept.
 */
export interface VizDot {
  id: string;
  outcome: Outcome;
  shape: "circle" | "triangle" | "star";
  lateralM: number;
  depthM: number;
  atNet: boolean;
  /** Optional (fix round: every existing fixture that hand-builds a `VizDot`
   *  without it stays valid) — `computeViz`/`computeRallyViz` always set it
   *  for a real point/shot; only absent for a caller-constructed test dot
   *  that doesn't need the hover readout. */
  meta?: VizDotMeta;
}

export interface VizResult {
  dots: VizDot[];
  count: number; // points matching the filters (rallyPosition: matching SHOTS)
  total: number; // drawable points in the cut's pool (rallyPosition: drawable SHOTS)
  noun: "serves" | "returns" | "shots";
  zoneStats: Record<ZoneKey, ZoneStats> | null; // serve cut only
  /**
   * Serve cut only (undefined on every other cut) — how many of the drawn
   * serves (`dots`, matching `count`) have `kind === "out" || kind ===
   * "net"` (Task 2's `servePlacementMetrics`). Fix round 3: `zoneStats`'s
   * own population (`pointToServeDot`'s) is NOT an "in" count — it keeps
   * double faults and faults whose landing the tracker imputed at the
   * service line — so the stats-card subtitle needs this separate, honest
   * count instead of deriving one from `zoneStats`.
   */
  serveOutOrNetCount?: number;
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

/* ── Helpers moved from the retired shot-filters hook ────────────────────── */

const REAL_HALF_DOUBLES = 5.485;
const REAL_NET_Y = 11.885;
const REAL_COURT_LENGTH = 23.77;
// Same real-world constants `serve-zones.ts` already exports under these
// names — duplicated here (not imported) since `pointToServeDot` over there
// keeps its own gate untouched (Task 2's brief: that file isn't edited) and
// this module already keeps its own private copy of the other REAL_* consts
// above for the same reason.
const REAL_SERVICE_Y = 5.485;
const SERVE_BOX_DEPTH_M = REAL_NET_Y - REAL_SERVICE_Y; // ≈6.4
const SERVE_BOX_HALF_WIDTH_M = 4.115;
const SERVE_LINE_TOL_M = 0.2;

function normalizeLanding(lx: number, ly: number): { lx: number; ly: number } {
  if (ly > REAL_NET_Y) {
    return { lx: -lx, ly: REAL_COURT_LENGTH - ly };
  }
  return { lx, ly };
}

/* ── Serve placement metrics (Task 2) ─────────────────────────────────────
 *
 * `serve-zones.ts`'s `pointToServeDot` drops any serve that isn't flagged
 * "In" (or a double fault) once its landing falls outside the service box
 * plus tolerance, and clamps kept "In" serves into the box — so an out
 * serve never reaches the court and an on-the-line serve can't plot on the
 * line. `serve-zones.ts` isn't edited (it's shared with Home, the player
 * profile and the legacy serve-placement widget); `servePlacementMetrics`
 * below is a second, viz-only measurement used ONLY for the dots this cut
 * draws — `pointToServeDot` keeps computing the zone-stats population
 * exactly as before.
 *
 * End detection reads the serve's own CONTACT point, never the landing:
 * every normalisation elsewhere in this file (`normalizeLanding`,
 * `contactMetricsFromLanding`) flips on the LANDING crossing the net, which
 * is backwards for a netted ball — it bounces back on the HITTER'S OWN
 * side, so a landing-based flip mirrors a net ball the wrong way and sends
 * it to a spot on the opponent's side that was never struck. `contactY`
 * doesn't have that problem: the server always stands on their own side to
 * serve, so which side `contactY` falls on reliably says which end the
 * point is being served from, independent of where the ball ends up.
 *
 * (Fix round 2.) The in/out/net VERDICT, though, comes from the tracker's
 * own `result` string ("In" | "Out" | "Net"), not from geometry — SwingVision
 * does not measure a faulted serve's actual landing, it IMPUTES one at the
 * service line, so a real fault's landing coordinates read as "0.04m past
 * the line" and geometry alone (the box+tolerance rule below) misreads a
 * large share of genuine faults as "in". Ground truth across 25 matches: 334
 * `"Out"` serves (median depth 6.70m, up to 11.67m — real positions exist),
 * 37% of them pinned exactly at the service line by imputation; 76 `"Net"`
 * serves, several with a POSITIVE recorded depth (up to +6.23m) that
 * geometry alone would read as in-box. The geometric rule (unchanged) is
 * now only the FALLBACK, for a shot whose `result` is null/unrecognised.
 */
export type ServePlacementKind = "in" | "out" | "net";

export interface ServePlacementMetrics {
  /** Signed metres from the centre line, mirrored the same way
   *  `serve-zones.ts`'s `normalizeLanding` mirrors: positive = screen right. */
  lateralM: number;
  /** Metres past the net in the direction of travel. Negative = the ball
   *  came down on the server's own side, i.e. it hit the net. */
  depthPastNetM: number;
  kind: ServePlacementKind;
}

/**
 * The classification core, shared by `servePlacementMetrics`'s real
 * contact-based end detection and `computeViz`'s own defensive fallback
 * (a serve point whose `shots` row can't be resolved — no contact point to
 * read at all — falls back to the landing-based flip every other
 * normalisation in this file already uses, rather than dropping the point).
 *
 * `result` is the shot's own tracked call ("In" | "Out" | "Net" | null) —
 * the AUTHORITY for `kind` (fix round 2), checked before geometry:
 * - `"net"` when `result === "Net"` OR `depthPastNetM < 0` — a negative
 *   depth is physically a net ball no matter what the string says (a few
 *   corpus rows carry a positive recorded depth for a genuinely netted
 *   serve; this OR keeps those caught too).
 * - otherwise `"out"` when `result === "Out"`, `"in"` when
 *   `result === "In"` — trust the tracker's call over the (possibly
 *   imputed) coordinates.
 * - otherwise (no usable `result`) the geometric box+tolerance rule below,
 *   unchanged from round 1 — the only path a null/unrecognised `result`
 *   still has.
 */
function classifyServePlacement(
  farEnd: boolean,
  landingX: number,
  landingY: number,
  result: string | null | undefined,
): ServePlacementMetrics {
  const depthPastNetM = farEnd ? REAL_NET_Y - landingY : landingY - REAL_NET_Y;
  const lateralM = farEnd ? -landingX : landingX;
  const kind: ServePlacementKind =
    result === "Net" || depthPastNetM < 0
      ? "net"
      : result === "Out"
        ? "out"
        : result === "In"
          ? "in"
          : depthPastNetM <= SERVE_BOX_DEPTH_M + SERVE_LINE_TOL_M &&
              Math.abs(lateralM) <= SERVE_BOX_HALF_WIDTH_M + SERVE_LINE_TOL_M
            ? "in"
            : "out";
  return { lateralM, depthPastNetM, kind };
}

export function servePlacementMetrics(
  contactY: number | null | undefined,
  landingX: number | null | undefined,
  landingY: number | null | undefined,
  result: string | null | undefined,
): ServePlacementMetrics | null {
  if (contactY == null || landingX == null || landingY == null) return null;
  return classifyServePlacement(
    contactY > REAL_NET_Y,
    landingX,
    landingY,
    result,
  );
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
   * Landing: metres past the net, in the direction of travel — negative
   * means the return hit the net (Task 2, same convention
   * `ServePlacementMetrics.depthPastNetM` uses). Contact: signed metres
   * behind (+) / inside (−) the returner's own baseline (`projectReturnDot`'s
   * "contact" depth) — unrelated to the net, so this can't go negative for
   * the same reason.
   */
  depthM: number;
  /** Fix round 4A: the POSITION fact — see `VizDot.atNet`'s doc comment.
   * Always `false` on a `"contact"` dot (a contact point has no "never
   * crossed the net" concept); only a `"landing"` dot ever sets it. */
  atNet: boolean;
}

/**
 * The return frame's two dot kinds, in normalised court METRES rather than
 * any one SVG frame's pixels — `court-geometry.ts`'s `projectReturnDot`
 * turns these into the shared return frame's coordinates, separately for
 * "placement" (landing) and "contact".
 *
 * End detection (Task 2c/2d) reads each shot's own CONTACT point, never its
 * landing — the same reasoning `servePlacementMetrics`'s doc comment gives:
 * a netted ball bounces back on the HITTER'S OWN side, so a landing-based
 * flip (what this file used before) mirrors a net ball the wrong way. A
 * shot's contact point doesn't have that problem — the hitter always
 * struck it from their own side.
 */
interface ContactMetrics {
  lateralM: number;
  depthM: number;
}

/**
 * The contact-dot conversion `pointToReturnDots` and `computeRallyViz` both
 * need — pulled out once so any shot with its own contact pair (not just a
 * point's second shot) reuses the IDENTICAL conversion. Requires ONLY the
 * contact point (Task 2d) — a shot's own landing is irrelevant to where it
 * was STRUCK, so a missing/unusable landing no longer drops the dot the way
 * `contactMetricsFromLanding` (the function this replaces) used to.
 *
 * `farEnd = contactY > REAL_NET_Y` (the shot happened at the far half of the
 * fixed world frame) needs no separate mirror step the way the old
 * landing-driven version did — when the hitter is already at the far half
 * (`farEnd`), their own contact coordinates are already in the canonical
 * "hitter near `REAL_COURT_LENGTH`" frame this function targets; when they're
 * at the near half, mirroring `{-contactX, REAL_COURT_LENGTH - contactY}`
 * lands them there instead. The old `if (contactNorm.ly <= REAL_NET_Y) return
 * null` guard (kept a mistracked point from reading as "the hitter's contact
 * is on the wrong side of the net") is now unreachable by construction: a
 * contact past its own baseline reads correctly either way, so it's deleted
 * rather than kept as dead code.
 */
function contactMetrics(
  contactX: number | null | undefined,
  contactY: number | null | undefined,
): ContactMetrics | null {
  if (contactX == null || contactY == null) return null;
  const farEnd = contactY > REAL_NET_Y;
  return {
    lateralM: farEnd ? -contactX : contactX,
    // Positive = behind the baseline (outside the court), negative = inside
    // it — signed distance from `REAL_COURT_LENGTH`, the hitter's own
    // baseline in this normalised frame.
    depthM: farEnd ? contactY - REAL_COURT_LENGTH : -contactY,
  };
}

export function pointToReturnDots(
  p: MatchPoint,
  subjectIsPlayer1: boolean,
): ReturnDotMetric[] {
  const typeLower = (p.secondShotType ?? "").toLowerCase();
  const shape: "circle" | "triangle" =
    typeLower.includes("backhand") || typeLower.startsWith("bh")
      ? "triangle"
      : "circle";

  const dots: ReturnDotMetric[] = [];

  // The landing/placement dot needs a landing — the contact dot (below)
  // does not (Task 2d: `contactMetrics` only needs the contact pair), so a
  // missing landing must gate ONLY this dot, not the whole function (fix
  // round 1, F2 — the earlier single `if (...) return []` guard at the top
  // dropped the contact dot too whenever a return's landing was missing).
  if (p.secondShotLandingX != null && p.secondShotLandingY != null) {
    // End detection from the RETURNER's own contact point (Task 2c), same
    // `farEnd` primitive `servePlacementMetrics` uses — falls back to
    // today's landing-based flip (negated: `farEnd` and the old `didFlip`
    // are the same decision read from opposite ends of the shot) only when
    // there's no contact point to read at all, rather than dropping the dot.
    const farEnd =
      p.secondShotContactY != null
        ? p.secondShotContactY > REAL_NET_Y
        : !(p.secondShotLandingY > REAL_NET_Y);
    // `result` (fix round 2): the tracker's own call is the authority over
    // geometry, same reasoning `servePlacementMetrics`'s doc comment gives
    // — a netted return can carry a positive recorded depth, which
    // `classifyServePlacement`'s `result === "Net"` check still catches.
    const placement = classifyServePlacement(
      farEnd,
      p.secondShotLandingX,
      p.secondShotLandingY,
      p.secondShotResult,
    );

    // Mirrored world-x (leading minus, the same sign `classifyServePlacement`
    // already applies) so the court reads from BEHIND the returner —
    // positive lateralM is the returner's RIGHT. A netted return (`kind ===
    // "net"`) draws at the net gutter (`atNet`), never its real landing —
    // that spot is on the RETURNER's own side and was never a placement.
    // Fix round 4A: folded into Miss — same shape (forehand-circle /
    // backhand-triangle) an ordinary miss already has, `atNet` carries the
    // position fact separately. Routed on `kind`, not the sign of
    // `depthPastNetM` — a tracker-flagged net ball can carry a positive
    // recorded depth.
    dots.push({
      id: p.id,
      variant: "landing",
      shape,
      lateralM: placement.lateralM,
      depthM: placement.depthPastNetM,
      atNet: placement.kind === "net",
    });
  }

  const contact = contactMetrics(p.secondShotContactX, p.secondShotContactY);
  if (contact) {
    dots.push({
      id: `${p.id}:contact`,
      variant: "contact",
      shape,
      lateralM: contact.lateralM,
      depthM: contact.depthM,
      atNet: false,
    });
  }

  return dots;
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
 * Rally position (G3a): every shot AFTER the return the SUBJECT struck,
 * across every point — not gated on who served, unlike the serve/return arms
 * above, since a rally shot can come from either the server or the returner.
 * Rally shots are picked by ROLE (`pickRallyShots`, I1), not by
 * `shotNumber >= 3`: shot_number is unreliable (a faulted first serve and
 * the second serve actually played can share shot_number=1, colliding the
 * return with it too), the same reason `serve-return-shots.ts` exists.
 * `count`/`total`/`noun` are shot-counted rather
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

    const rallyShots = pickRallyShots(p.shots ?? [], (s) => s.shotType);
    for (const shot of rallyShots) {
      if (shot.isPlayer1 !== subjectIsPlayer1) continue;

      const metrics = contactMetrics(shot.contactX, shot.contactY);
      if (!metrics) continue;

      total++;
      if (!passes) continue;
      count++;

      dots.push({
        id: shot.id,
        lateralM: metrics.lateralM,
        depthM: metrics.depthM,
        outcome: subjectWon ? "won" : "lost",
        shape: shapeFromShotType(shot.shotType),
        atNet: false,
        meta: pointDotMeta(p, subjectIsPlayer1, shot),
      });
    }
  }

  return {
    dots,
    count,
    total,
    noun: "shots",
    zoneStats: null,
  };
}

/**
 * `VizDotMeta` common to every dot drawn for point `p`, plus the one shot
 * (`shotType`/`result`/`speedMph`) the specific dot came from — `serve`
 * reads the resolved serve shot, `returnPlacement`/`returnContact` the
 * resolved return shot, `rallyPosition` builds its own inline (a rally dot
 * already has its own `MatchShot` in hand from `pickRallyShots`, no
 * resolution needed).
 */
function pointDotMeta(
  p: MatchPoint,
  subjectIsPlayer1: boolean,
  shot:
    | {
        shotType?: string | null;
        result?: string | null;
        speedMph?: number | null;
      }
    | null
    | undefined,
  /** Passed in by the serve branch from the same expression that picks the
   *  star shape; every other cut leaves it at its default. */
  isAce = false,
): VizDotMeta {
  return {
    isAce,
    setNumber: p.setNumber,
    pointScore: p.pointScore ?? null,
    wonBySubject: p.wonByPlayer1 === subjectIsPlayer1,
    shotType: shot?.shotType ?? null,
    result: shot?.result ?? null,
    speedMph: shot?.speedMph ?? null,
  };
}

/**
 * The return shot actually played — the same role classification
 * `pickReturnShot` (`serve-return-shots.ts`) uses (first shot that's
 * neither a serve nor the `Feed` row), reimplemented against `MatchShot`'s
 * camelCase `shotType` here rather than imported: `pickReturnShot` is typed
 * against the raw DB row's snake_case `ShotLike` (`shot_type`), the same
 * reason `pickServeShotBy` exists as `pickServeShot`'s accessor-taking
 * sibling — this file has no reason to add a third exported picker to
 * `serve-return-shots.ts` for a single internal call site.
 */
function pointReturnShot(p: MatchPoint): MatchShot | undefined {
  return p.shots?.find(
    (s) => !isServeShotType(s.shotType) && !isFeedShotType(s.shotType),
  );
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
  let serveOutOrNetCount = 0;
  const dots: VizDot[] = [];
  const serveDots: ServeDot[] = [];

  for (const p of points) {
    if (frame === "serve") {
      if (p.serverIsPlayer1 !== subjectIsPlayer1) continue;

      // Resolve the serve actually played by ROLE (never `shot_number` —
      // guardrails §I1), not by array position, so a faulted first serve
      // sharing a shot_number with the second serve can't collide.
      const serveShot = pickServeShotBy(p.shots ?? [], (s) => s.shotType);
      const landingX = serveShot?.landingX ?? p.firstShotLandingX ?? null;
      const landingY = serveShot?.landingY ?? p.firstShotLandingY ?? null;
      // Primary: end detection from the resolved serve shot's own CONTACT
      // point. Fallback (no `shots` row to read a contact point from at
      // all — legacy/fixture data): the landing-based test every other
      // normalisation in this file used before Task 2, negated (`farEnd`
      // and the old `didFlip` read the same decision from opposite ends of
      // the shot — see `classifyServePlacement`'s own doc comment).
      // `result` (fix round 2): the resolved shot's own tracked call on the
      // primary path, the point's flattened `firstShotResult` on the
      // fallback path — both are the AUTHORITY over the geometric rule.
      const metrics =
        servePlacementMetrics(
          serveShot?.contactY,
          landingX,
          landingY,
          serveShot?.result,
        ) ??
        (landingX != null && landingY != null
          ? classifyServePlacement(
              !(landingY > REAL_NET_Y),
              landingX,
              landingY,
              p.firstShotResult,
            )
          : null);
      if (!metrics) continue;

      total++;
      if (!pointMatchesFilters(p, filters, "serve", subjectIsPlayer1)) continue;
      count++;
      if (metrics.kind === "out" || metrics.kind === "net") {
        serveOutOrNetCount++;
      }

      // The zone-stats population is UNCHANGED — still exactly what
      // `pointToServeDot` returns (Task 2's brief: `serve-zones.ts` isn't
      // touched), independent of whether `metrics` above drew a dot for an
      // out/net serve that never reached that population before.
      const serveInput = toServeInput(p);
      const zoneDot = pointToServeDotFromServeZones(serveInput);
      if (zoneDot) serveDots.push(zoneDot);

      // Fix round 1: ONE expression for "this serve is an ace", read by both
      // the dot's star shape and its `meta.isAce`, so the glyph and the
      // readout's first line can never disagree.
      const isAce = p.resultType === "Ace";

      // Fix round 1: mirror the return branch's flattened-field fallback —
      // `serveShot` can be `undefined` (a point whose `shots` row wasn't
      // resolvable at all; the dot still draws off `p.firstShotLandingX/Y`/
      // `p.firstShotResult` above via `classifyServePlacement`'s fallback
      // path), and without this fallback its `meta` silently went blank
      // even though the point's own flattened fields had the answer.
      // `speedMph` has no flattened equivalent, so it stays `serveShot?.
      // speedMph ?? null` — never fabricated.
      const serveMetaShot = {
        shotType: serveShot?.shotType ?? p.firstShotType ?? null,
        result: serveShot?.result ?? p.firstShotResult ?? null,
        speedMph: serveShot?.speedMph ?? null,
      };

      dots.push({
        id: p.id,
        lateralM: metrics.lateralM,
        depthM: metrics.depthPastNetM,
        // "in" reads the point's own result (won/lost/ace/doubleFault, same
        // classification `serve-zones.ts` uses); "out"/"net" always miss.
        outcome:
          metrics.kind === "in"
            ? serveOutcome(classifyPointResult(serveInput))
            : "miss",
        // G2b: an ace draws as a star (an ace is always "in" — already
        // gated to the subject's own serves above). Fix round 4A: a net
        // serve folds into Miss's ordinary grey circle — no separate shape
        // — `atNet` below carries the "drawn at the net, not its real
        // landing" fact instead.
        shape: isAce ? "star" : "circle",
        atNet: metrics.kind === "net",
        meta: pointDotMeta(p, subjectIsPlayer1, serveMetaShot, isAce),
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
      // `pointReturnShot` reads `p.shots` by role — but plenty of fixtures
      // (and legacy/imported points) only ever populate the flattened
      // `secondShotType`/`secondShotResult` fields, not a full `shots` row
      // for the return. Fall back to those the same way the serve branch's
      // `landingX`/`landingY` already fall back to `p.firstShotLanding*`.
      const returnShot = pointReturnShot(p);
      const returnMetaShot = {
        shotType: returnShot?.shotType ?? p.secondShotType ?? null,
        result: returnShot?.result ?? p.secondShotResult ?? null,
        speedMph: returnShot?.speedMph ?? null,
      };
      for (const d of mine) {
        dots.push({
          id: d.id,
          lateralM: d.lateralM,
          depthM: d.depthM,
          outcome: o === "outnet" ? "miss" : o,
          shape: d.shape,
          atNet: d.atNet,
          meta: pointDotMeta(p, subjectIsPlayer1, returnMetaShot),
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
    serveOutOrNetCount: cut === "serve" ? serveOutOrNetCount : undefined,
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

/** Zero-initialized `{count, won}` per row `key`, built fresh from `rows` so
 *  no scheme's accumulator carries a stale key from a previous render. */
function bandRowAccumulator(
  rows: BandRow[],
): Record<string, { count: number; won: number }> {
  const acc: Record<string, { count: number; won: number }> = {};
  for (const row of rows) acc[row.key] = { count: 0, won: 0 };
  return acc;
}

function returnPlacementStats(
  result: VizResult,
  points: MatchPoint[],
  bands: BandSettings,
  unit: DistanceUnit,
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
  // `"none"` → `depthBandRows` returns `[]`: the Depth group is omitted below
  // rather than rendered with zero rows.
  const depthRows = depthBandRows(bands, unit);
  const depth = bandRowAccumulator(depthRows);
  // Fix round 2 (#3): hoisted once per call rather than resolved fresh per
  // dot inside the loop below.
  const depthBucket = makeDepthBucketer(bands);

  for (const d of eligible) {
    const wonInc = d.outcome === "won" ? 1 : 0;
    const point = pointById.get(d.id);
    const serveSide = getPointSide(point?.pointScore);
    const dKey = directionKey(d.lateralM, serveSide);
    direction[dKey].count++;
    direction[dKey].won += wonInc;
    if (depthRows.length > 0) {
      const pKey = depthRows[depthBucket(d.depthM)].key;
      depth[pKey].count++;
      depth[pKey].won += wonInc;
    }
  }

  // Fix round 2 (#7 — RULING): under `depthScheme: "inside"` ONLY, the
  // "Beyond the baseline" row could otherwise never populate — every
  // ordinary in-court landing reads as "Inside the baseline" (see
  // `viz-bands.ts`'s "inside is a single divider at 0" spec), and
  // `isPlacementRow` excludes every miss outright, including a genuinely
  // LONG one that landed past the far baseline. So under "inside" ONLY, a
  // miss that is (a) not netted (`!d.atNet`) and (b) buckets to index 0
  // (`depthFromNetM >= COURT_HALF_M`, i.e. AT OR PAST the far baseline —
  // "long", not "wide") still counts in that one row. Every other scheme,
  // and every other miss under "inside" itself (a wide-but-not-long out
  // call, or a net ball), stays excluded exactly as today — Direction is
  // never touched, `subtitleCount` below is built from `eligible` alone
  // (unchanged), and DEFAULT_BANDS's thirds regression spec is untouched
  // since this block only ever runs for `depthScheme === "inside"`.
  if (bands.depthScheme === "inside" && depthRows.length > 0) {
    for (const d of result.dots) {
      if (d.outcome !== "miss" || d.atNet) continue;
      const idx = depthBucket(d.depthM);
      if (idx !== 0) continue; // wide-but-not-long stays excluded
      const pKey = depthRows[idx].key;
      depth[pKey].count++;
      // A miss is never "won" — nothing to add to `depth[pKey].won`.
    }
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

  const groups: StatGroup[] = [directionGroup];
  if (depthRows.length > 0) {
    groups.push({
      key: "depth",
      label: "Depth",
      rows: sortRows(
        depthRows.map((row) =>
          makeRow(row.key, row.label, depth[row.key].count, depth[row.key].won),
        ),
      ),
    });
  }

  return {
    subtitleCount: eligible.length,
    groups,
  };
}

/** Depth (bands) + Forehand/Backhand rows for a contact/rally cut, following
 *  `bands.contactDividersFt` — with `DEFAULT_BANDS` this is EXACTLY "Inside
 *  the baseline" / "0–5 ft behind" / "5 ft+ behind", today's rows unchanged
 *  (pinned by `tests/viz-model.spec.ts`'s regression spec). */
function returnContactStats(
  result: VizResult,
  bands: BandSettings,
  unit: DistanceUnit,
): StatGroup[] {
  // Always exactly three rows (two dividers) — `contactBandRows` never
  // returns `[]`, unlike `depthBandRows`'s `"none"` case.
  const contactRows = contactBandRows(bands, unit);
  const depth = bandRowAccumulator(contactRows);
  const stroke = {
    forehand: { count: 0, won: 0 },
    backhand: { count: 0, won: 0 },
  };
  // Fix round 2 (#3): hoisted once per call rather than resolved fresh per
  // dot inside the loop below.
  const contactBucket = makeContactBucketer(bands);

  for (const d of result.dots) {
    const wonInc = d.outcome === "won" ? 1 : 0;
    const dKey = contactRows[contactBucket(d.depthM)].key;
    depth[dKey].count++;
    depth[dKey].won += wonInc;
    const sKey = d.shape === "triangle" ? "backhand" : "forehand";
    stroke[sKey].count++;
    stroke[sKey].won += wonInc;
  }

  const depthGroup: StatGroup = {
    key: "depth",
    label: "Depth",
    rows: sortRows(
      contactRows.map((row) =>
        makeRow(row.key, row.label, depth[row.key].count, depth[row.key].won),
      ),
    ),
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
 *
 * `bands`/`unit` (Phase 2B): the workspace's depth/contact band settings
 * (`viz-bands.ts`) and the unit to render their labels in. REQUIRED, with no
 * defaults: a caller that forgot to thread them through would otherwise
 * silently ignore the workspace's bands and the viewer's units.
 */
export function computeVizStats(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  precomputed: VizResult | undefined,
  bands: BandSettings,
  unit: DistanceUnit,
): VizStats {
  const result =
    precomputed ?? computeViz(points, cut, filters, subjectIsPlayer1);
  const total = result.count;

  if (cut === "serve") {
    const noun = serveNoun(filters.ball, total);
    const groups = [serveStatsGroup(result.zoneStats)];
    // Fix round 3: the zone rows' population is `pointToServeDot`'s
    // (unchanged, `serve-zones.ts` isn't touched) — it KEEPS double faults
    // and it KEEPS faults whose landing the tracker never actually
    // measured (SwingVision imputes an at-the-line coordinate for a fault
    // it didn't track), so it has never been a count of serves that landed
    // in and must not be labelled as one (that's what produced the false
    // "33 of 34 landed in" reading round 2 shipped). The honest number
    // instead: `result.serveOutOrNetCount`, built alongside the dots
    // themselves from each serve's own `kind` ("out"/"net"), independent of
    // the zone population entirely.
    const outOrNet = result.serveOutOrNetCount ?? 0;
    const subtitle =
      outOrNet === 0
        ? `Points won by zone · ${total} ${noun}`
        : `Points won by zone · ${total} ${noun} · ${outOrNet} out or into the net`;
    return {
      title: "Where the serve went",
      subtitle,
      groups,
      sentence: buildSentence(groups, noun),
      total,
    };
  }

  if (cut === "returnPlacement") {
    const { subtitleCount, groups } = returnPlacementStats(
      result,
      points,
      bands,
      unit,
    );
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
    const groups = returnContactStats(result, bands, unit);
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
  const groups = returnContactStats(result, bands, unit);
  return {
    title: "Where the return was struck",
    subtitle: `Points won by contact point · ${total} ${noun}`,
    groups,
    sentence: buildSentence(groups, noun),
    total,
  };
}
