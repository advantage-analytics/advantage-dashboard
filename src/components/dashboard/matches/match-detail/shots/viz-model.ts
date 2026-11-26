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
import { readPointScore } from "../film/film-score";
import { netPathX } from "../net-crossing";
import {
  countedShots,
  isFeedShotType,
  isServeShotType,
  pickRallyShots,
  pickServeShotBy,
} from "@/lib/data/serve-return-shots";
import {
  classifyPointResult,
  ZONES,
  type ServeDot,
  type ServePointInput,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";
import {
  contactBandRows,
  depthBandRows,
  makeContactBucketer,
  makeDepthBucketer,
  resolveDepthDividersFt,
  type BandRow,
  type BandSettings,
} from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";
import {
  applyMatchFilters,
  EMPTY_MATCH_FILTERS,
  errorMadeBy,
  hasActiveMatchFilters,
  hasCustom,
  hasNet,
  hasThen,
  shotMatchesCustom,
  shotMatchesNet,
  shotMatchesThen,
  finalShotOf,
  handOf,
  isPressurePoint,
  lastShotOf,
  type MatchFilterContext,
  type MatchFilterKey,
  type MatchFilters,
} from "../match-filters/model";
import {
  APPROACH_BUCKET_LABEL,
  approachLateralM,
  approachOf,
  LATERAL_THIRD_M,
  SINGLES_HALF_M,
  type Approach,
  type ApproachDirection,
  type ApproachEndingBucket,
  type ApproachWing,
} from "../match-filters/approach";
import type { NetEnding, NetEntry } from "../match-filters/net-game";
import { hitterHalf, type Hand } from "../match-filters/shot-geometry";
import { bandKindFor, marksAreShots } from "./cut-kinds";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type Cut =
  | "serve"
  | "returnPlacement"
  | "returnContact"
  | "rallyPosition"
  | "rallyPlacement"
  | "errors"
  | "approaches";
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
/**
 * `pressure` is the score a point was played at (`isPressurePoint`: 30–30,
 * 30–40, 40–30, deuce and every advantage); `break` and `setMatch` read the
 * point's own flags, at whatever score.
 */
export type PressureValue = "pressure" | "break" | "setMatch";
export type ResultValue = "won" | "lost" | "ace";
export type RallyValue = "short" | "medium" | "long";
/** The errors cut's error kinds, read off the point's free-text result type. */
export type ErrorValue = "unforced" | "forced" | "doubleFault";

export type SetFilter = readonly number[];
export type GameFilter = readonly GameValue[];
export type BallFilter = readonly BallValue[];
export type CourtSideFilter = readonly CourtSideValue[];
export type ZoneFilter = readonly ZoneValue[];
export type PressureFilter = readonly PressureValue[];
export type ResultFilter = readonly ResultValue[];
export type RallyFilter = readonly RallyValue[];
export type ErrorFilter = readonly ErrorValue[];
export type EntryFilter = readonly NetEntry[];
export type ApproachToFilter = readonly ApproachWing[];
export type ApproachDirFilter = readonly ApproachDirection[];

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
  /** Errors cut only: which errors are plotted. Empty = every error. */
  error: ErrorFilter;
  /** Approaches cut only: how the subject came in. Empty = every entry. */
  entry: EntryFilter;
  /** Approaches cut only: the opponent's wing the approach went to. */
  approachTo: ApproachToFilter;
  /** Approaches cut only: the approach shot's direction. */
  approachDir: ApproachDirFilter;
  /**
   * The Video tab's advanced filters (`match-filters/model.ts`), edited
   * through the same `FiltersPanel`. AND'd with every group above. Its
   * players are you/opponent-relative — never the court's subject.
   */
  match: MatchFilters;
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
  error: [],
  entry: [],
  approachTo: [],
  approachDir: [],
  match: EMPTY_MATCH_FILTERS,
};

export type Outcome = "won" | "lost" | "miss";

/**
 * Per-dot readout for the fullscreen viewer's hover card — every field is
 * either already on the `MatchPoint`/`MatchShot` this dot
 * came from, or trivially derived from it; nothing here is fetched
 * separately, so the hover card can never show a value `computeViz` itself
 * didn't already have in hand.
 *
 * `wonBySubject` derives from `subjectIsPlayer1` (guardrails §4: "you" is
 * resolved once, everything below takes the resolved boolean), never from a
 * literal `"player1"` check — a player-2 viewer must see their OWN
 * won/lost, not the raw server-side winner.
 *
 * No shot speed: single-camera speed is not accurate, so it is never loaded
 * (`MatchShot` has none) and no readout prints it.
 */
export interface VizDotMeta {
  /** Source point, shared by all rally-shot marks from that point. */
  pointId?: string;
  setNumber: number;
  pointScore: string | null;
  wonBySubject: boolean;
  shotType: string | null;
  result: string | null;
  /**
   * An ace is a POINT fact (`MatchPoint.resultType === "Ace"`),
   * not a shot `result` — a shot row for an ace still reads `"In"` — so the
   * readout could never say "Ace" off `result` alone. Threaded down from the
   * SAME expression that gives the dot its star shape (`computeViz`'s serve
   * branch), never re-derived here or downstream, so the star and the word
   * can't disagree. Always `false` off the serve cut: no other cut has aces.
   */
  isAce: boolean;
  /**
   * Errors cut only: the stroke the point ended on, by Result › Shot's own
   * rule (`finalShotOf`) — so the stats card's Stroke rows and that filter
   * always agree on a point. Absent everywhere else.
   */
  stroke?: string;
  /** Approaches cut only: how the subject came in (`netEntryOf`). */
  entry?: NetEntry;
  /** Approaches cut only: the opponent's wing the approach went to. */
  wing?: ApproachWing | null;
  /** Approaches cut only: the approach shot's direction; null for a serve. */
  direction?: ApproachDirection | null;
  /** Approaches cut only: how the point ended (`netEndingOf`). */
  ending?: NetEnding;
  /** Approaches cut only: the "How it ended" row `ending` falls in. */
  bucket?: ApproachEndingBucket;
  /** Approaches cut only: `wing` assumes a right-handed opponent. */
  handAssumed?: boolean;
  /**
   * Approaches cut only: the hand `wing` was worked out from — the seat the
   * subject approached against — or null where the match does not give it
   * (`handAssumed`). Carried so a court over several opponents (the
   * season's) can tell whether they share one hand, which a middle-lane
   * wing alone cannot say (`approachLeftLaneSide`, `court-art.tsx`).
   */
  opponentHand?: Hand | null;
}

/**
 * Every cut carries normalised court METRES (`lateralM`/`depthM`) —
 * `court-geometry.ts`'s `projectServeMetricDot`/`projectReturnDot` map those
 * onto their frame. Serve dots: `depthM` holds
 * `ServePlacementMetrics.depthPastNetM` — negative for a net ball — and
 * `lateralM` measured to the server's right (rotate x at the high-y end).
 * Return dots: `projectReturnDot`'s "placement" vs "contact" kind
 * (`returnPlacement` vs `returnContact`) determines how `depthM` is read.
 *
 * (This type used to also carry `x`/`y`, the legacy 0..1
 * service-box fraction `mapRealCoordsToServeDot` produces — moved
 * both `court-art.tsx` serve call sites onto the metre fields above (an
 * out/net serve can't be represented as an in-box fraction), which left
 * `x`/`y` hardcoded to 0 and read by nothing. Removed rather than left
 * unexplained; `projectServeDot`/`ServeDotFraction` in `court-geometry.ts`
 * still exist as a plain, independently-tested projection function — see
 * that file's own note — they just no longer feed this type.)
 *
 * `shape: "star"` is a serve-only addition: an ace draws as a star
 * instead of the usual outcome-coloured circle. Return-contact and rally
 * dots never take it — their circle/triangle already encodes
 * forehand/backhand, an axis orthogonal to "how did this shot end".
 *
 * `atNet` is a POSITION fact, not a style one — "this ball
 * never crossed the net, so its real (hitter's-own-side) coordinates aren't
 * where it should be drawn; draw it at the net line instead" — its
 * `lateralM` then being where its contact → landing path meets the net
 * (`netDotLateralM`) when that is known — deliberately
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
  /**
   * Approaches cut only: where the approach shot was struck, in
   * `contactMetrics`' frame. The dot's own `lateralM`/`depthM` stay the
   * placement, so code that reads one position per dot is unaffected. Absent
   * when the contact is unmeasured.
   */
  pair?: { lateralM: number; depthM: number };
  /** Optional (every existing fixture that hand-builds a `VizDot`
   *  without it stays valid) — `computeViz`/`computeRallyViz` always set it
   *  for a real point/shot; only absent for a caller-constructed test dot
   *  that doesn't need the hover readout. */
  meta?: VizDotMeta;
}

/**
 * What a list or a count needs of a mark, without a place on court: a
 * `VizDot` is one, and so is an Approaches entry with no landing
 * (`VizResult.undrawn`).
 */
export type VizMark = Pick<VizDot, "id" | "outcome" | "shape" | "meta">;

export interface VizResult {
  dots: VizDot[];
  /**
   * Approaches cut only: the counted approaches with no placement, in match
   * order — counted in `count` but never drawn, so `count - dots.length` is
   * their number. The lightbox's Points list, its count and Watch read them
   * with the dots (`resultMarks`); the court never does. Absent on every
   * other cut.
   */
  undrawn?: VizMark[];
  count: number; // points matching the filters (rallyPosition: matching SHOTS)
  total: number; // drawable points in the cut's pool (rallyPosition: drawable SHOTS)
  noun: "serves" | "returns" | "shots" | "errors" | "approaches";
  zoneStats: Record<ZoneKey, ZoneStats> | null; // serve cut only
  /** Drawable out/net serves, excluded from the service-zone denominator. */
  serveOutOrNetCount?: number;
}

/** All three chart types support every visualization cut except Errors,
 * which has no service boxes or bands to count into — scatter and heat —
 * and Approaches, whose dot is a contact/placement pair — scatter only. */
export function chartAllowedOn(cut: Cut, chart: Chart): boolean {
  if (cut === "approaches") return chart === "scatter";
  if (cut === "errors") return chart === "scatter" || chart === "heat";
  return (
    [
      "serve",
      "returnPlacement",
      "returnContact",
      "rallyPosition",
      "rallyPlacement",
    ].includes(cut) && ["scatter", "heat", "zones"].includes(chart)
  );
}

const CHARTS: readonly Chart[] = ["scatter", "zones", "heat"];

/** The charts `cut` can be drawn as (`chartAllowedOn`), in menu order. */
export function chartsFor(cut: Cut): Chart[] {
  return CHARTS.filter((chart) => chartAllowedOn(cut, chart));
}

/* ── Helpers moved from the retired shot-filters hook ────────────────────── */

const REAL_NET_Y = 11.885;
const REAL_COURT_LENGTH = 23.77;
const REAL_SERVICE_Y = 5.485;
const SERVE_BOX_DEPTH_M = REAL_NET_Y - REAL_SERVICE_Y; // ≈6.4
const SERVE_BOX_HALF_WIDTH_M = SINGLES_HALF_M; // the box spans the singles width
const SERVE_LINE_TOL_M = 0.2;

/* ── Serve placement metrics ───────────────────────────────────────────────
 *
 * Dots, service-side filters and zone stats share these measurements. The
 * legacy serve-zones.ts landing-based x flip is opposite to this court,
 * viewed from behind the server. Reusing its normalized dots for aggregation
 * swapped deuce/ad totals while the plotted dots were
 * already correct. Keep that legacy helper isolated to its other callers.
 *
 * End detection reads the serve's own CONTACT point, never the landing:
 * a landing-only normalisation flips on the LANDING crossing the net, which
 * is backwards for a netted ball — it bounces back on the HITTER'S OWN
 * side, so a landing-based flip mirrors a net ball the wrong way and sends
 * it to a spot on the opponent's side that was never struck. `contactY`
 * doesn't have that problem: the server always stands on their own side to
 * serve, so which side `contactY` falls on reliably says which end the
 * point is being served from, independent of where the ball ends up.
 *
 * The in/out/net VERDICT, though, comes from the tracker's
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
  /** Signed metres from centre, positive to the server's right. */
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
 * the AUTHORITY for `kind`, checked before geometry:
 * - `"net"` when `result === "Net"` OR `depthPastNetM < 0` — a negative
 *   depth is physically a net ball no matter what the string says (a few
 *   corpus rows carry a positive recorded depth for a genuinely netted
 *   serve; this OR keeps those caught too).
 * - otherwise `"out"` when `result === "Out"`, `"in"` when
 *   `result === "In"` — trust the tracker's call over the (possibly
 *   imputed) coordinates.
 * - otherwise (no usable `result`) the geometric box+tolerance rule below,
 *   unchanged from before — the only path a null/unrecognised `result`
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
  if (
    contactY == null ||
    !Number.isFinite(contactY) ||
    landingX == null ||
    !Number.isFinite(landingX) ||
    landingY == null ||
    !Number.isFinite(landingY)
  )
    return null;
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

/** A shot type counts as a first serve unless its label mentions "second". */
export function isFirstServeShotType(
  shotType: string | null | undefined,
): boolean {
  return !(shotType?.toLowerCase().includes("second") ?? false);
}

export function isFirstServePoint(p: MatchPoint): boolean {
  return isFirstServeShotType(p.firstShotType);
}

export function isReturnOnFirstServe(p: MatchPoint): boolean {
  return p.firstShotType === "First Serve" && p.firstShotResult === "In";
}

/** Equal thirds of the actual 4.115 m service-box half-width. Boundary
 * balls belong to the outward zone; both sidelines belong to Wide. */
export function deriveZoneFromX(lx: number): "t" | "body" | "wide" {
  const a = Math.abs(lx);
  const third = SERVE_BOX_HALF_WIDTH_M / 3;
  return a >= 2 * third ? "wide" : a >= third ? "body" : "t";
}

function resolvedServe(p: MatchPoint) {
  const shot = pickServeShotBy(
    p.shots ?? [],
    (s) => s.shotType,
    (s) => s.shotNumber,
  );
  return serveFromShot(p, shot);
}

/**
 * The point's FIRST serve, struck — in or not. `resolvedServe` is the serve
 * that was played (the second, after a fault), so a faulted first serve is
 * on no court there; this is the one the Ball › 1st court draws instead
 * (`firstServesStruck`). Null when the point has no first serve: a serve
 * row list that holds only a second serve, or a point with no rows whose
 * played serve was the second.
 */
function firstServeStruck(p: MatchPoint) {
  const serves = (p.shots ?? []).filter((s) => isServeShotType(s.shotType));
  if (serves.length === 0) {
    // No serve rows: the flattened fields are the played serve, which is
    // the first serve only when it is labelled one.
    return isFirstServePoint(p) ? serveFromShot(p, undefined) : null;
  }
  const counted = serves.filter((s) => (s.shotNumber ?? 0) >= 1);
  const pool = counted.length > 0 ? counted : serves;
  const played = pool.find((s) => isFirstServeShotType(s.shotType));
  if (played) return serveFromShot(p, played);
  // Played on the second serve. A faulted first serve is stored BEFORE the
  // serve that counted — shot 0, where `countedShots` skips it as pre-serve
  // — so it is read here directly: the last first-serve row before it.
  const faulted = serves
    .filter((s) => (s.shotNumber ?? 0) < 1 && isFirstServeShotType(s.shotType))
    .at(-1);
  return faulted ? serveFromShot(p, faulted) : null;
}

/**
 * The Ball filter is exactly 1st: the serve court draws every FIRST serve
 * struck, faults included, rather than the points played on a first serve
 * — so the court reads as first-serve percentage and where the misses
 * went. Zone shares still count only the serves that landed in
 * (`computeServeZoneStats`). Both pills, or neither, or 2nd alone: one
 * serve per point, the one played, as before.
 */
export function firstServesStruck(cut: Cut, ball: BallFilter): boolean {
  return cut === "serve" && ball.length === 1 && ball[0] === "first";
}

function serveFromShot(p: MatchPoint, shot: MatchShot | undefined) {
  // A resolved row is authoritative as a pair. Never manufacture a landing
  // by mixing one missing shot coordinate with a different flattened row.
  const landingX = shot ? shot.landingX : p.firstShotLandingX;
  const landingY = shot ? shot.landingY : p.firstShotLandingY;
  const result = shot ? shot.result : p.firstShotResult;
  if (
    landingX == null ||
    landingY == null ||
    !Number.isFinite(landingX) ||
    !Number.isFinite(landingY)
  )
    return null;
  const metrics =
    servePlacementMetrics(shot?.contactY, landingX, landingY, result) ??
    classifyServePlacement(
      !(landingY > REAL_NET_Y),
      landingX,
      landingY,
      result,
    );
  return { shot, metrics };
}

const GAME_RUNG: Record<string, number> = {
  "0": 0,
  "15": 1,
  "30": 2,
  "40": 3,
  A: 4,
  AD: 4,
};

/**
 * The service court a point's score puts the server in: the parity of the
 * rungs in a game (0-0, 15-15, 30-0, 40-40 deuce; 15-0, 30-15, Ad-40 ad), the
 * parity of the points played in a tiebreak (game score 6-6, or a count that
 * is no game rung). Null when the score was never read (`pointScoreRaw`
 * null), was frozen, or does not parse — never a guess from a defaulted "0-0".
 */
function scoreServeSide(p: MatchPoint): "deuce" | "ad" | null {
  if (p.scoreFrozen) return null;
  const raw = readPointScore(p);
  if (raw == null) return null;
  const s = raw.toUpperCase().trim();
  if (s === "DEUCE") return "deuce";
  const parts = s.split("-").map((x) => x.trim());
  if (parts.length !== 2) return null;
  const games = (p.gameScore ?? "").split("-").map((x) => Number(x.trim()));
  const tiebreak = games.length === 2 && games[0] >= 6 && games[0] === games[1];
  const asInt = parts.map((x) => (/^\d+$/.test(x) ? Number(x) : null));
  const asRung = parts.map((x) => GAME_RUNG[x] ?? null);
  const counts = tiebreak || asRung.some((r) => r === null) ? asInt : asRung;
  if (counts[0] === null || counts[1] === null) return null;
  return (counts[0] + counts[1]) % 2 === 0 ? "deuce" : "ad";
}

/**
 * The service court the server served FROM — the side the Court filter and
 * the serve stat rows mean. A serve that landed in can only have landed in
 * the box diagonal to the server, so its landing answers it (and outranks a
 * score the vendor may have misread). A fault is different: it can land in
 * the other box — an ad-court serve long and wide lands in the deuce box —
 * so reading its landing put it under the wrong side. For a fault the score
 * is the rule; where it is unread, the server's own contact position
 * (`hitterHalf`, which faces the net from either end); only then the landing,
 * and last the defaulted score.
 */
function serveSideOf(
  p: MatchPoint,
  serve: ReturnType<typeof serveFromShot> = resolvedServe(p),
): "deuce" | "ad" {
  const landed = serve ? (serve.metrics.lateralM < 0 ? "deuce" : "ad") : null;
  if (serve?.metrics.kind === "in" && landed) return landed;
  const fromScore = scoreServeSide(p);
  if (fromScore) return fromScore;
  const contact = serve?.shot ? hitterHalf(serve.shot) : null;
  return contact ?? landed ?? getPointSide(p.pointScore);
}

/** `serveSideOf` for a dot whose point may be missing (defaults like no score). */
function servedFromSide(p: MatchPoint | undefined): "deuce" | "ad" {
  return p ? serveSideOf(p) : getPointSide(null);
}

function serveZone(p: MatchPoint): "t" | "body" | "wide" | null {
  const serve = resolvedServe(p);
  return serve ? deriveZoneFromX(serve.metrics.lateralM) : null;
}

/** Only measured in-serves have a service-box zone. Faults remain plotted
 * but never inflate zone counts, frequency shares or points-won rates. */
function computeServeZoneStats(
  serves: {
    metrics: ServePlacementMetrics;
    first: boolean;
    result: ServeDot["result"];
  }[],
): Record<ZoneKey, ZoneStats> {
  const eligible = serves.filter(({ metrics }) => metrics.kind === "in");
  const stats = Object.fromEntries(
    ZONES.map(({ key }) => [
      key,
      {
        count: 0,
        pct: 0,
        first: 0,
        second: 0,
        won: 0,
        lost: 0,
        ace: 0,
        doubleFault: 0,
        winPct: 0,
      },
    ]),
  ) as Record<ZoneKey, ZoneStats>;
  for (const { metrics, first, result } of eligible) {
    // In-serves only, so the landing's side IS the side served from.
    const side = metrics.lateralM < 0 ? "deuce" : "ad";
    const zone = stats[`${side}-${deriveZoneFromX(metrics.lateralM)}`];
    zone.count++;
    zone[first ? "first" : "second"]++;
    if (result) zone[result]++;
  }
  for (const zone of Object.values(stats)) {
    zone.pct = eligible.length
      ? Math.round((100 * zone.count) / eligible.length)
      : 0;
    zone.winPct = zone.count
      ? Math.round((100 * (zone.won + zone.ace)) / zone.count)
      : 0;
  }
  return stats;
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
   * means the return hit the net (same convention
   * `ServePlacementMetrics.depthPastNetM` uses). Contact: signed metres
   * behind (+) / inside (−) the returner's own baseline (`projectReturnDot`'s
   * "contact" depth) — unrelated to the net, so this can't go negative for
   * the same reason.
   */
  depthM: number;
  /** The POSITION fact — see `VizDot.atNet`'s doc comment.
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
 * End detection reads each shot's own CONTACT point, never its
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
 * contact point — a shot's own landing is irrelevant to where it
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

/**
 * A net dot's DRAWN lateral, in the same "from behind the hitter" frame
 * `classifyServePlacement`/`rallyLandingMetrics` use: where the shot's own
 * contact → landing line meets the net (`netPathX`), mirrored at the high-y
 * end exactly as those functions mirror the landing. `fallback` (the
 * landing's own lateral) when the line never reaches the net — an imputed
 * landing on the hitter's side, or no contact point.
 *
 * Drawing only: set on the dot after every verdict, filter and zone count
 * has read the landing's own lateral, so no statistic moves.
 */
function netDotLateralM(
  contactX: number | null | undefined,
  contactY: number | null | undefined,
  landingX: number | null | undefined,
  landingY: number | null | undefined,
  fallback: number,
): number {
  const x = netPathX(contactX, contactY, landingX, landingY);
  if (x == null || contactY == null) return fallback;
  return contactY > REAL_NET_Y ? -x : x;
}

export function pointToReturnDots(
  p: MatchPoint,
  subjectIsPlayer1: boolean,
  /** Compute only this variant's dot — the caller that reads a single cut
   *  (`returnPlacement` XOR `returnContact`) never needs the other one's
   *  geometry. Omit to compute both, as every other caller still does. */
  want?: "landing" | "contact",
): ReturnDotMetric[] {
  const typeLower = (p.secondShotType ?? "").toLowerCase();
  const shape: "circle" | "triangle" =
    typeLower.includes("backhand") || typeLower.startsWith("bh")
      ? "triangle"
      : "circle";

  const dots: ReturnDotMetric[] = [];

  // The landing/placement dot needs a landing — the contact dot (below)
  // does not (`contactMetrics` only needs the contact pair), so a
  // missing landing must gate ONLY this dot, not the whole function (the
  // earlier single `if (...) return []` guard at the top dropped the
  // contact dot too whenever a return's landing was missing).
  if (
    want !== "contact" &&
    p.secondShotLandingX != null &&
    p.secondShotLandingY != null
  ) {
    // End detection from the RETURNER's own contact point, same
    // `farEnd` primitive `servePlacementMetrics` uses — falls back to
    // today's landing-based flip (negated: `farEnd` and the old `didFlip`
    // are the same decision read from opposite ends of the shot) only when
    // there's no contact point to read at all, rather than dropping the dot.
    const farEnd =
      p.secondShotContactY != null
        ? p.secondShotContactY > REAL_NET_Y
        : !(p.secondShotLandingY > REAL_NET_Y);
    // `result`: the tracker's own call is the authority over
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
    // Folded into Miss — same shape (forehand-circle /
    // backhand-triangle) an ordinary miss already has, `atNet` carries the
    // position fact separately. Routed on `kind`, not the sign of
    // `depthPastNetM` — a tracker-flagged net ball can carry a positive
    // recorded depth.
    dots.push({
      id: p.id,
      variant: "landing",
      shape,
      lateralM:
        placement.kind === "net"
          ? netDotLateralM(
              p.secondShotContactX,
              p.secondShotContactY,
              p.secondShotLandingX,
              p.secondShotLandingY,
              placement.lateralM,
            )
          : placement.lateralM,
      depthM: placement.depthPastNetM,
      atNet: placement.kind === "net",
    });
  }

  const contact =
    want !== "landing"
      ? contactMetrics(p.secondShotContactX, p.secondShotContactY)
      : null;
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
 * One Pressure option over a point. "pressure" is the score it was played
 * at — the Video tab's Score › Pressure, one predicate (`isPressurePoint`) —
 * and never a break, set or match point at another score; those are `break`
 * and `setMatch`, which read the point's flags.
 */
export function pointMatchesPressure(
  p: Pick<
    MatchPoint,
    | "pointScoreRaw"
    | "gameScore"
    | "isBreakPoint"
    | "isSetPoint"
    | "isMatchPoint"
  >,
  value: PressureValue,
): boolean {
  if (value === "pressure") return isPressurePoint(p);
  if (value === "break") return p.isBreakPoint;
  return p.isSetPoint || p.isMatchPoint;
}

/**
 * Every group below is OR'd within itself (an empty list means "any", a
 * non-empty list matches when the point satisfies AT LEAST ONE selected
 * value) and the groups are AND'd against each other — a point must clear
 * every non-empty group to match. `pressure` and `result` aren't a single
 * derived value compared against the list (unlike `game`/`ball`/`court`/
 * `zone`/`rally`): each selected value is its own predicate over the point,
 * and any one of them being true is enough (`pressure` OR `break` OR
 * `setMatch` — see `pointMatchesPressure`; `won`/
 * `lost` relative to the subject OR the orthogonal `ace` check).
 */
export function pointMatchesFilters(
  p: MatchPoint,
  filters: ShotFilterState,
  frame: "serve" | "return",
  subjectIsPlayer1: boolean,
  /**
   * Whether `ball` in the serve frame reads the serve actually struck
   * (`"serve"`, the serve cut) or the point's flattened first-serve label
   * (`"return"`, every other cut — `computeRallyViz` passes `frame: "serve"`
   * only for `ball`'s meaning). `court` no longer depends on it: every cut
   * reads the court the point was served FROM (`serveSideOf`).
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
      frame === "serve"
        ? courtFrame === "serve"
          ? isFirstServeShotType(
              resolvedServe(p)?.shot?.shotType ?? p.firstShotType,
            )
          : isFirstServePoint(p)
        : isReturnOnFirstServe(p);
    const value: BallValue = isFirst ? "first" : "second";
    if (!filters.ball.includes(value)) return false;
  }

  if (filters.court.length) {
    // The court the point was served FROM, in either frame — a fault that
    // drifted into the other box stays on the side it was struck from.
    if (!filters.court.includes(serveSideOf(p))) return false;
  }

  // Zone is a serve-box concept — the group is hidden in return mode and the
  // state is reset on mode switch, so it never silently narrows returns.
  if (frame === "serve" && filters.zone.length) {
    const zone = serveZone(p);
    if (zone === null || !filters.zone.includes(zone)) return false;
  }

  if (filters.pressure.length) {
    const matches = filters.pressure.some((v) => pointMatchesPressure(p, v));
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
  if (cut === "serve") return [...BASE_KEYS, "zone", "match"];
  if (cut === "errors") return [...BASE_KEYS, "error", "match"];
  if (cut === "approaches") {
    return [...BASE_KEYS, "entry", "approachTo", "approachDir", "match"];
  }
  return [...BASE_KEYS, "match"];
}

/**
 * The advanced (`MatchFilters`) half of `filters` as a point predicate, or
 * `null` when none is applied. `applyMatchFilters` needs the whole match in
 * order (the service court is a running count), so it runs once over
 * `points` and the answer is a set lookup per point.
 *
 * `ctx` is the report's own (`useMatchFilters().context`). Without one it is
 * rebuilt from the subject: "you" is the subject unless the court is the
 * opponent's — hands unknown, so Custom › Direction's inside shots never
 * match, and the match reads as not derived.
 */
function matchFilterPass(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  ctx: MatchFilterContext | undefined,
): MatchPass | null {
  if (!filters.match || !hasActiveMatchFilters(filters.match)) return null;
  const context: MatchFilterContext = ctx ?? {
    youIsPlayer1:
      filters.player === "you" ? subjectIsPlayer1 : !subjectIsPlayer1,
    hands: { player1: null, player2: null },
  };
  const match = filters.match;
  const ids = new Set(
    applyMatchFilters(points, match, context).map((p) => p.id),
  );
  return {
    point: (p) => ids.has(p.id),
    // Net alone (no Custom or Then): a rally cut draws the shot that took
    // the side in — the approach shot — not every shot of the point.
    rallyShot:
      hasNet(match) && !hasCustom(match) && !hasThen(match)
        ? (s, p) => shotMatchesNet(s, p, match, context)
        : null,
    shot: hasCustom(match)
      ? (s) => shotMatchesCustom(s, match, context)
      : hasThen(match)
        ? (s) => shotMatchesThen(s, match, context)
        : null,
  };
}

/** `matchFilterPass`' answer: the points the advanced filters keep, and —
 * when a Custom group is chosen — whether a drawn SHOT is the one it names
 * (`shotMatchesCustom`; with only Then chosen, `shotMatchesThen`. With both,
 * the drawn shot is the Custom one, in a point the sequence already kept). The point cuts need only `point`; the rally and
 * errors cuts plot a shot, so they test that shot too. */
interface MatchPass {
  point: (p: MatchPoint) => boolean;
  /** Rally cuts only: the Net filter's approach shot (`shotMatchesNet`). */
  rallyShot: ((s: MatchShot, p: MatchPoint) => boolean) | null;
  shot: ((s: MatchShot) => boolean) | null;
}

/** The pill groups the advanced filters replaced in the Filters popover. */
export type FoldedKey = "set" | "game" | "pressure" | "result" | "rally";

/**
 * `filters`' pill groups (Ball, Court, Zone, …) restated as the advanced
 * filters they now live in — what the Filters popover's `FiltersPanel`
 * opens on, so a default tile's "1st" or an older saved view's pills read as
 * pressed options there — and the groups that were restated (`folded`), so
 * `withFoldedFilters` empties exactly those when the panel's Show writes the
 * answer back.
 *
 * A group folds only when the advanced filters can say EXACTLY what it
 * said; otherwise it stays a pill group, still applied (and still a
 * removable token in the strip):
 * - its advanced group must be empty. Within a group values OR, while the
 *   pill group was AND'd against it, so merging the two could widen the cut.
 * - Result's Won/Lost never fold. They are the COURT player's, while
 *   Result › Outcome is always yours (`courtFor` never flips it off Errors), so on
 *   the opponent's court a folded "Won" would come back named "Points
 *   lost" and stop following the court. Aces never fold either: the pill
 *   reads the result type "Ace", while Serve › Result's ace on a video match
 *   is any unreturned serve — different points.
 * - Game folds only with both values picked (no constraint, so nothing).
 *   "Serving" is the COURT player's serve; Serve › Player names a player
 *   outright and never follows the court (`courtFor`), so a folded
 *   "Serving" would stop following it.
 * - Result with every value picked is no constraint: it folds to nothing.
 * - Ball never folds. Its "1st" counts a point with no recorded serve type
 *   as a first serve (`isFirstServeShotType`), where Serve › Type needs a
 *   "First Serve" row; and on a return cut it is the return of a first
 *   serve that went IN (`isReturnOnFirstServe`), which Serve › Type cannot
 *   say at all.
 * - Zone and Court never fold. On the serve cut the pills read the serve's
 *   measured landing (its zone, the box it landed in); the advanced Zone
 *   reads the tracker's zone label and Court the score's service court —
 *   different answers on the same serve, and no label at all on a video
 *   match.
 *
 * The pill groups are SUBJECT-relative (Game "Serving", Result "Won" are
 * the court's player); the advanced filters name players outright, as on
 * the Video tab — which is why neither of those groups ever folds.
 */
export function foldedMatchFilters(
  filters: VizFilters,
  /**
   * Whether the panel can draw an option (`cutAvailability`). A group folds
   * only when every value it becomes is offered: one the panel hides would
   * sit in the draft, applied, with no control to remove it.
   */
  isOffered: (key: MatchFilterKey, value: unknown) => boolean = () => true,
): {
  match: MatchFilters;
  folded: FoldedKey[];
} {
  const base = filters.match ?? EMPTY_MATCH_FILTERS;
  const match: { -readonly [K in keyof MatchFilters]: MatchFilters[K] } = {
    ...base,
  };
  const folded: FoldedKey[] = [];

  function list<T>(
    key: FoldedKey,
    matchKey: MatchFilterKey,
    held: readonly T[],
    values: readonly T[],
    write: (values: T[]) => void,
  ) {
    if (values.length === 0 || held.length > 0) return;
    if (!values.every((v) => isOffered(matchKey, v))) return;
    write([...new Set(values)]);
    folded.push(key);
  }

  list("set", "sets", base.sets, filters.set, (v) => (match.sets = v));
  list(
    "pressure",
    "scoreType",
    base.scoreType,
    filters.pressure.flatMap((v) =>
      v === "pressure"
        ? (["pressure"] as const)
        : v === "break"
          ? (["breakpoint"] as const)
          : (["setPoint", "matchPoint"] as const),
    ),
    (v) => (match.scoreType = v),
  );
  list(
    "rally",
    "resultRallyLength",
    base.resultRallyLength,
    filters.rally,
    (v) => (match.resultRallyLength = v),
  );

  if (filters.game.length === 2) folded.push("game");

  const won = filters.result.includes("won");
  const lost = filters.result.includes("lost");
  // Won + Lost is every point — aces included — so no constraint at all.
  if (won && lost) folded.push("result");

  return { match, folded };
}

/** `filters` with the advanced filters set to `match` and the `folded` pill
 * groups emptied — the panel's Show. */
export function withFoldedFilters(
  filters: VizFilters,
  match: MatchFilters,
  folded: readonly FoldedKey[],
): VizFilters {
  const next: VizFilters = { ...filters, match };
  for (const key of folded) next[key] = [];
  return next;
}

/**
 * The kind of error a point ended on, off its free-text result type — the
 * same substrings `calculate_match_stats` buckets (`LIKE '%Unforced
 * Error%'`). `null` for a point that is not one of the three (a winner, or
 * an error the source did not classify).
 *
 * `errorSplitJudged` (`MatchFilterContext.errorSplitJudged`; defaults to
 * judged so a caller with no match in hand keeps the stored reading): until a
 * match's errors are judged nobody has called any of them forced or
 * unforced, so every error that is not a double fault — "… Unforced Error",
 * "… Forced Error" or a bare "… Error" — reads as the one Errors bucket,
 * returned as `"unforced"` (the value the collapsed "Errors" option stores
 * first, `collapseErrorFilter`). A service winner joins it there: the errors
 * cut only asks about one whose return was missed (`errorMadeBy`), and "every
 * error" has to mean every dot the cut can draw. A judged match reads as stored,
 * so there it has no kind.
 */
export function errorKindOf(
  p: Pick<MatchPoint, "resultType">,
  errorSplitJudged = true,
): ErrorValue | null {
  const rt = (p.resultType ?? "").toLowerCase();
  if (rt.includes("double fault")) return "doubleFault";
  if (!errorSplitJudged) {
    return rt.includes("error") || rt === "service winner" ? "unforced" : null;
  }
  if (rt.includes("unforced error")) return "unforced";
  if (rt.includes("forced error")) return "forced";
  return null;
}

/** The two error kinds an unjudged match folds into one "Errors" option. */
export const COLLAPSED_ERROR_VALUES = [
  "unforced",
  "forced",
] as const satisfies readonly ErrorValue[];

/**
 * The Error type selection as an unjudged match reads it: picking either
 * kind picks the whole Errors bucket, so `["forced"]` (a link or saved view
 * from a judged reading) means every error rather than an empty chart. On a
 * judged match — or when neither kind is picked — `error` comes back as is
 * (same reference). Canonical (`unforced`, `forced`, `doubleFault`) order.
 */
export function collapseErrorFilter(
  error: ErrorFilter,
  errorSplitJudged: boolean,
): ErrorFilter {
  if (errorSplitJudged) return error;
  const hasKind = error.some((v) => v === "unforced" || v === "forced");
  if (!hasKind) return error;
  if (error.includes("unforced") && error.includes("forced")) return error;
  return error.includes("doubleFault")
    ? [...COLLAPSED_ERROR_VALUES, "doubleFault"]
    : [...COLLAPSED_ERROR_VALUES];
}

/**
 * Whether the errors cut reads `ctx`'s match as judged. No context at all (a
 * caller with no match in hand, e.g. a unit fixture) keeps the stored
 * reading; a context reads its own flag, absent = not judged (T2's rule).
 */
export function errorsJudgedIn(ctx: MatchFilterContext | undefined): boolean {
  return ctx === undefined ? true : ctx.errorSplitJudged === true;
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

/** Landing frame viewed from behind the hitter. Require a measured contact
 * end: inferring it from a landing would put netted shots on the wrong half.
 * Rally depth uses the full singles court, never the shorter service box. */
function rallyLandingMetrics(shot: MatchShot) {
  const { contactY, landingX, landingY } = shot;
  if (
    contactY == null ||
    landingX == null ||
    landingY == null ||
    ![contactY, landingX, landingY].every(Number.isFinite)
  )
    return null;
  const farEnd = contactY > REAL_NET_Y;
  const lateralM = farEnd ? -landingX : landingX;
  const depthM = farEnd ? REAL_NET_Y - landingY : landingY - REAL_NET_Y;
  const atNet = shot.result === "Net" || depthM < 0;
  const miss =
    atNet ||
    shot.result === "Out" ||
    Math.abs(lateralM) > SINGLES_HALF_M + IN_COURT_EPS ||
    depthM > REAL_NET_Y + IN_COURT_EPS;
  // After `miss` has read the landing's own lateral: a net ball is drawn on
  // its path at the net (`netDotLateralM`), which is position only.
  return {
    lateralM: atNet
      ? netDotLateralM(shot.contactX, contactY, landingX, landingY, lateralM)
      : lateralM,
    depthM,
    atNet,
    miss,
  };
}

/**
 * Rally cuts: every shot AFTER the return the SUBJECT struck,
 * across every point — not gated on who served, unlike the serve/return arms
 * above, since a rally shot can come from either the server or the returner.
 * Rally shots are picked by ROLE (`pickRallyShots`), not by
 * `shotNumber >= 3`: shot_number is unreliable (a faulted first serve and
 * the second serve actually played can share shot_number=1, colliding the
 * return with it too), the same reason `serve-return-shots.ts` exists.
 * `count`/`total`/`noun` are shot-counted rather
 * than point-counted (a single point can contribute several dots): `total`
 * is every qualifying rally shot regardless of filters (the drawable pool,
 * same "before filtering" meaning `total` carries for every other cut, just
 * measured in shots here), `count` the ones whose POINT also passes
 * `filters`. Position uses point won/lost; placement additionally marks
 * out/net landings as misses. Both retain the actual point result in meta.
 */
function computeRallyViz(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  placement: boolean,
  matchPass: MatchPass | null,
): VizResult {
  let total = 0;
  let count = 0;
  const dots: VizDot[] = [];

  for (const p of points) {
    // "ball" reads as the serve-frame meaning here (first/second serve
    // point) — the rally itself has no "first/second" concept of its own,
    // it's whichever serve started the point that's being asked about, read
    // from the point's labels (courtFrame: "return"), not a struck serve.
    const passes =
      pointMatchesFilters(p, filters, "serve", subjectIsPlayer1, "return") &&
      (matchPass === null || matchPass.point(p));
    const subjectWon = p.wonByPlayer1 === subjectIsPlayer1;

    const rallyShots = pickRallyShots(
      p.shots ?? [],
      (s) => s.shotType,
      (s) => s.shotNumber,
    );
    for (const shot of rallyShots) {
      if (shot.isPlayer1 !== subjectIsPlayer1) continue;

      const landing = placement ? rallyLandingMetrics(shot) : null;
      const metrics = placement
        ? landing
        : contactMetrics(shot.contactX, shot.contactY);
      if (!metrics) continue;

      total++;
      if (!passes) continue;
      if (matchPass?.shot && !matchPass.shot(shot)) continue;
      if (matchPass?.rallyShot && !matchPass.rallyShot(shot, p)) continue;
      count++;

      dots.push({
        id: shot.id,
        lateralM: metrics.lateralM,
        depthM: metrics.depthM,
        outcome: landing?.miss ? "miss" : subjectWon ? "won" : "lost",
        shape: shapeFromShotType(shot.shotType),
        atNet: landing?.atNet ?? false,
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
 * Errors cut: one dot per point the SUBJECT lost on their own error
 * (`errorMadeBy`, the attribution the Result filters and the Point endings
 * card use — a double fault is the server's, a service winner's missed return
 * the returner's), drawn where the erring shot
 * landed, from behind its hitter, on the same full-court landing frame as
 * rally placement. The erring shot is the point's deciding row
 * (`lastShotOf`): its last, or a double fault's last serve. A point
 * whose deciding shot has no measured landing is not drawable and stays out
 * of `total`, as with every other cut.
 *
 * Every dot is a lost point, so outcome reads `"lost"`; a ball that never
 * crossed sets `atNet` and is drawn at the net, as elsewhere. `error`
 * narrows by kind (`errorKindOf`); `ball` reads the serve that started the
 * point, `court` stays score-based, like the rally cuts.
 */
function computeErrorsViz(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  matchPass: MatchPass | null,
  /** `errorsJudgedIn(matchCtx)`: unjudged, Error type reads one Errors
   *  bucket (`errorKindOf`, `collapseErrorFilter`). */
  errorSplitJudged: boolean,
): VizResult {
  let total = 0;
  let count = 0;
  const dots: VizDot[] = [];
  const wantedErrors = collapseErrorFilter(filters.error, errorSplitJudged);

  for (const p of points) {
    // Their error AND their lost point: a last row credited to the point's
    // winner (a missing final row, an untyped Out the winner hit) is not an
    // error that cost them anything, and would draw as one.
    if (errorMadeBy(p) !== subjectIsPlayer1) continue;
    if (p.wonByPlayer1 === subjectIsPlayer1) continue;
    const shot = lastShotOf(p);
    if (!shot || shot.isPlayer1 !== subjectIsPlayer1) continue;
    const landing = rallyLandingMetrics(shot);
    if (!landing) continue;

    total++;
    if (!pointMatchesFilters(p, filters, "serve", subjectIsPlayer1, "return")) {
      continue;
    }
    if (matchPass !== null) {
      if (!matchPass.point(p)) continue;
      if (matchPass.shot && !matchPass.shot(shot)) continue;
    }
    if (wantedErrors.length) {
      // Strictly by the recorded result type — the rule the Point endings
      // card's unforced-error count uses. (The tile can still read fewer:
      // it draws only errors with a measured landing.) An error the source
      // left unclassified is drawn on the unfiltered cut, under no kind.
      const kind = errorKindOf(p, errorSplitJudged);
      if (kind === null || !wantedErrors.includes(kind)) continue;
    }
    count++;

    dots.push({
      id: p.id,
      lateralM: landing.lateralM,
      depthM: landing.depthM,
      outcome: "lost",
      shape: shapeFromShotType(shot.shotType),
      atNet: landing.atNet,
      meta: {
        ...pointDotMeta(p, subjectIsPlayer1, shot),
        stroke: finalShotOf(p)?.kind ?? "Other",
      },
    });
  }

  return { dots, count, total, noun: "errors", zoneStats: null };
}

/**
 * Approaches cut: one entry per point the SUBJECT came to the net on
 * (`approachOf`, so this cut and the Net game card count the same points the
 * same way). Unlike the other cuts, a point with no drawable placement still
 * counts in `count` and `total` (the statistics are about the approach, not
 * its landing); it only draws no dot.
 *
 * A dot is the approach shot's placement in the opponent's court, from behind
 * the hitter (`approachLateralM`, `rallyLandingMetrics`' depth), with the
 * contact as its `pair` when measured. `entry`, `approachTo` and
 * `approachDir` narrow; an approach with no wing or direction matches neither
 * filter once it is set. The wing is the hand of the seat the subject is
 * approaching against, so on the opponent's court it is the player's.
 */
function computeApproachViz(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  matchPass: MatchPass | null,
  matchCtx: MatchFilterContext | undefined,
): VizResult {
  const { total, pool } = approachPool(
    points,
    filters,
    subjectIsPlayer1,
    matchPass,
    matchCtx,
  );
  const opponentHand = approachOpponentHand(subjectIsPlayer1, matchCtx);
  let count = 0;
  const dots: VizDot[] = [];
  const undrawn: VizMark[] = [];

  for (const { point: p, approach } of pool) {
    if (!approachToPasses(approach, filters)) continue;
    if (!approachDirPasses(approach, filters)) continue;
    count++;
    const { shot } = approach;
    const mark: VizMark = {
      id: p.id,
      outcome: p.wonByPlayer1 === subjectIsPlayer1 ? "won" : "lost",
      shape: shapeFromShotType(shot.shotType),
      meta: {
        ...pointDotMeta(p, subjectIsPlayer1, shot),
        entry: approach.entry,
        wing: approach.wing,
        direction: approach.direction,
        ending: approach.ending,
        bucket: approach.bucket,
        handAssumed: approach.handAssumed,
        opponentHand,
      },
    };

    // The placement, by the classifier's own rule: null when unmeasured or
    // the ball never crossed, exactly where `approach.lane` is null. Without
    // one the approach is listed, not drawn.
    const lateralM = approachLateralM(shot);
    const landing = lateralM === null ? null : rallyLandingMetrics(shot);
    if (lateralM === null || !landing) {
      undrawn.push(mark);
      continue;
    }
    const contact = contactMetrics(shot.contactX, shot.contactY);

    dots.push({
      ...mark,
      lateralM,
      depthM: landing.depthM,
      atNet: false,
      ...(contact ? { pair: contact } : {}),
    });
  }

  return { dots, undrawn, count, total, noun: "approaches", zoneStats: null };
}

/** The hand of the seat the subject approaches against; null when unknown. */
function approachOpponentHand(
  subjectIsPlayer1: boolean,
  matchCtx: MatchFilterContext | undefined,
): Hand | null {
  return matchCtx ? handOf(!subjectIsPlayer1, matchCtx) : null;
}

interface PooledApproach {
  point: MatchPoint;
  approach: Approach;
}

/**
 * The Approaches cut's pool before its two placement filters: every one of
 * the SUBJECT's net points (`total`), those `entry` keeps (`entryTotal`, the
 * cut's own baseline: what the Statistics rail's count reads "of"), and
 * those the base pills and the advanced filters keep as well (`pool`). `approachTo` and `approachDir`
 * are left to the caller, so the Statistics rail can lift one at a time
 * (`approachStats`). One pass for the court and the rail, so the two can
 * never count different points.
 */
function approachPool(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  matchPass: MatchPass | null,
  matchCtx: MatchFilterContext | undefined,
): { total: number; entryTotal: number; pool: PooledApproach[] } {
  let total = 0;
  let entryTotal = 0;
  const pool: PooledApproach[] = [];
  const opponentHand = approachOpponentHand(subjectIsPlayer1, matchCtx);

  for (const p of points) {
    const approach = approachOf(
      p,
      subjectIsPlayer1,
      matchCtx?.lobKeys,
      opponentHand,
    );
    if (!approach) continue;

    total++;
    if (filters.entry.length && !filters.entry.includes(approach.entry)) {
      continue;
    }
    entryTotal++;
    if (!pointMatchesFilters(p, filters, "serve", subjectIsPlayer1, "return")) {
      continue;
    }
    if (matchPass !== null) {
      if (!matchPass.point(p)) continue;
      if (matchPass.shot && !matchPass.shot(approach.shot)) continue;
    }
    pool.push({ point: p, approach });
  }
  return { total, entryTotal, pool };
}

/** `approachTo`: an approach with no wing matches no choice once it is set. */
function approachToPasses(approach: Approach, filters: VizFilters): boolean {
  return (
    !filters.approachTo.length ||
    (approach.wing !== null && filters.approachTo.includes(approach.wing))
  );
}

/** `approachDir`: a serve (no direction) matches no choice once it is set. */
function approachDirPasses(approach: Approach, filters: VizFilters): boolean {
  return (
    !filters.approachDir.length ||
    (approach.direction !== null &&
      filters.approachDir.includes(approach.direction))
  );
}

/**
 * `VizDotMeta` common to every dot drawn for point `p`, plus the one shot
 * (`shotType`/`result`) the specific dot came from — `serve`
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
      }
    | null
    | undefined,
  /** Passed in by the serve branch from the same expression that picks the
   *  star shape; every other cut leaves it at its default. */
  isAce = false,
): VizDotMeta {
  return {
    pointId: p.id,
    isAce,
    setNumber: p.setNumber,
    // The raw column: a frozen reading is null, not the loader's "0-0".
    pointScore: readPointScore(p),
    wonBySubject: p.wonByPlayer1 === subjectIsPlayer1,
    shotType: shot?.shotType ?? null,
    result: shot?.result ?? null,
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
  return countedShots(p.shots ?? [], (s) => s.shotNumber).find(
    (s) => !isServeShotType(s.shotType) && !isFeedShotType(s.shotType),
  );
}

export function computeViz(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  chart: Chart = "scatter",
  /** The report's filter context, for `filters.match` — see `matchFilterPass`. */
  matchCtx?: MatchFilterContext,
): VizResult {
  const matchPass = matchFilterPass(
    points,
    filters,
    subjectIsPlayer1,
    matchCtx,
  );
  if (cut === "rallyPosition" || cut === "rallyPlacement") {
    return computeRallyViz(
      points,
      filters,
      subjectIsPlayer1,
      cut === "rallyPlacement",
      matchPass,
    );
  }
  if (cut === "errors") {
    return computeErrorsViz(
      points,
      filters,
      subjectIsPlayer1,
      matchPass,
      errorsJudgedIn(matchCtx),
    );
  }
  if (cut === "approaches") {
    return computeApproachViz(
      points,
      filters,
      subjectIsPlayer1,
      matchPass,
      matchCtx,
    );
  }

  const frame = cutFrame(cut);
  const everyFirst = firstServesStruck(cut, filters.ball);
  let total = 0;
  let count = 0;
  let serveOutOrNetCount = 0;
  const dots: VizDot[] = [];
  const serves: Parameters<typeof computeServeZoneStats>[0] = [];

  for (const p of points) {
    if (frame === "serve") {
      if (p.serverIsPlayer1 !== subjectIsPlayer1) continue;

      const serve = everyFirst ? firstServeStruck(p) : resolvedServe(p);
      if (!serve) continue;
      const { shot: serveShot, metrics } = serve;

      total++;
      if (everyFirst) {
        // Every first serve qualifies on Ball, and Court and Zone read THIS
        // serve, not the one played after it — so they are checked here
        // and the rest of the filters run without them.
        if (
          filters.court.length &&
          !filters.court.includes(serveSideOf(p, serve))
        )
          continue;
        if (filters.zone.length) {
          if (metrics.kind !== "in") continue;
          if (!filters.zone.includes(deriveZoneFromX(metrics.lateralM)))
            continue;
        }
        if (
          !pointMatchesFilters(
            p,
            { ...filters, ball: [], court: [], zone: [] },
            "serve",
            subjectIsPlayer1,
          )
        )
          continue;
      } else if (!pointMatchesFilters(p, filters, "serve", subjectIsPlayer1))
        continue;
      if (matchPass !== null && !matchPass.point(p)) continue;
      count++;
      if (metrics.kind === "out" || metrics.kind === "net") {
        serveOutOrNetCount++;
      }

      const serveInput = toServeInput(p);
      serves.push({
        metrics,
        first: isFirstServeShotType(serveShot?.shotType ?? p.firstShotType),
        result: classifyPointResult(serveInput),
      });

      // ONE expression for "this serve is an ace", read by both
      // the dot's star shape and its `meta.isAce`, so the glyph and the
      // readout's first line can never disagree.
      // On the 1st court a faulted first serve is never the ace, even when
      // the second serve that followed it was.
      const isAce =
        p.resultType === "Ace" && (!everyFirst || metrics.kind === "in");

      // Mirrors the return branch's flattened-field fallback —
      // `serveShot` can be `undefined` (a point whose `shots` row wasn't
      // resolvable at all; the dot still draws off `p.firstShotLandingX/Y`/
      // `p.firstShotResult` above via `classifyServePlacement`'s fallback
      // path), and without this fallback its `meta` silently went blank
      // even though the point's own flattened fields had the answer.
      const serveMetaShot = {
        shotType: serveShot?.shotType ?? p.firstShotType ?? null,
        result: serveShot?.result ?? p.firstShotResult ?? null,
      };

      dots.push({
        id: p.id,
        // A net serve is drawn on its own path at the net; zone stats and
        // the side filters above read `metrics.lateralM`, untouched.
        lateralM:
          metrics.kind === "net" && serveShot
            ? netDotLateralM(
                serveShot.contactX,
                serveShot.contactY,
                serveShot.landingX,
                serveShot.landingY,
                metrics.lateralM,
              )
            : metrics.lateralM,
        depthM: metrics.depthPastNetM,
        // "in" reads the point's own result (won/lost/ace/doubleFault, same
        // classification `serve-zones.ts` uses); "out"/"net" always miss.
        outcome:
          metrics.kind === "in"
            ? serveOutcome(classifyPointResult(serveInput))
            : "miss",
        // An ace draws as a star (an ace is always "in" — already
        // gated to the subject's own serves above). A net
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
      const mine = pointToReturnDots(p, subjectIsPlayer1, want);
      if (mine.length === 0) continue;
      total++;
      if (!pointMatchesFilters(p, filters, "return", subjectIsPlayer1))
        continue;
      if (matchPass !== null && !matchPass.point(p)) continue;
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
    zoneStats: cut === "serve" ? computeServeZoneStats(serves) : null,
    serveOutOrNetCount: cut === "serve" ? serveOutOrNetCount : undefined,
  };
}

/**
 * The tile-footer count label — `"{count} of {total}"` for
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

/* ── Stats card ────────────────────────────────────────────────────────────
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
  /**
   * The errors cut's rows: every dot is a lost point, so `winPct` there is
   * the row's SHARE of the errors shown instead — and the row says so.
   */
  share?: boolean;
}

/**
 * The single accessible sentence for one stat row — "Crosscourt: 100% of 4
 * points won" / "Ad T: no points", and on a rally cut, whose rows count
 * shots (`marksAreShots`), "Deep: 72% of 50 shots won" / "Short: no shots" —
 * the noun the row's own tooltip uses. The only place this string is built:
 * `stats-card.tsx` renders it verbatim into a visually-hidden node and
 * hides its own visible label/number markup from assistive tech, so a
 * screen reader announces this sentence exactly once per row, never the
 * label alone and never twice. A test in `tests/viz-model.spec.ts` builds
 * rows through `computeVizStats` (not by hand) so a card row can never ship
 * with an empty label again the way the live app briefly did.
 */
export function statRowAnnouncement(row: StatRow, cut: Cut): string {
  if (row.share) {
    const of = cut === "approaches" ? "approaches" : "errors";
    if (row.count === 0) return `${row.label}: no ${of}`;
    return `${row.label}: ${row.winPct}% of ${of}, ${row.count}`;
  }
  const noun = marksAreShots(cut) ? "shots" : "points";
  if (row.winPct === null) return `${row.label}: no ${noun}`;
  return `${row.label}: ${row.winPct}% of ${row.count} ${noun} won`;
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
  /**
   * How many of the pool landed in, for the cuts that land (serve, return
   * and rally placement): the same two numbers the subtitle states, kept as
   * numbers for the Statistics column's "Landed in" figure. Absent for the
   * contact cuts and errors, which have no landing to count.
   */
  landed?: { count: number; of: number };
  /**
   * The Approaches cut's two KPI tiles (`approachStats`): how many approaches
   * are shown, labelled "of N …" only when a filter narrows the cut's own
   * pool, and how many of them were won. Absent on every other cut, whose
   * figures read off the groups.
   */
  kpi?: StatKpi;
}

export interface StatKpi {
  /** The approaches shown: `computeViz(...).count`. */
  count: number;
  /** The count tile's label: "approaches", or "of 9 approaches" when narrowed. */
  countLabel: string;
  won: number;
  /** `won` of `count`, rounded; `null` when `count === 0`. */
  winPct: number | null;
}

/**
 * Whether the stats card should show its empty state. `stats.total` is
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
// court; taken from `approach.ts` rather than that file, which is a
// client-adjacent geometry/SVG module while this one stays plain.
const IN_COURT_EPS = 1e-6;

/** A saved view's filter group, named when the reader loosens it to "any". */
export const LOOSENED_LABEL: Partial<Record<keyof VizFilters, string>> = {
  ball: "Serve",
  court: "Court",
  set: "Set",
  zone: "Zone",
  result: "Result",
  pressure: "Score",
  rally: "Rally",
  game: "Game",
  error: "Error type",
  entry: "Way to the net",
  approachTo: "Approach to",
  approachDir: "Direction",
  match: "Advanced filters",
};

/**
 * The applied sentence's last word on the Approaches cut: "Their backhand"
 * and "Their forehand" are worked out from the opponent's hand, and where
 * the match does not record it the court reads them as right-handed.
 */
export const HAND_ASSUMED_NOTE = "assumes right-handed";

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
 * sort last; ties by count desc, then label.
 *
 * Not for a "Depth" group. Its rows are positions on the court — Deep, Mid,
 * Short; Inside the baseline, then further behind it — and they stay in that
 * order, the order the bands are drawn in, whatever each one's win rate. A
 * list that reshuffled with the numbers made the reader find "Deep" again
 * on every filter change, and put the rows out of step with the court
 * beside them. */
/** Groups whose rows keep the order they were built in, whatever the rates. */
const APPROACH_GROUP_KEYS = [
  "approach-to",
  "approach-direction",
  "approach-ended",
] as const;
const FIXED_ORDER_GROUPS: ReadonlySet<string> = new Set([
  "depth",
  ...APPROACH_GROUP_KEYS,
]);

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
 * The order `computeVizStats` gives a group's rows, for a caller that has
 * summed rows from several matches and must put them back in it (the player
 * profile's season fold, `lib/data/player-season-viz.ts`): a "Depth" group
 * and the Approaches cut's three groups as they came (court and fixed order
 * — see `sortRows` and `approachStats`), share rows (the errors cut's,
 * `errorStats`) by count, every other group by win rate (`sortRows`).
 * `tests/player-season-viz.spec.ts` pins that one match merged with itself
 * comes back in `computeVizStats`' own order.
 */
export function orderStatRows(rows: StatRow[], groupKey: string): StatRow[] {
  if (FIXED_ORDER_GROUPS.has(groupKey)) return rows;
  if (rows.some((row) => row.share)) {
    return [...rows].sort((a, b) => b.count - a.count || rowTieBreak(a, b));
  }
  return sortRows(rows);
}

/** The Approaches cut's groups in the order `approachStats` builds them. */
const APPROACH_GROUP_RANK: ReadonlyMap<string, number> = new Map(
  APPROACH_GROUP_KEYS.map((key, i) => [key, i]),
);

/**
 * Groups put back in `computeVizStats`' own order, for a caller that unites
 * several matches' groups in first-seen order (`mergeVizStats`): a match
 * with no wing has no "Approach to", so a season whose first match lacks one
 * would otherwise list "How it ended" above it. Only the Approaches groups
 * have a fixed order; every other group keeps its place.
 */
export function orderStatGroups<G extends { key: string }>(groups: G[]): G[] {
  const ranked = groups
    .filter((g) => APPROACH_GROUP_RANK.has(g.key))
    .sort(
      (a, b) =>
        APPROACH_GROUP_RANK.get(a.key)! - APPROACH_GROUP_RANK.get(b.key)!,
    );
  let next = 0;
  return groups.map((g) =>
    APPROACH_GROUP_RANK.has(g.key) ? ranked[next++] : g,
  );
}

/**
 * The claim→evidence sentence. Only rows with `count >= 3` ("qualifying")
 * take part — as the headline AND as the comparison set — so the clause
 * never gets its ceiling from a small-sample row a reader has no reason to
 * trust (a 2-serve 100% zone was inflating the "every
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
    Math.abs(d.lateralM) <= SINGLES_HALF_M + IN_COURT_EPS &&
    d.depthM >= -IN_COURT_EPS &&
    d.depthM <= REAL_NET_Y + IN_COURT_EPS
  );
}

/**
 * Direction (Crosscourt / Middle / Down the line): a return's landing sits
 * in one of three lateral thirds of the landing half's singles width. Which
 * outer third counts as "crosscourt" depends on which side the SERVE was
 * hit from (`serveSideOf`, the Court filter's own answer: "deuce" ⇒ an in
 * serve lands with a negative world-x, "ad" ⇒ positive).
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
  // Hoisted once per call rather than resolved fresh per
  // dot inside the loop below.
  const depthBucket = makeDepthBucketer(bands);

  for (const d of eligible) {
    const wonInc = d.outcome === "won" ? 1 : 0;
    const point = pointById.get(d.id);
    // Same served-from answer as the Court filter, so a return kept under
    // Ad is never split as if Deuce.
    const serveSide = servedFromSide(point);
    const dKey = directionKey(d.lateralM, serveSide);
    direction[dKey].count++;
    direction[dKey].won += wonInc;
    if (depthRows.length > 0) {
      const pKey = depthRows[depthBucket(d.depthM)].key;
      depth[pKey].count++;
      depth[pKey].won += wonInc;
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
      rows: depthRows.map((row) =>
        makeRow(row.key, row.label, depth[row.key].count, depth[row.key].won),
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
  // Hoisted once per call rather than resolved fresh per
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
    rows: contactRows.map((row) =>
      makeRow(row.key, row.label, depth[row.key].count, depth[row.key].won),
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
 * `precomputed`: pass a `VizResult` a caller already computed for the
 * SAME `points`/`cut`/`filters`/`subjectIsPlayer1` to skip a second,
 * identical `computeViz` pass — `viz-focused.tsx` needs both the court's
 * own result and these stats for one render. Omit it and this still runs
 * `computeViz` itself; behaviour is identical either way, since a caller
 * that passes it is only avoiding a redundant recompute of the exact same
 * inputs.
 *
 * `bands`/`unit`: the workspace's depth/contact band settings
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
  /** For the fallback `computeViz` only — see that function's `matchCtx`. */
  matchCtx?: MatchFilterContext,
): VizStats {
  const result =
    precomputed ??
    computeViz(points, cut, filters, subjectIsPlayer1, "scatter", matchCtx);
  const total = result.count;

  if (cut === "serve") {
    // The Ball pills only: Serve › Type selects different points (no
    // recorded serve type is not a first serve there), so it never names
    // the serves as "first".
    const noun = serveNoun(filters.ball, total);
    const groups = [serveStatsGroup(result.zoneStats)];
    // Zone percentages use measured in-serves; total includes every drawable
    // serve. State the excluded out/net count alongside the full pool.
    const outOrNet = result.serveOutOrNetCount ?? 0;
    const subtitle =
      outOrNet === 0
        ? `Points won by zone · ${total} ${noun}`
        : `Points won by zone · ${total - outOrNet} of ${total} ${noun} landed in · ${outOrNet} out or into the net`;
    return {
      title: "Where the serve went",
      subtitle,
      groups,
      sentence: buildSentence(groups, noun),
      total,
      landed: { count: total - outOrNet, of: total },
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
      landed: { count: subtitleCount, of: total },
    };
  }

  if (cut === "rallyPlacement") {
    const eligible = result.dots.filter(isPlacementRow);
    const rows = depthBandRows(bands, unit);
    const acc = bandRowAccumulator(rows);
    const bucket = makeDepthBucketer(bands);
    for (const dot of eligible) {
      if (!rows.length) break;
      const key = rows[bucket(dot.depthM)].key;
      acc[key].count++;
      if (dot.outcome === "won") acc[key].won++;
    }
    const groups = rows.length
      ? [
          {
            key: "depth",
            label: "Depth",
            rows: rows.map((r) =>
              makeRow(r.key, r.label, acc[r.key].count, acc[r.key].won),
            ),
          },
        ]
      : [];
    return {
      title: "Where rally shots landed",
      subtitle: `Points won by placement · ${eligible.length} of ${total} shots landed in`,
      groups,
      sentence: buildSentence(groups, "shots"),
      total,
      landed: { count: eligible.length, of: total },
    };
  }

  if (cut === "approaches") {
    return approachStats(points, filters, subjectIsPlayer1, matchCtx);
  }

  if (cut === "errors") {
    const groups = errorStats(result);
    const noun = total === 1 ? "error" : "errors";
    const top = groups[0].rows.find((row) => row.count > 0);
    return {
      title: "How the errors missed",
      subtitle: `Share of errors · ${total} ${noun}`,
      groups,
      sentence:
        top && total >= 3
          ? `${top.label}: ${top.winPct}% of ${total} errors.`
          : null,
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

  // The contact-cut subtitle noun follows the ball filter exactly as
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

/**
 * How one error missed — the errors cut's Miss rows, one rule for the rows
 * (`errorStats`) and the lightbox's row filter (`statRowKeyOf`).
 */
function errorMissKey(dot: VizDot): "net" | "long" | "wide" | "in" {
  if (dot.atNet) return "net";
  if (isServeShotType(dot.meta?.shotType ?? null)) {
    // A double fault's serve missed the SERVICE BOX, not the court: past
    // the service line is long, anything else out (a sideline, the wrong
    // box) is wide. Never "landed in" — a fault is out by definition, and
    // SwingVision imputes many fault landings onto the line itself.
    return dot.depthM > SERVE_BOX_DEPTH_M + IN_COURT_EPS ? "long" : "wide";
  }
  if (dot.depthM > REAL_NET_Y + IN_COURT_EPS) return "long";
  if (Math.abs(dot.lateralM) > SINGLES_HALF_M + IN_COURT_EPS) return "wide";
  if (dot.meta?.result === "Out") {
    // The tracker's call is the authority (as `rallyLandingMetrics`'s): an
    // Out whose landing reads just inside — imputed onto a line — is out
    // over whichever line it sits nearer.
    const toBaseline = REAL_NET_Y - dot.depthM;
    const toSideline = SINGLES_HALF_M - Math.abs(dot.lateralM);
    return toBaseline <= toSideline ? "long" : "wide";
  }
  return "in";
}

/**
 * Which row of `groupKey` one drawn mark counts toward, by the SAME rules
 * `computeVizStats` buckets with — the lightbox's Statistics row filter
 * keeps exactly the marks a row counted (pinned per row in
 * `tests/stat-row-filter.spec.ts`). `null` when the mark is in none of the
 * group's rows (an out/net return under Direction, say). Serve rows are not
 * here: they are the Zone and Court filters' own points.
 *
 * `point` is the mark's source point (`meta.pointId`), needed only for a
 * return's Direction (the side it was served to).
 */
export function statRowKeyOf(
  cut: Cut,
  groupKey: string,
  dot: VizDot,
  point: MatchPoint | undefined,
  bands: BandSettings,
): string | null {
  if (cut === "errors") {
    if (groupKey === "miss") return errorMissKey(dot);
    if (groupKey === "stroke")
      return (dot.meta?.stroke ?? "Other").toLowerCase();
    return null;
  }
  if (cut === "approaches") return approachRowKeyOf(groupKey, dot);
  if (cut === "returnPlacement" || cut === "rallyPlacement") {
    if (!isPlacementRow(dot)) return null;
    if (groupKey === "direction" && cut === "returnPlacement")
      return directionKey(dot.lateralM, servedFromSide(point));
    if (groupKey === "depth") {
      const rows = depthBandRows(bands, "ft");
      if (rows.length === 0) return null;
      return rows[makeDepthBucketer(bands)(dot.depthM)].key;
    }
    return null;
  }
  if (cut === "returnContact" || cut === "rallyPosition") {
    if (groupKey === "depth") {
      const rows = contactBandRows(bands, "ft");
      return rows[makeContactBucketer(bands)(dot.depthM)].key;
    }
    if (groupKey === "stroke")
      return dot.shape === "triangle" ? "backhand" : "forehand";
    return null;
  }
  return null;
}

/**
 * `statRowKeyOf` for the Approaches cut, which reads only a mark's `meta`, so
 * an approach with no landing (`VizResult.undrawn`) is bucketed by the same
 * rule: no wing or direction means no Approach to or Direction row; How it
 * ended still has one.
 */
export function approachRowKeyOf(
  groupKey: string,
  mark: VizMark,
): string | null {
  const meta = mark.meta;
  if (groupKey === "approach-to") return meta?.wing ?? null;
  if (groupKey === "approach-direction") {
    return meta?.direction ? APPROACH_DIRECTION_KEY[meta.direction] : null;
  }
  if (groupKey === "approach-ended") return meta?.bucket ?? null;
  return null;
}

const APPROACH_WING_ROWS: { key: ApproachWing; label: string }[] = [
  { key: "backhand", label: "Their backhand" },
  { key: "middle", label: "Middle" },
  { key: "forehand", label: "Their forehand" },
];

const APPROACH_DIRECTION_KEY: Record<ApproachDirection, string> = {
  Crosscourt: "crosscourt",
  Middle: "middle",
  "Down the Line": "dtl",
};

const APPROACH_DIRECTION_ROWS: { key: ApproachDirection; label: string }[] = [
  { key: "Crosscourt", label: "Crosscourt" },
  { key: "Middle", label: "Middle" },
  { key: "Down the Line", label: "Down the line" },
];

/** "How it ended", in the rail's order; the lob split only when lobs are known. */
const APPROACH_ENDED_ROWS = {
  lobsKnown: [
    "passed-dtl",
    "passed-crosscourt",
    "lobbed",
    "won-at-net",
    "own-error",
  ],
  lobsUnknown: [
    "passed-or-lobbed-dtl",
    "passed-or-lobbed-crosscourt",
    "won-at-net",
    "own-error",
  ],
} as const satisfies Record<string, readonly ApproachEndingBucket[]>;

/**
 * What the Approaches cut counts, named for the `entry` choice it is
 * narrowed to (the design's rail): "approaches" for approach shots alone,
 * "serve-and-volley points", "times drawn in", and "times at the net" for
 * any mix, or none chosen (all three).
 */
export function approachNoun(entry: EntryFilter, n: number): string {
  const one = n === 1;
  const only = entry.length === 1 ? entry[0] : null;
  if (only === "approach") return one ? "approach" : "approaches";
  if (only === "serve-volley") {
    return one ? "serve-and-volley point" : "serve-and-volley points";
  }
  if (only === "drawn-in") return one ? "time drawn in" : "times drawn in";
  return one ? "time at the net" : "times at the net";
}

/**
 * The Approaches cut's Statistics rail (design: KPI tiles, then "Approach
 * to", "Direction" and "How it ended"), from the same pool `computeViz`
 * draws (`approachPool`), so the rail counts every approach the court does —
 * an approach with no placement included, though it draws no dot.
 *
 * - **KPI:** the approaches shown and how many were won. The count reads
 *   "of N …" only when a filter narrows the cut's own pool (its `entry`).
 * - **Approach to** (their backhand, middle, their forehand) ignores the
 *   `approachTo` filter and follows the others, so every wing stays there to
 *   compare and switch to; likewise **Direction** (crosscourt, middle, down
 *   the line) ignores `approachDir`. Each is left out when nothing in the
 *   pool has one: a wing needs a landing, so a match with no coordinates has
 *   no Approach to (three "0 of 0" rows under a KPI of N would read as "you
 *   hit none"); a serve has no direction, so a serve-and-volley-only pool
 *   has no Direction. Decided from the pool, not the filtered rows, so a
 *   group never drops because of its own filter.
 * - **How it ended** follows every filter: each row is a count and its share
 *   of the KPI count, and the rows sum to it. With lob keys unknown the two
 *   passing rows read "Passed or lobbed …" and there is no Lobbed row.
 *
 * Every group keeps its rows in a fixed order (`FIXED_ORDER_GROUPS`): they
 * are places on the court and an ordered list of endings, not a ranking.
 */
function approachStats(
  points: MatchPoint[],
  filters: VizFilters,
  subjectIsPlayer1: boolean,
  matchCtx: MatchFilterContext | undefined,
): VizStats {
  const matchPass = matchFilterPass(
    points,
    filters,
    subjectIsPlayer1,
    matchCtx,
  );
  const { entryTotal, pool } = approachPool(
    points,
    filters,
    subjectIsPlayer1,
    matchPass,
    matchCtx,
  );
  const won = (e: PooledApproach) =>
    e.point.wonByPlayer1 === subjectIsPlayer1 ? 1 : 0;

  const shown = pool.filter(
    (e) =>
      approachToPasses(e.approach, filters) &&
      approachDirPasses(e.approach, filters),
  );
  const count = shown.length;
  const wonCount = shown.reduce((n, e) => n + won(e), 0);
  const noun = approachNoun(filters.entry, count);
  const kpi: StatKpi = {
    count,
    countLabel:
      count === entryTotal
        ? noun
        : `of ${entryTotal} ${approachNoun(filters.entry, entryTotal)}`,
    won: wonCount,
    winPct: count === 0 ? null : Math.round((wonCount / count) * 100),
  };

  const groups: StatGroup[] = [];

  // Approach to: every filter but its own; absent with no wing to show.
  if (pool.some((e) => e.approach.wing !== null)) {
    const byWing = pool.filter((e) => approachDirPasses(e.approach, filters));
    groups.push({
      key: "approach-to",
      label: "Approach to",
      rows: APPROACH_WING_ROWS.map(({ key, label }) => {
        const rows = byWing.filter((e) => e.approach.wing === key);
        return makeRow(
          key,
          label,
          rows.length,
          rows.reduce((n, e) => n + won(e), 0),
        );
      }),
    });
  }

  // Direction: every filter but its own; absent with no direction to show.
  if (pool.some((e) => e.approach.direction !== null)) {
    const byDir = pool.filter((e) => approachToPasses(e.approach, filters));
    groups.push({
      key: "approach-direction",
      label: "Direction",
      rows: APPROACH_DIRECTION_ROWS.map(({ key, label }) => {
        const rows = byDir.filter((e) => e.approach.direction === key);
        return makeRow(
          APPROACH_DIRECTION_KEY[key],
          label,
          rows.length,
          rows.reduce((n, e) => n + won(e), 0),
        );
      }),
    });
  }

  // How it ended: every filter; a share of the approaches shown.
  const lobsKnown = !!matchCtx?.lobKeys;
  const buckets = lobsKnown
    ? APPROACH_ENDED_ROWS.lobsKnown
    : APPROACH_ENDED_ROWS.lobsUnknown;
  groups.push({
    key: "approach-ended",
    label: "How it ended",
    rows: buckets.map((bucket): StatRow => {
      const n = shown.filter((e) => e.approach.bucket === bucket).length;
      return {
        key: bucket,
        label: APPROACH_BUCKET_LABEL[bucket],
        count: n,
        won: 0,
        winPct: count === 0 ? null : Math.round((n / count) * 100),
        share: true,
      };
    }),
  });

  return {
    title: "Where the approaches went",
    subtitle: `Points won by approach · ${count} ${noun}`,
    groups,
    // The won-rate groups only: "How it ended" is a share, not a win rate.
    sentence: buildSentence(
      groups.filter((g) => g.key !== "approach-ended"),
      approachNoun(filters.entry, 2),
    ),
    total: count,
    kpi,
  };
}

/**
 * The errors cut's two groups, each row a SHARE of the errors drawn
 * (`StatRow.share`): how the ball missed — into the net, long (past the
 * baseline), wide (past a sideline) — and the stroke that missed it. A ball
 * both long and wide reads Long. A double fault's serve is measured against
 * the service box instead. Rows are in count order, biggest first.
 */
function errorStats(result: VizResult): StatGroup[] {
  const total = result.dots.length;
  const shareRow = (key: string, label: string, count: number): StatRow => ({
    key,
    label,
    count,
    won: 0,
    winPct: total === 0 ? null : Math.round((count / total) * 100),
    share: true,
  });
  const byCount = (rows: StatRow[]) =>
    [...rows].sort((a, b) => b.count - a.count || rowTieBreak(a, b));

  let net = 0;
  let long = 0;
  let wide = 0;
  let inCourt = 0;
  const strokes = new Map<string, number>();
  for (const dot of result.dots) {
    const miss = errorMissKey(dot);
    if (miss === "net") net++;
    else if (miss === "long") long++;
    else if (miss === "wide") wide++;
    else inCourt++;
    const stroke = dot.meta?.stroke ?? "Other";
    strokes.set(stroke, (strokes.get(stroke) ?? 0) + 1);
  }

  const missRows = [
    shareRow("net", "Net", net),
    shareRow("long", "Long", long),
    shareRow("wide", "Wide", wide),
  ];
  // A recorded error whose landing reads in — kept, so the shares add up.
  if (inCourt > 0) missRows.push(shareRow("in", "Landed in", inCourt));

  return [
    { key: "miss", label: "Miss", rows: byCount(missRows) },
    {
      key: "stroke",
      label: "Stroke",
      rows: byCount(
        [...strokes].map(([label, count]) =>
          shareRow(label.toLowerCase(), label, count),
        ),
      ),
    },
  ];
}

/** Geometry and values share the SAME settings and computed statistics. */
export interface VizBandZones {
  kind: "depth" | "contact";
  dividersFt: number[];
  rows: BandRow[];
  statRows: StatRow[] | null;
}

/**
 * The bands' `% · n` recounted over the marks the court is drawing — the
 * lightbox's court once a Statistics row or a legend key narrows it, so
 * picking "Down the line" turns every band into "of the down-the-line
 * returns, how many landed here and how many of those were won".
 *
 * Bucketed from the overlay's OWN dividers (never a second read of the
 * settings), by the same rules `computeVizStats` uses: placement cuts count
 * only marks that landed in (`isPlacementRow`), contact cuts count every
 * mark. Index order is band order, as `depthBandRows`/`contactBandRows`
 * list it. A band no mark falls in comes back `count: 0`, which the overlay
 * prints as nothing.
 */
export function bandStatRowsForDots(
  cut: Cut,
  zones: Pick<VizBandZones, "kind" | "dividersFt" | "rows">,
  dots: readonly VizDot[],
): StatRow[] | null {
  const [a, b] = zones.dividersFt;
  if (a === undefined || b === undefined || zones.rows.length !== 3)
    return null;
  const bucket =
    zones.kind === "depth"
      ? makeDepthBucketer({
          depthScheme: "custom",
          depthDividersFt: [a, b],
          contactDividersFt: [0, 0],
        })
      : makeContactBucketer({
          depthScheme: "none",
          depthDividersFt: null,
          contactDividersFt: [a, b],
        });
  const placement = cut === "returnPlacement" || cut === "rallyPlacement";
  const acc = bandRowAccumulator(zones.rows);
  for (const dot of dots) {
    if (placement && !isPlacementRow(dot)) continue;
    const row = zones.rows[bucket(dot.depthM)];
    if (!row) continue;
    acc[row.key].count++;
    if (dot.outcome === "won") acc[row.key].won++;
  }
  return zones.rows.map((r) =>
    makeRow(r.key, r.label, acc[r.key].count, acc[r.key].won),
  );
}

export function bandZonesFor(
  cut: Cut,
  bands: BandSettings,
  unit: DistanceUnit,
  stats: VizStats | null,
  contactHidden = false,
): VizBandZones | null {
  const kind = bandKindFor(cut);
  if (kind === null) return null;
  if (kind === "contact" && contactHidden) return null;
  const rows =
    kind === "depth"
      ? depthBandRows(bands, unit)
      : contactBandRows(bands, unit);
  if (!rows.length) return null;
  return {
    kind,
    rows,
    dividersFt:
      kind === "depth"
        ? resolveDepthDividersFt(bands)
        : [...bands.contactDividersFt],
    statRows:
      stats?.groups.find((group) => group.key === "depth")?.rows ?? null,
  };
}
