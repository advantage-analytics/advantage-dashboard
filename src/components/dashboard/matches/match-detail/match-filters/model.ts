import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import { isFeedShotType, isServeShotType } from "@/lib/data/serve-return-shots";
import type { Match } from "@/lib/data/types";

import { playerHands } from "../../player-hands";
import { COURT_LENGTH_M, NET_Y_M } from "../film/film-court";
import {
  courtSidesOf,
  normalizePointScore,
  POINT_SCORE_OPTIONS,
  type PointScoreOption,
} from "./score";
import {
  hitterHalf,
  inferHand,
  shotDirection,
  type CourtHalf,
  type Hand,
  type ShotDirection,
} from "./shot-geometry";
import {
  normalizeReturnSpin,
  normalizeServeSpin,
  type ReturnSpin,
  type ServeSpin,
} from "./spin";

export { POINT_SCORE_OPTIONS, type PointScoreOption } from "./score";

/**
 * The shared match filters — ONE model behind the Film (Video) tab's filters
 * and the statistic cuts that open it (Score / Serve / Return / Result /
 * Custom). The Statistics tab itself is never filtered. Pure logic: no React, no
 * `next/navigation`, so Playwright specs import it directly.
 *
 * Combination rule, everywhere: OR within a group, AND across groups and
 * sections. An empty group is no constraint.
 *
 * ── Player attribution (docs/ui-revamp-guardrails.md) ───────────────────────
 *
 * Players are stored as "you" | "opponent" and resolved to a seat through
 * `ctx.youIsPlayer1` — the same `useMatchSides()` answer every card uses —
 * never through player1/player2 directly. Serve.Player and Return.Player are
 * ONE field (`server`): the returner is always the other player, so "you
 * returning" IS `server: "opponent"`. Serve.Side and Return.Side are likewise
 * one field (`court`), the point's service court.
 */

/* ── State ──────────────────────────────────────────────────────────────── */

export type PlayerSide = "you" | "opponent";
export type ScoreType = "pressure" | "breakpoint" | "setPoint" | "matchPoint";
export type ServeType = "first" | "second";
export type ServeZone = "Wide" | "Body" | "T";
export type ReturnStroke = "Forehand" | "Backhand";
export type ReturnZone = "Down the Line" | "Middle" | "Crosscourt";
/** Return contact depth from the returner's own baseline. */
export type ReturnContact = "inside" | "middle" | "neutral";
export type ResultShot =
  "Serve" | "Return" | "Forehand" | "Backhand" | "Volley" | "Overhead";
/** Result › Outcome — always from YOUR side (`youIsPlayer1`). */
export type ResultOutcome = "won" | "lost";
/** Result › Ending — the point ended on a winner or an error. */
export type ResultEnding = "winner" | "error";
/** How the serve ended up — at most one per point (`serveResultOf`). */
export type ServeResult =
  "ace" | "service-winner" | "return-error" | "in-play" | "double-fault";
/** How the return ended up (`returnResultOf`). */
export type ReturnResult = "winner" | "error" | "in-play";
/** Where the point's last shot missed (`point.shots`' last row). */
export type ResultMissed = "Out" | "Net";
/** `rally-length-card.tsx`'s bands, by the same keys. */
export type RallyLengthBand = "short" | "medium" | "long";

export type { CourtHalf, ReturnSpin, ServeSpin, ShotDirection };

export interface MatchFilters {
  /* Score */
  readonly sets: readonly number[];
  readonly scoreType: readonly ScoreType[];
  /** Server-first, before the point. */
  readonly scorePoints: readonly PointScoreOption[];
  /* Serve + Return (shared) */
  /** Who served. Return.Player is the other player: returner = you ⇔ `"opponent"`. */
  readonly server: PlayerSide | null;
  /** The point's service court — Serve.Side and Return.Side both. */
  readonly court: CourtHalf | null;
  /* Serve */
  readonly serveType: readonly ServeType[];
  readonly serveSpin: readonly ServeSpin[];
  readonly serveZone: readonly ServeZone[];
  readonly serveResult: readonly ServeResult[];
  /* Return */
  readonly returnType: readonly ReturnStroke[];
  readonly returnSpin: readonly ReturnSpin[];
  readonly returnZone: readonly ReturnZone[];
  readonly returnContact: readonly ReturnContact[];
  readonly returnResult: readonly ReturnResult[];
  /* Result */
  /** Won or lost from your side — never the Result player's. */
  readonly resultOutcome: readonly ResultOutcome[];
  /**
   * Hit by: who struck the point's last shot. Alone it is `finalShotOf`'s
   * hitter; with Shot, Ending or Missed chosen it is that group's point of
   * view instead (a service winner is the server's, whatever the last row).
   */
  readonly resultPlayer: PlayerSide | null;
  readonly resultShot: readonly ResultShot[];
  /** The winner or error the point ended on, by the Result player when set. */
  readonly resultEnding: readonly ResultEnding[];
  /** The last shot's miss, hit by the Result player when one is set. */
  readonly resultMissed: readonly ResultMissed[];
  readonly resultRallyLength: readonly RallyLengthBand[];
  /* Custom — every chosen group must hold on ONE shot */
  readonly customPlayer: PlayerSide | null;
  readonly customSide: readonly CourtHalf[];
  readonly customDirection: readonly ShotDirection[];
  /** `shot.shotNumber`, 1 = the deciding serve. */
  readonly customRallyShot: readonly number[];
}

export type MatchFilterKey = keyof MatchFilters;

type ElementOf<T> = T extends readonly (infer E)[] ? E : NonNullable<T>;
/** One option's value in group `K` — an array element, or the single value. */
export type MatchFilterValue<K extends MatchFilterKey> = ElementOf<
  MatchFilters[K]
>;

/** Groups that hold one value (or none) rather than a multi-select list. */
const SINGLE_KEYS = [
  "server",
  "court",
  "resultPlayer",
  "customPlayer",
] as const satisfies readonly MatchFilterKey[];
type SingleKey = (typeof SINGLE_KEYS)[number];

function isSingleKey(key: MatchFilterKey): key is SingleKey {
  return (SINGLE_KEYS as readonly string[]).includes(key);
}

/** Every group key, in panel order — also the serialization order. */
export const MATCH_FILTER_KEYS: readonly MatchFilterKey[] = [
  "sets",
  "scoreType",
  "scorePoints",
  "server",
  "court",
  "serveType",
  "serveSpin",
  "serveZone",
  "serveResult",
  "returnType",
  "returnSpin",
  "returnZone",
  "returnContact",
  "returnResult",
  "resultOutcome",
  "resultPlayer",
  "resultShot",
  "resultEnding",
  "resultMissed",
  "resultRallyLength",
  "customPlayer",
  "customSide",
  "customDirection",
  "customRallyShot",
];

export const EMPTY_MATCH_FILTERS: MatchFilters = Object.freeze({
  sets: [],
  scoreType: [],
  scorePoints: [],
  server: null,
  court: null,
  serveType: [],
  serveSpin: [],
  serveZone: [],
  serveResult: [],
  returnType: [],
  returnSpin: [],
  returnZone: [],
  returnContact: [],
  returnResult: [],
  resultOutcome: [],
  resultPlayer: null,
  resultShot: [],
  resultEnding: [],
  resultMissed: [],
  resultRallyLength: [],
  customPlayer: null,
  customSide: [],
  customDirection: [],
  customRallyShot: [],
});

/* ── Option catalog ─────────────────────────────────────────────────────── */

export interface FilterOption<V> {
  value: V;
  label: string;
}

const PLAYER_OPTIONS: readonly FilterOption<PlayerSide>[] = [
  { value: "you", label: "You" },
  { value: "opponent", label: "Opponent" },
];
const SIDE_OPTIONS: readonly FilterOption<CourtHalf>[] = [
  { value: "deuce", label: "Deuce" },
  { value: "ad", label: "Ad" },
];
export const RALLY_SHOT_NUMBERS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];

/**
 * The fixed options of each group, in panel order. `sets` is empty here: its
 * options are the match's own set numbers (see `optionAvailability`). Player
 * labels are placeholders — the panel prints the players' names.
 */
export const MATCH_FILTER_OPTIONS: {
  readonly [K in MatchFilterKey]: readonly FilterOption<MatchFilterValue<K>>[];
} = {
  sets: [],
  scoreType: [
    { value: "pressure", label: "Pressure" },
    { value: "breakpoint", label: "Break point" },
    { value: "setPoint", label: "Set point" },
    { value: "matchPoint", label: "Match point" },
  ],
  scorePoints: POINT_SCORE_OPTIONS.map((value) => ({ value, label: value })),
  server: PLAYER_OPTIONS,
  court: SIDE_OPTIONS,
  serveType: [
    { value: "first", label: "First serve" },
    { value: "second", label: "Second serve" },
  ],
  serveSpin: [
    { value: "Flat", label: "Flat" },
    { value: "Slice", label: "Slice" },
    { value: "Kick", label: "Kick" },
  ],
  serveZone: [
    { value: "Wide", label: "Wide" },
    { value: "Body", label: "Body" },
    { value: "T", label: "T" },
  ],
  serveResult: [
    { value: "ace", label: "Ace" },
    { value: "service-winner", label: "Service winner" },
    { value: "return-error", label: "Return error" },
    { value: "in-play", label: "In play" },
    { value: "double-fault", label: "Double fault" },
  ],
  returnType: [
    { value: "Forehand", label: "Forehand" },
    { value: "Backhand", label: "Backhand" },
  ],
  returnSpin: [
    { value: "Topspin", label: "Topspin" },
    { value: "Slice", label: "Slice" },
  ],
  returnZone: [
    { value: "Down the Line", label: "Down the line" },
    { value: "Middle", label: "Middle" },
    { value: "Crosscourt", label: "Crosscourt" },
  ],
  returnContact: [
    { value: "inside", label: "Inside the baseline" },
    { value: "middle", label: "On the baseline" },
    { value: "neutral", label: "Deep" },
  ],
  returnResult: [
    { value: "winner", label: "Winner" },
    { value: "error", label: "Error" },
    { value: "in-play", label: "In play" },
  ],
  resultOutcome: [
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
  ],
  resultPlayer: PLAYER_OPTIONS,
  resultShot: [
    { value: "Serve", label: "Serve" },
    { value: "Return", label: "Return" },
    { value: "Forehand", label: "Forehand" },
    { value: "Backhand", label: "Backhand" },
    { value: "Volley", label: "Volley" },
    { value: "Overhead", label: "Overhead" },
  ],
  resultEnding: [
    { value: "winner", label: "Winner" },
    { value: "error", label: "Error" },
  ],
  resultMissed: [
    { value: "Out", label: "Out" },
    { value: "Net", label: "Net" },
  ],
  resultRallyLength: [
    { value: "short", label: "Short 1–4" },
    { value: "medium", label: "Medium 5–8" },
    { value: "long", label: "Long 9+" },
  ],
  customPlayer: PLAYER_OPTIONS,
  customSide: SIDE_OPTIONS,
  customDirection: [
    { value: "Crosscourt", label: "Crosscourt" },
    { value: "Down the Line", label: "Down the line" },
    { value: "Inside Out", label: "Inside out" },
    { value: "Inside In", label: "Inside in" },
  ],
  customRallyShot: RALLY_SHOT_NUMBERS.map((n) => ({
    value: n,
    label: String(n),
  })),
};

export type MatchFilterSectionId =
  "score" | "serve" | "return" | "result" | "custom";

export interface MatchFilterGroup {
  key: MatchFilterKey;
  label: string;
  /**
   * The group shows the OTHER player of its field: Return › Player is backed
   * by `server`, so the panel draws "you" selected when `server` is
   * "opponent".
   */
  invertPlayer?: boolean;
  /** A quiet aside printed after the label ("server first"). */
  note?: string;
}

/** Sections and their groups, in panel order. */
export const MATCH_FILTER_SECTIONS: readonly {
  id: MatchFilterSectionId;
  label: string;
  groups: readonly MatchFilterGroup[];
}[] = [
  {
    id: "score",
    label: "Score",
    groups: [
      { key: "sets", label: "Sets" },
      { key: "scoreType", label: "Type" },
      { key: "scorePoints", label: "Points", note: "server first" },
    ],
  },
  {
    id: "serve",
    label: "Serve",
    groups: [
      { key: "server", label: "Player" },
      { key: "court", label: "Side" },
      { key: "serveType", label: "Type" },
      { key: "serveSpin", label: "Spin" },
      { key: "serveZone", label: "Zone" },
      { key: "serveResult", label: "Result" },
    ],
  },
  {
    id: "return",
    label: "Return",
    groups: [
      {
        key: "server",
        label: "Player",
        note: "follows the server",
        invertPlayer: true,
      },
      { key: "court", label: "Side" },
      { key: "returnType", label: "Type" },
      { key: "returnSpin", label: "Spin" },
      { key: "returnZone", label: "Zone" },
      {
        key: "returnContact",
        label: "Contact depth",
        note: "from the baseline",
      },
      { key: "returnResult", label: "Result" },
    ],
  },
  {
    id: "result",
    label: "Result",
    groups: [
      { key: "resultOutcome", label: "Outcome", note: "from your side" },
      { key: "resultPlayer", label: "Hit by", note: "the last shot" },
      { key: "resultShot", label: "Shot" },
      { key: "resultEnding", label: "Ending" },
      { key: "resultMissed", label: "Missed" },
      { key: "resultRallyLength", label: "Rally length" },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    groups: [
      { key: "customPlayer", label: "Hit by" },
      { key: "customSide", label: "Side" },
      { key: "customDirection", label: "Direction" },
      { key: "customRallyShot", label: "Hit", note: "1 = the serve" },
    ],
  },
];

/* ── Context ────────────────────────────────────────────────────────────── */

export interface MatchFilterContext {
  /** `useMatchSides().you.isPlayer1` — who "you" is. */
  youIsPlayer1: boolean;
  /** Each seat's stroke hand, for Custom › Direction's Inside-Out/Inside-In. */
  hands: { player1: Hand | null; player2: Hand | null };
  /**
   * An Advantage Intelligence (video-derived) match (`isDerivedMatch`).
   * Absent reads as NOT derived: a SwingVision match. Serve › Result reads it
   * (`serveResultOf`).
   */
  isDerived?: boolean;
}

/** A video-derived (Advantage Intelligence) match, off the match row. */
export function isDerivedMatch(match: Pick<Match, "sourceProvider">): boolean {
  return match.sourceProvider === "splitstep";
}

/**
 * The filters' context for one match: the match row's hands
 * (`playerHands`, already seat-correct — no swap here) and, where a row has
 * none, the hand inferred from that seat's forehands (`inferHand`); and
 * whether the match is derived from video (`isDerived`), off the same row.
 */
export function buildFilterContext(
  match: Pick<Match, "player1" | "player2" | "sourceProvider">,
  points: readonly Pick<MatchPoint, "shots">[],
  youIsPlayer1: boolean,
): MatchFilterContext {
  const stored = playerHands(match);
  return {
    youIsPlayer1,
    hands: {
      player1: stored.player1 ?? inferHand(points, true),
      player2: stored.player2 ?? inferHand(points, false),
    },
    isDerived: isDerivedMatch(match),
  };
}

function seatOf(side: PlayerSide, ctx: MatchFilterContext): boolean {
  return side === "you" ? ctx.youIsPlayer1 : !ctx.youIsPlayer1;
}

/**
 * A seat's hand from the context — the one lookup the Direction filter and
 * the Video tab's shot rows (`shotRowCells`) share, so a shot the filter
 * calls Inside Out is labelled Inside Out. `ctx.hands` is already
 * seat-correct; never swap on `youIsPlayer1` here.
 */
export function handOf(
  isPlayer1: boolean,
  ctx: MatchFilterContext,
): Hand | null {
  return isPlayer1 ? ctx.hands.player1 : ctx.hands.player2;
}

/* ── Per-point readings ─────────────────────────────────────────────────── */

function lower(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** The Points-grid value of a point, from the RAW score only. */
export function pointScoreOption(
  point: Pick<MatchPoint, "pointScoreRaw" | "gameScore">,
): PointScoreOption | null {
  return normalizePointScore(point.pointScoreRaw, point.gameScore);
}

function matchesScoreType(point: MatchPoint, type: ScoreType): boolean {
  switch (type) {
    case "pressure": {
      const grid = pointScoreOption(point);
      return (
        grid === "30-30" ||
        grid === "40-40" ||
        point.isBreakPoint ||
        point.isSetPoint ||
        point.isMatchPoint
      );
    }
    case "breakpoint":
      return point.isBreakPoint;
    case "setPoint":
      return point.isSetPoint;
    case "matchPoint":
      return point.isMatchPoint;
  }
}

function serveTypeOf(point: MatchPoint): ServeType | null {
  if (point.firstShotType === "First Serve") return "first";
  if (point.firstShotType === "Second Serve") return "second";
  return null;
}

function serveZoneOf(point: MatchPoint): ServeZone | null {
  const z = lower(point.firstShotZone);
  if (z === "wide") return "Wide";
  if (z === "body") return "Body";
  if (z === "t") return "T";
  return null;
}

function returnStrokeOf(point: MatchPoint): ReturnStroke | null {
  const t = lower(point.secondShotType);
  if (t.includes("forehand")) return "Forehand";
  if (t.includes("backhand")) return "Backhand";
  return null;
}

function returnZoneOf(point: MatchPoint): ReturnZone | null {
  const z = lower(point.secondShotZone);
  if (z === "down the line") return "Down the Line";
  if (z === "middle") return "Middle";
  if (z === "crosscourt") return "Crosscourt";
  return null;
}

/** Deep edge of Return › Contact — `calculate_match_stats`' 1.0 m. */
export const RETURN_CONTACT_DEEP_M = 1.0;

/**
 * Return contact depth, from the return's own `contact_y` (the return shot is
 * picked by role at load time). Metres behind the RETURNER's baseline — the
 * end they stand at is read off the contact itself, the same
 * `CASE WHEN contact_y < 11.885 THEN contact_y ELSE 23.77 - contact_y END`
 * the published return-depth stat uses. Inside = in front of the baseline,
 * Middle = 0–1.0 m behind, Neutral = more than 1.0 m behind. Null when the
 * contact was not measured.
 */
export function returnContactOf(
  contactY: number | null | undefined,
): ReturnContact | null {
  if (typeof contactY !== "number" || !Number.isFinite(contactY)) return null;
  const behind = contactY < NET_Y_M ? -contactY : contactY - COURT_LENGTH_M;
  if (behind < 0) return "inside";
  if (behind <= RETURN_CONTACT_DEEP_M) return "middle";
  return "neutral";
}

/**
 * The serve was never returned and the server won the point: a one-shot
 * rally won by whoever served. Structural on purpose — rally length and the
 * point's winner, never the "Service Winner" label — so a service winner
 * with an intermediate stroke (rally length above one) is not one. The
 * head-to-head card's derived Aces tally and Serve › Result "Ace" on a
 * derived match are this one predicate, laid by the server — keep them so.
 * A double fault is never one: the server lost it.
 */
export function isUnreturnedServe(point: MatchPoint): boolean {
  return (
    point.rallyLength === 1 && point.wonByPlayer1 === point.serverIsPlayer1
  );
}

/**
 * Serve › Result — a priority chain, so a point lands in at most one option:
 * the point's own result type first (Ace, Service Winner, Double Fault),
 * else how the return came back (`secondShotResult` Out/Net = a return
 * error, In = in play), else none. A service winner whose return row reads
 * Out is a service winner only.
 *
 * On a derived match (`ctx.isDerived`) "Ace" is structural instead:
 * `isUnreturnedServe`, and never the result type — the derivation labels
 * every unreturned serve "Service Winner" and never "Ace", and the
 * head-to-head card counts these as its Aces. So an unreturned serve is an
 * ace there, and "Service winner" is never an answer: a serve the returner
 * touched is found by the return instead (Return › Result "Error"), and the
 * option is left out of the panel (`optionAvailability`).
 */
export function serveResultOf(
  point: MatchPoint,
  ctx: MatchFilterContext,
): ServeResult | null {
  const rt = lower(point.resultType);
  if (ctx.isDerived ? isUnreturnedServe(point) : rt === "ace") return "ace";
  if (rt === "service winner" && !ctx.isDerived) return "service-winner";
  if (rt === "double fault") return "double-fault";
  const ret = point.secondShotResult;
  if (ret === "Out" || ret === "Net") return "return-error";
  if (ret === "In") return "in-play";
  return null;
}

/**
 * The name a point is shown under — the points list row, "This point" and the
 * room's scoreboard. The stored result type, except on a derived match, where
 * an unreturned serve reads "Ace": the derivation stores it as "Service
 * Winner", but the head-to-head Aces row counts it and Serve › Result "Ace"
 * opens it (`serveResultOf`), so the rows that click shows must say so. A
 * service winner with a stroke after the serve is not one and keeps its label.
 */
export function pointResultLabel(
  point: MatchPoint,
  ctx: Pick<MatchFilterContext, "isDerived">,
): string {
  if (ctx.isDerived && isUnreturnedServe(point)) return "Ace";
  return point.resultType || "Point";
}

/**
 * The point ended on a winning return: the head-to-head card's Return winners
 * row counts exactly these (adding that the returner won the point), and its
 * cut, Return › Result "Winner", admits exactly these. One definition, so the
 * figure and the points a click opens cannot drift apart.
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

/**
 * Return › Result: a winning return (`isReturnWinner`), a missed one
 * (`secondShotResult` Out/Net), or one that landed and the rally went on.
 * None when the return's result was not recorded.
 */
export function returnResultOf(point: MatchPoint): ReturnResult | null {
  // No serve landed, so there was no return — whatever the returner's swing
  // at the dead ball recorded (see `lastShotOf`).
  if (lower(point.resultType) === "double fault") return null;
  if (isReturnWinner(point)) return "winner";
  const ret = point.secondShotResult;
  if (ret === "Out" || ret === "Net") return "error";
  if (ret === "In") return "in-play";
  return null;
}

/**
 * `rally-length-card.tsx`'s band of a rally length — 1–4 short, 5–8 medium,
 * 9+ long. Null below 1: 0 is "no shot count recorded", which that card
 * leaves out of every band.
 */
export function rallyLengthBandOf(rallyLength: number): RallyLengthBand | null {
  if (!(rallyLength >= 1)) return null;
  if (rallyLength >= 9) return "long";
  if (rallyLength >= 5) return "medium";
  return "short";
}

function strokeOf(shotType: string | null | undefined): ResultShot | null {
  const t = lower(shotType);
  if (t.includes("overhead") || t.includes("smash")) return "Overhead";
  if (t.includes("volley")) return "Volley";
  if (t.includes("forehand")) return "Forehand";
  if (t.includes("backhand")) return "Backhand";
  return null;
}

/**
 * The shot that ended the point — its kind and who struck it. Serve and
 * Return are picked by ROLE (a serve row; the first non-serve, non-feed row),
 * the same classification the loader uses for `firstShot*`/`secondShot*`, so
 * a Feed row or two serve rows sharing shot 1 do not shift them. A row with no
 * type falls back to its shot number (1 = serve, 2 = return). Without shot
 * rows it reads `lastShotType` and the loader's `point.player`.
 */
export function finalShotOf(
  point: MatchPoint,
): { kind: ResultShot | null; isPlayer1: boolean } | null {
  const shots = point.shots ?? [];
  const last = lastShotOf(point);
  if (!last) {
    if (!point.lastShotType) return null;
    return {
      kind: isServeShotType(point.lastShotType)
        ? "Serve"
        : strokeOf(point.lastShotType),
      isPlayer1: point.player === "player1",
    };
  }
  let kind: ResultShot | null;
  if (last.shotType === null) {
    kind =
      last.shotNumber === 1 ? "Serve" : last.shotNumber === 2 ? "Return" : null;
  } else if (isServeShotType(last.shotType)) {
    kind = "Serve";
  } else if (
    last ===
    shots.find(
      (s) => !isServeShotType(s.shotType) && !isFeedShotType(s.shotType),
    )
  ) {
    kind = "Return";
  } else {
    kind = strokeOf(last.shotType);
  }
  return { kind, isPlayer1: last.isPlayer1 };
}

/**
 * The point's deciding shot row: its last one, except on a double fault,
 * where it is the server's last serve. SwingVision records the returner's
 * swing at the dead second serve after it (about half its double faults end
 * on a "Backhand … In" row), and reading that row made a double fault a
 * Return, hit by the returner — out of the Error + Serve cut that the
 * head-to-head and Point endings Double faults figures open.
 */
export function lastShotOf(point: MatchPoint): MatchShot | undefined {
  const shots = point.shots ?? [];
  if (lower(point.resultType) === "double fault") {
    for (let i = shots.length - 1; i >= 0; i -= 1) {
      if (isServeShotType(shots[i].shotType)) return shots[i];
    }
  }
  return shots[shots.length - 1];
}

/**
 * Result › Missed: the point's LAST shot row went Out or into the Net
 * (either case), and — when a Result player is set — that player hit it.
 * Without shot rows there is no last shot, so nothing matches.
 */
function matchesMissed(
  point: MatchPoint,
  missed: ResultMissed,
  pov: boolean | null,
): boolean {
  const last = lastShotOf(point);
  if (!last) return false;
  if (lower(last.result) !== missed.toLowerCase()) return false;
  return pov === null || last.isPlayer1 === pov;
}

/**
 * Who hit the point's winner (true = player1), or null when it did not end
 * on one. Aces and service winners are the SERVER's — structurally, as in
 * `head-to-head-card.tsx`/`point-endings-card.tsx` for aces; for a service
 * winner the last shot row is usually the returner's missed return, so the
 * last-shot rule would credit the wrong player. Every other winner is the
 * decisive shot's hitter (`point.player`'s rule), else the point's winner.
 */
export function winnerHitBy(point: MatchPoint): boolean | null {
  const rt = lower(point.resultType);
  if (rt === "service winner" || /\bace\b/.test(rt)) {
    return point.serverIsPlayer1;
  }
  if (!rt.includes("winner")) return null;
  const last = lastShotOf(point);
  return last ? last.isPlayer1 : point.wonByPlayer1;
}

/**
 * Who made the point's error (true = player1), or null when it did not end
 * on one. A double fault is the server's. Any other "…Error" result is the
 * decisive shot's hitter, else the point's loser. With NO result type, a
 * last shot recorded Out or Net is its hitter's error.
 */
export function errorMadeBy(point: MatchPoint): boolean | null {
  const rt = lower(point.resultType);
  if (rt.includes("double fault")) return point.serverIsPlayer1;
  const last = lastShotOf(point);
  if (rt.includes("error")) return last ? last.isPlayer1 : !point.wonByPlayer1;
  if (rt === "" && last) {
    const result = lower(last.result);
    if (result === "out" || result === "net") return last.isPlayer1;
  }
  return null;
}

/**
 * Result › Outcome is read from YOUR side and nowhere else (guardrails §4:
 * attribution follows `youIsPlayer1` exactly) — the Result player never
 * flips it, so "Hit by the opponent · Won" is the points you won that ended
 * on the opponent's racket.
 */
function matchesOutcome(
  point: MatchPoint,
  outcome: ResultOutcome,
  youIsPlayer1: boolean,
): boolean {
  return outcome === "won"
    ? point.wonByPlayer1 === youIsPlayer1
    : point.wonByPlayer1 !== youIsPlayer1;
}

/** Result › Ending, by the Result player (`pov`) when one is set. */
function matchesEnding(
  point: MatchPoint,
  ending: ResultEnding,
  pov: boolean | null,
): boolean {
  const by = ending === "winner" ? winnerHitBy(point) : errorMadeBy(point);
  return by !== null && (pov === null || by === pov);
}

function hasCustom(f: MatchFilters): boolean {
  return (
    f.customPlayer !== null ||
    f.customSide.length > 0 ||
    f.customDirection.length > 0 ||
    f.customRallyShot.length > 0
  );
}

/**
 * The same-shot rule: ONE shot must satisfy every chosen Custom group at
 * once. Shot numbers below 1 (feeds, faulted serves) never match.
 */
function matchesCustom(
  point: MatchPoint,
  f: MatchFilters,
  ctx: MatchFilterContext,
): boolean {
  const player = f.customPlayer === null ? null : seatOf(f.customPlayer, ctx);
  return (point.shots ?? []).some((shot) => {
    if (!(shot.shotNumber >= 1)) return false;
    if (player !== null && shot.isPlayer1 !== player) return false;
    if (f.customRallyShot.length > 0) {
      if (!f.customRallyShot.includes(shot.shotNumber)) return false;
    }
    if (f.customSide.length > 0) {
      const half = hitterHalf(shot);
      if (half === null || !f.customSide.includes(half)) return false;
    }
    if (f.customDirection.length > 0) {
      const dir = shotDirection(shot, handOf(shot.isPlayer1, ctx));
      if (dir === null || !f.customDirection.includes(dir)) return false;
    }
    return true;
  });
}

function anyOf<T>(
  selected: readonly T[],
  value: T | null | undefined,
): boolean {
  return value !== null && value !== undefined && selected.includes(value);
}

/**
 * Whether one point passes the filters. `court` is the point's service court
 * (`courtSidesOf`, which needs the whole match in order — hence passed in).
 */
export function matchesPoint(
  point: MatchPoint,
  f: MatchFilters,
  ctx: MatchFilterContext,
  court: CourtHalf,
): boolean {
  /* Score */
  if (f.sets.length > 0 && !f.sets.includes(point.setNumber)) return false;
  if (
    f.scoreType.length > 0 &&
    !f.scoreType.some((t) => matchesScoreType(point, t))
  ) {
    return false;
  }
  if (
    f.scorePoints.length > 0 &&
    !anyOf(f.scorePoints, pointScoreOption(point))
  ) {
    return false;
  }

  /* Serve + Return, shared */
  if (f.server !== null && point.serverIsPlayer1 !== seatOf(f.server, ctx)) {
    return false;
  }
  if (f.court !== null && court !== f.court) return false;

  /* Serve */
  if (f.serveType.length > 0 && !anyOf(f.serveType, serveTypeOf(point))) {
    return false;
  }
  if (
    f.serveSpin.length > 0 &&
    !anyOf(f.serveSpin, normalizeServeSpin(point.firstShotSpin))
  ) {
    return false;
  }
  if (f.serveZone.length > 0 && !anyOf(f.serveZone, serveZoneOf(point))) {
    return false;
  }
  if (
    f.serveResult.length > 0 &&
    !anyOf(f.serveResult, serveResultOf(point, ctx))
  ) {
    return false;
  }

  /* Return */
  if (f.returnType.length > 0 && !anyOf(f.returnType, returnStrokeOf(point))) {
    return false;
  }
  if (
    f.returnSpin.length > 0 &&
    !anyOf(f.returnSpin, normalizeReturnSpin(point.secondShotSpin))
  ) {
    return false;
  }
  if (f.returnZone.length > 0 && !anyOf(f.returnZone, returnZoneOf(point))) {
    return false;
  }
  if (
    f.returnContact.length > 0 &&
    !anyOf(f.returnContact, returnContactOf(point.secondShotContactY))
  ) {
    return false;
  }
  if (
    f.returnResult.length > 0 &&
    !anyOf(f.returnResult, returnResultOf(point))
  ) {
    return false;
  }

  /* Result — Outcome from your side; the rest from the Result player's */
  if (
    f.resultOutcome.length > 0 &&
    !f.resultOutcome.some((o) => matchesOutcome(point, o, ctx.youIsPlayer1))
  ) {
    return false;
  }
  const pov = f.resultPlayer === null ? null : seatOf(f.resultPlayer, ctx);
  // Hit by on its own: the last shot's hitter. With Shot, Ending or Missed
  // chosen it applies through that group's own attribution instead, so a
  // service winner stays the server's although its last row is the missed
  // return.
  if (
    pov !== null &&
    f.resultShot.length === 0 &&
    f.resultEnding.length === 0 &&
    f.resultMissed.length === 0
  ) {
    const final = finalShotOf(point);
    if (!final || final.isPlayer1 !== pov) return false;
  }
  if (f.resultShot.length > 0) {
    const final = finalShotOf(point);
    if (!final || !anyOf(f.resultShot, final.kind)) return false;
    if (pov !== null && final.isPlayer1 !== pov) return false;
  }
  if (
    f.resultEnding.length > 0 &&
    !f.resultEnding.some((e) => matchesEnding(point, e, pov))
  ) {
    return false;
  }
  if (
    f.resultMissed.length > 0 &&
    !f.resultMissed.some((m) => matchesMissed(point, m, pov))
  ) {
    return false;
  }
  if (
    f.resultRallyLength.length > 0 &&
    !anyOf(f.resultRallyLength, rallyLengthBandOf(point.rallyLength))
  ) {
    return false;
  }

  /* Custom */
  if (hasCustom(f) && !matchesCustom(point, f, ctx)) return false;

  return true;
}

/**
 * The points that pass `filters`, in their original order. No active filter
 * returns `points` itself. `points` must be in match order (the service court
 * is a running count within each game).
 */
export function applyMatchFilters(
  points: MatchPoint[],
  filters: MatchFilters,
  ctx: MatchFilterContext,
): MatchPoint[] {
  if (activeFilterCount(filters) === 0) return points;
  const courts = courtSidesOf(points);
  return points.filter((point, i) =>
    matchesPoint(point, filters, ctx, courts[i]),
  );
}

/* ── Counting, equality, editing ────────────────────────────────────────── */

/** Selected options across every group — the Filter button's badge. */
export function activeFilterCount(f: MatchFilters): number {
  let n = 0;
  for (const key of MATCH_FILTER_KEYS) {
    const v = f[key];
    if (Array.isArray(v)) n += v.length;
    else if (v !== null && v !== undefined) n += 1;
  }
  return n;
}

export function hasActiveMatchFilters(f: MatchFilters): boolean {
  return activeFilterCount(f) > 0;
}

function sameMembers(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  const seen = [...b];
  for (const value of a) {
    const at = seen.indexOf(value);
    if (at === -1) return false;
    seen.splice(at, 1);
  }
  return true;
}

/**
 * Whether two filters make the same cut. Groups are sets, not sequences, so
 * picking "Wide" then "T" equals picking them the other way round.
 */
export function filtersEqual(a: MatchFilters, b: MatchFilters): boolean {
  return MATCH_FILTER_KEYS.every((key) => {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) && Array.isArray(y)) return sameMembers(x, y);
    return x === y;
  });
}

/**
 * `filters` with one option toggled: added to or removed from a list group;
 * set or cleared on a single-choice group.
 */
export function toggleMatchFilter<K extends MatchFilterKey>(
  filters: MatchFilters,
  key: K,
  value: MatchFilterValue<K>,
): MatchFilters {
  const current = filters[key] as unknown;
  if (isSingleKey(key)) {
    return { ...filters, [key]: current === value ? null : value };
  }
  const list = current as readonly MatchFilterValue<K>[];
  const next = list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
  return { ...filters, [key]: next };
}

/** EMPTY with exactly one option chosen. */
function onlyOption<K extends MatchFilterKey>(
  key: K,
  value: MatchFilterValue<K>,
): MatchFilters {
  return toggleMatchFilter(EMPTY_MATCH_FILTERS, key, value);
}

/* ── Option availability ────────────────────────────────────────────────── */

export type MatchFilterAvailability = {
  readonly [K in MatchFilterKey]: ReadonlySet<MatchFilterValue<K>>;
};

/**
 * For every group, the options that would match at least one point of the
 * WHOLE match on their own — never the current selection, so options do not
 * jump around while you pick. An option missing from its group's set is
 * hidden (a video match offers no Ad-40, a one-set match has one set); a
 * group whose set is empty can be hidden whole. `sets` holds the match's set
 * numbers, ascending.
 */
export function optionAvailability(
  points: MatchPoint[],
  ctx: MatchFilterContext,
): MatchFilterAvailability {
  const courts = courtSidesOf(points);
  const out = {} as Record<MatchFilterKey, Set<unknown>>;
  for (const key of MATCH_FILTER_KEYS) {
    const candidates: readonly unknown[] =
      key === "sets"
        ? [...new Set(points.map((p) => p.setNumber))].sort((a, b) => a - b)
        : MATCH_FILTER_OPTIONS[key].map((o) => o.value);
    const available = new Set<unknown>();
    for (const value of candidates) {
      const only = onlyOption(key, value as MatchFilterValue<typeof key>);
      if (points.some((p, i) => matchesPoint(p, only, ctx, courts[i]))) {
        available.add(value);
      }
    }
    out[key] = available;
  }
  return out as unknown as MatchFilterAvailability;
}

/* ── URL form ───────────────────────────────────────────────────────────── */

/*
 * Compact and URL-safe even through `URLSearchParams` (which escapes anything
 * but letters, digits and `*-._`): groups are joined by "_", and each group is
 * its short key followed by its option codes, all joined by ".":
 *
 *   s.1.2_st.p_sc.30-30.Ad-40_sv.o_cd.io_cr.4
 *
 * Deterministic — keys in `MATCH_FILTER_KEYS` order, options in catalog order
 * (numbers ascending) — so equal filters serialize to the same string. The
 * empty filter is "".
 */

type CodeTable<K extends MatchFilterKey> = readonly (readonly [
  MatchFilterValue<K>,
  string,
])[];

const PLAYER_CODES: CodeTable<"server"> = [
  ["you", "y"],
  ["opponent", "o"],
];
const SIDE_CODES: CodeTable<"court"> = [
  ["deuce", "d"],
  ["ad", "a"],
];

const URL_CODEC: {
  readonly [K in MatchFilterKey]: {
    key: string;
    /** `"int"`: positive integers written as themselves. */
    codes: CodeTable<K> | "int";
  };
} = {
  sets: { key: "s", codes: "int" },
  scoreType: {
    key: "st",
    codes: [
      ["pressure", "p"],
      ["breakpoint", "bp"],
      ["setPoint", "sp"],
      ["matchPoint", "mp"],
    ],
  },
  scorePoints: {
    key: "sc",
    codes: MATCH_FILTER_OPTIONS.scorePoints.map((o) => [o.value, o.value]),
  },
  server: { key: "sv", codes: PLAYER_CODES },
  court: { key: "ct", codes: SIDE_CODES },
  serveType: {
    key: "vt",
    codes: [
      ["first", "1"],
      ["second", "2"],
    ],
  },
  serveSpin: {
    key: "vs",
    codes: [
      ["Flat", "f"],
      ["Slice", "s"],
      ["Kick", "k"],
    ],
  },
  serveZone: {
    key: "vz",
    codes: [
      ["Wide", "w"],
      ["Body", "b"],
      ["T", "t"],
    ],
  },
  serveResult: {
    key: "vr",
    codes: [
      ["ace", "a"],
      ["service-winner", "sw"],
      ["return-error", "re"],
      ["in-play", "ip"],
      ["double-fault", "df"],
    ],
  },
  returnType: {
    key: "rt",
    codes: [
      ["Forehand", "fh"],
      ["Backhand", "bh"],
    ],
  },
  returnSpin: {
    key: "rs",
    codes: [
      ["Topspin", "ts"],
      ["Slice", "sl"],
    ],
  },
  returnZone: {
    key: "rz",
    codes: [
      ["Down the Line", "dl"],
      ["Middle", "m"],
      ["Crosscourt", "cc"],
    ],
  },
  returnContact: {
    key: "rc",
    codes: [
      ["inside", "i"],
      ["middle", "m"],
      ["neutral", "n"],
    ],
  },
  returnResult: {
    key: "rr",
    codes: [
      ["winner", "w"],
      ["error", "e"],
      ["in-play", "ip"],
    ],
  },
  resultOutcome: {
    key: "xo",
    codes: [
      ["won", "w"],
      ["lost", "l"],
    ],
  },
  resultPlayer: { key: "xp", codes: PLAYER_CODES },
  resultShot: {
    key: "xs",
    codes: [
      ["Serve", "sv"],
      ["Return", "rt"],
      ["Forehand", "fh"],
      ["Backhand", "bh"],
      ["Volley", "vo"],
      ["Overhead", "oh"],
    ],
  },
  resultEnding: {
    key: "xe",
    codes: [
      ["winner", "wn"],
      ["error", "er"],
    ],
  },
  resultMissed: {
    key: "xm",
    codes: [
      ["Out", "o"],
      ["Net", "n"],
    ],
  },
  resultRallyLength: {
    key: "xr",
    codes: [
      ["short", "s"],
      ["medium", "m"],
      ["long", "l"],
    ],
  },
  customPlayer: { key: "cp", codes: PLAYER_CODES },
  customSide: { key: "cs", codes: SIDE_CODES },
  customDirection: {
    key: "cd",
    codes: [
      ["Crosscourt", "cc"],
      ["Down the Line", "dl"],
      ["Inside Out", "io"],
      ["Inside In", "ii"],
    ],
  },
  customRallyShot: {
    key: "cr",
    codes: RALLY_SHOT_NUMBERS.map((n) => [n, String(n)]),
  },
};

const MAX_INT_CODE = 99;

function valuesOf(f: MatchFilters, key: MatchFilterKey): readonly unknown[] {
  const v = f[key];
  if (Array.isArray(v)) return v;
  return v === null || v === undefined ? [] : [v];
}

export function serializeMatchFilters(f: MatchFilters): string {
  const groups: string[] = [];
  for (const key of MATCH_FILTER_KEYS) {
    const chosen = valuesOf(f, key);
    if (chosen.length === 0) continue;
    const { key: code, codes } = URL_CODEC[key];
    const tokens =
      codes === "int"
        ? [...new Set(chosen as number[])]
            .filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_INT_CODE)
            .sort((a, b) => a - b)
            .map(String)
        : (codes as readonly (readonly [unknown, string])[])
            .filter(([value]) => chosen.includes(value))
            .map(([, token]) => token);
    if (tokens.length > 0) groups.push([code, ...tokens].join("."));
  }
  return groups.join("_");
}

/**
 * The match report's URL parameter for the applied filters (`?f=`), absent
 * when nothing is filtered. Here, not in `provider.tsx`, because the Server
 * Component pages read it and a constant exported from a `"use client"`
 * module reaches the server as a client reference rather than a string.
 */
export const MATCH_FILTERS_PARAM = "f";

/**
 * A query string with `?f=` set to `filters`, or removed when they are empty.
 * Every other parameter is carried through; `current` is never mutated.
 */
export function matchFiltersQuery(
  current: URLSearchParams | string,
  filters: MatchFilters,
): string {
  const next = new URLSearchParams(current.toString());
  const value = serializeMatchFilters(filters);
  if (value) next.set(MATCH_FILTERS_PARAM, value);
  else next.delete(MATCH_FILTERS_PARAM);
  return next.toString();
}

const KEY_BY_CODE = new Map<string, MatchFilterKey>(
  MATCH_FILTER_KEYS.map((key) => [URL_CODEC[key].key, key]),
);

/**
 * Tokens an older link may still carry, and the group they now belong to.
 * Winner/Error lived under Result › Outcome (`xo.wn`, `xo.er`) until Ending
 * became its own group; those tokens move there. Won/Lost (`xo.w`, `xo.l`)
 * are NOT remapped: they now read from your side, where an older link with
 * a Result player read from that player's — an accepted break, since the
 * filter model shipped days before this change. Read only —
 * `serializeMatchFilters` writes the current form.
 */
const LEGACY_TOKENS: Readonly<
  Record<string, Readonly<Record<string, [MatchFilterKey, unknown]>>>
> = {
  xo: { wn: ["resultEnding", "winner"], er: ["resultEnding", "error"] },
};

/**
 * The filters in a serialized string. Tolerant: unknown keys, unknown option
 * codes and malformed groups are dropped, a single-choice group keeps its
 * first valid option, and anything unparsable is EMPTY. Never throws.
 */
export function parseMatchFilters(input: unknown): MatchFilters {
  if (typeof input !== "string" || input.length === 0) {
    return EMPTY_MATCH_FILTERS;
  }
  const out: Record<string, unknown> = { ...EMPTY_MATCH_FILTERS };
  for (const group of input.split("_")) {
    const [code, ...tokens] = group.split(".");
    const key = KEY_BY_CODE.get(code ?? "");
    if (!key) continue;
    const { codes } = URL_CODEC[key];
    const values: unknown[] = [];
    for (const token of tokens) {
      let value: unknown = undefined;
      if (codes === "int") {
        if (/^[1-9][0-9]?$/.test(token)) value = Number(token);
      } else {
        value = (codes as readonly (readonly [unknown, string])[]).find(
          ([, t]) => t === token,
        )?.[0];
      }
      if (value === undefined) {
        const moved = LEGACY_TOKENS[code ?? ""]?.[token];
        if (moved) {
          const [toKey, toValue] = moved;
          const held = out[toKey] as readonly unknown[];
          if (!held.includes(toValue)) out[toKey] = [...held, toValue];
        }
        continue;
      }
      if (!values.includes(value)) values.push(value);
    }
    if (values.length === 0) continue;
    if (isSingleKey(key)) {
      out[key] = values[0];
      continue;
    }
    // Merge, never overwrite: a legacy token may already have moved a value
    // into this key from an earlier group (`xo.wn_xe.er` must keep both).
    const held = out[key] as readonly unknown[];
    out[key] = [...held, ...values.filter((v) => !held.includes(v))];
  }
  return out as unknown as MatchFilters;
}
