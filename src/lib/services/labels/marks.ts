/**
 * The marks the black rail draws on a label row: what the derivation questioned
 * on the point the row came from, joined to the label tables through the vendor
 * ids each row froze.
 *
 * Pure. Built from a transcript made from the raw vendor file with the CURRENT
 * derivation code (`buildTranscriptForJob`), never from a stored flags column:
 * a mark says what the derivation thinks now, which is what the labeller is
 * compared against. Plain data (no Map, Set or class) so it crosses the RSC
 * boundary.
 *
 * `serve_fault` and `pick_winner` exist only here. "Wrong side for the score"
 * and "Same side twice" describe the vendor's score, which the labeller is
 * correcting, so they are raised live from `serveSides` against the labelled
 * score (score-marks.ts, with "Ending can't be read"); "Point ended here",
 * "Ending looks stale", "Second serve?", "No landing on the last shot" and
 * "Serve after a serve in play" are read off the labelled rows themselves
 * (marks-state.ts).
 *
 * Every code has a tier, decided once in `LABEL_MARK_META`: `count` (amber
 * chip, counted in the header), `hint` (one quiet line in the open point),
 * `hidden` (omitted unless `hidden: true`, which only the scorecard asks for).
 */

import {
  lastStrokeWinner,
  POINT_FLAGS,
  serveCourtSide,
  SHOT_FLAGS,
  type DerivedPoint,
  type DerivedShot,
  type SplitStepRally,
  type SplitStepStroke,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import {
  CONFIDENT_OUT_CALL,
  MAX_DEAD_TAIL,
  SIDE_DEAD_ZONE_M,
} from "@/lib/services/splitstep/derivation/flags";
import {
  labelSideOf,
  opponent,
  type LabelEnding,
  type LabelPoint,
  type LabelServeSide,
  type LabelShot,
  type LabelSide,
} from "./session";

/** How loudly a mark is drawn (see the file comment). */
export type LabelMarkTier = "count" | "hint" | "hidden";
export type LabelMarkScope = "point" | "shot";

/** Labels-only flags, computed from the rally rather than read off a row. */
export const LABEL_ONLY_FLAGS = {
  /** One serve, called out, one or two strokes after it: a fault played on? */
  SERVE_FAULT: "serve_fault",
  /** The fold never settled who won; the seed left `winner` null. */
  PICK_WINNER: "pick_winner",
  /** A stroke lands out or in the net and one or more strokes follow it. */
  SHOT_AFTER_POINT_END: "shot_after_point_end",
  /** The stored ending is not what the point's strokes now derive. */
  ENDING_STALE: "ending_stale",
  /** A first serve that follows a faulted serve of the same point. */
  SECOND_SERVE_AS_FIRST: "second_serve_as_first",
  /** The point's last stroke has no landing, and it is not marked unclear. */
  LAST_LANDING_MISSING: "last_landing_missing",
  /** The point's last stroke has neither a landing nor a result. */
  LAST_SHOT_UNRESOLVED: "last_shot_unresolved",
  /** A serve right after a serve that was in: a played let, or two points. */
  SERVE_AFTER_SERVE_IN: "serve_after_serve_in",
} as const;

/**
 * Every code that becomes a mark, with its tier and where it sits: the one
 * place a tier is decided. A code in a transcript's `flags[]` that is not a key
 * here produces nothing.
 *
 * `net_hit_contradicts_height` is a `hint` only on the point's last stroke and
 * `hidden` before it (`netHitTier`). `phantom_strokes_dropped` is hidden as a
 * chip only: the struck-through removed stroke is still drawn.
 * `same_player_consecutive` is counted AND keeps its missing-stroke slot; the
 * slot's "Dismiss" settles the chip (marks-state.ts `markState`).
 *
 * Retiered 2026-10-09 on the three fully checked sessions (259 points; base
 * rates: winner changed 19%, ending 32%, anything 53%): `winner_guessed` is
 * counted — the guess was wrong on 7 of 14, and a winner moves the score —
 * while `score_frozen`, on the same points, stays hidden so a frozen stretch
 * carries one chip, not two. `serve_fault` is hidden: 7 of 15 changed, under
 * the base rate.
 */
export const LABEL_MARK_META = {
  [POINT_FLAGS.WINNER_DISPUTED]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.PICK_WINNER]: { tier: "count", scope: "point" },
  [POINT_FLAGS.RESERVE_AFTER_IN]: { tier: "count", scope: "point" },
  [POINT_FLAGS.TIEBREAK_SCORE_OFF_SIX_ALL]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SCORE_SIDE_MISMATCH]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SERVICE_COURT_REPEAT]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SAME_PLAYER_CONSECUTIVE]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.LAST_SHOT_UNRESOLVED]: { tier: "count", scope: "point" },
  [POINT_FLAGS.WINNER_GUESSED]: { tier: "count", scope: "point" },
  [POINT_FLAGS.ENDING_SUSPECT_LINE]: { tier: "hint", scope: "point" },
  [POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.SHOT_AFTER_POINT_END]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.ENDING_STALE]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.SECOND_SERVE_AS_FIRST]: { tier: "hint", scope: "shot" },
  [LABEL_ONLY_FLAGS.LAST_LANDING_MISSING]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.SERVE_AFTER_SERVE_IN]: { tier: "hint", scope: "shot" },
  [POINT_FLAGS.SECOND_SERVE_CALLED_OUT]: { tier: "hint", scope: "point" },
  [POINT_FLAGS.RESULT_TYPE_UNKNOWN]: { tier: "hint", scope: "point" },
  [SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT]: { tier: "hint", scope: "shot" },
  [POINT_FLAGS.PHANTOM_STROKES_DROPPED]: { tier: "hidden", scope: "point" },
  [LABEL_ONLY_FLAGS.SERVE_FAULT]: { tier: "hidden", scope: "point" },
  [POINT_FLAGS.SCORE_FROZEN]: { tier: "hidden", scope: "point" },
  [SHOT_FLAGS.OUT_BALL_RALLY_CONTINUED]: { tier: "hidden", scope: "shot" },
  [SHOT_FLAGS.GEOMETRY_DISCARDED]: { tier: "hidden", scope: "shot" },
} as const satisfies Record<
  string,
  { tier: LabelMarkTier; scope: LabelMarkScope }
>;

export type LabelMarkCode = keyof typeof LABEL_MARK_META;

export function isLabelMarkCode(value: string): value is LabelMarkCode {
  return Object.prototype.hasOwnProperty.call(LABEL_MARK_META, value);
}

type NoParams = Record<string, never>;

/** What each mark carries for its hover line. Sides, never names. */
export interface LabelMarkParams {
  winner_disputed: { scoreWinner: LabelSide; lastStrokeWinner: LabelSide };
  winner_to_error_by_bounce: { loser: LabelSide };
  ending_suspect_line: NoParams;
  second_serve_called_out: NoParams;
  same_player_consecutive: { hitter: LabelSide };
  reserve_after_in: NoParams;
  service_court_repeat: { side: LabelServeSide | null };
  score_side_mismatch: {
    /** The score before the point, server-first (score.ts `scoreBefore`). */
    score: string | null;
    expected: LabelServeSide | null;
    actual: LabelServeSide | null;
  };
  tiebreak_score_off_six_all: NoParams;
  result_type_unknown: NoParams;
  serve_fault: NoParams;
  shot_after_point_end: {
    /** The last live stroke that lands out or in the net. */
    shotId: string;
    /** The live strokes after it, in video order — "Split here" starts at the first. */
    after: string[];
  };
  pick_winner: NoParams;
  /** What the strokes derive (ending-derived.ts) — the "Use it" patch. */
  ending_stale: {
    ending: LabelEnding;
    endedBy: LabelSide | null;
    /** Who the rows say won; null when they do not settle it. */
    winner: LabelSide | null;
  };
  /** The serve typed as a first serve that follows a faulted one. */
  second_serve_as_first: { shotId: string };
  last_landing_missing: NoParams;
  last_shot_unresolved: NoParams;
  /** The serve that follows a serve in play — where "Split here" cuts. */
  serve_after_serve_in: { shotId: string };
  net_hit_contradicts_height: NoParams;
  phantom_strokes_dropped: {
    /** The rally's strokes the transcript has no shot for. */
    eventIds: number[];
    hitter: LabelSide;
  };
  winner_guessed: NoParams;
  score_frozen: NoParams;
  out_ball_rally_continued: { nextHitter: LabelSide | null };
  geometry_discarded: NoParams;
}

/** One mark. `scope` and `tier` follow from `code` (see `netHitTier`). */
export type LabelMark = {
  [C in LabelMarkCode]: {
    code: C;
    tier: LabelMarkTier;
    scope: (typeof LABEL_MARK_META)[C]["scope"];
    params: LabelMarkParams[C];
  };
}[LabelMarkCode];

export type LabelSuggestion =
  | {
      kind: "missing_shot";
      key: `missing_shot:${number}`;
      pointId: string;
      /** The label shot the missing one would follow (the pair's first). */
      afterShotId: string;
      /** The side that did not get a stroke between the pair's two. */
      hitter: LabelSide;
      /** Midpoint of the pair's times; one of them when the other is missing. */
      videoTime: number | null;
    }
  | {
      kind: "missing_point";
      key: "missing_point";
      /** The flagged point — the second of the two served from one side. */
      pointId: string;
      /** The previous point of the same game, where the slot opens. */
      beforePointId: string;
      side: LabelServeSide;
      /** The two points as the rail numbers them (position in `points` + 1). */
      pointNumbers: [number, number];
      /**
       * Set when the EARLIER point reads as a replayed serve rather than a
       * point (`replayedServeGap`): the seconds between its last stroke and
       * the flagged point's serve. The pair is then one point, to combine.
       */
      replayGap?: number;
    };

export interface LabelMarks {
  /** Label point id → its marks, in the derivation's flag order. */
  points: Record<string, LabelMark[]>;
  /** Label shot id → its marks. */
  shots: Record<string, LabelMark[]>;
  suggestions: LabelSuggestion[];
  /** Label point id → the side its opening serve was hit from, when known. */
  serveSides: Record<string, LabelServeSide>;
}

/** What `buildLabelMarks` reads off a session's rows. */
export type MarkablePoint = Pick<LabelPoint, "id" | "vendorRallyIds"> & {
  shots: Pick<LabelShot, "id" | "eventId">[];
};

const SERVE_SHOT_TYPES = new Set(["First Serve", "Second Serve"]);
const isServeShot = (shot: Pick<DerivedShot, "shot_type">) =>
  shot.shot_type !== null && SERVE_SHOT_TYPES.has(shot.shot_type);

// A dead tail — strokes after a ball called out, at most this many — is
// flags.ts's `MAX_DEAD_TAIL` for `serve_fault` and `withoutDeadTail` alike,
// and a server within `SIDE_DEAD_ZONE_M` of the centre mark says nothing
// reliable about the side: the cut flags.ts's own `score_side_mismatch`
// makes. Both are imported so they cannot drift.

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
  tier: LabelMarkTier = LABEL_MARK_META[code].tier,
): LabelMark {
  return {
    code,
    tier,
    scope: LABEL_MARK_META[code].scope,
    params,
  } as LabelMark;
}

/**
 * "Net or out?" bears on how the point ended only on its last stroke; on a
 * stroke the rally went on from, it is the vendor's height disagreeing with
 * itself about a ball that was plainly played.
 */
export function netHitTier(isLastStroke: boolean): LabelMarkTier {
  return isLastStroke
    ? LABEL_MARK_META[SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT].tier
    : "hidden";
}

/**
 * A rally's vendor labels as sides, read through the transcript's own shots
 * (`is_player1` by `event_id`), not by comparing labels to `player1Label`: a
 * frozen stretch relabels its strokes (frozen.ts `withServer`), so labels can
 * disagree while the event id never does. A label no kept stroke carries is the
 * other side of one that is; a rally with no kept stroke falls back to the
 * label.
 */
function labelSides(
  rally: SplitStepRally,
  shotByEvent: Map<number, DerivedShot>,
  player1Label: string | null,
): (label: string) => LabelSide {
  const known = new Map<string, LabelSide>();
  for (const stroke of rally.strokes) {
    const shot = shotByEvent.get(stroke.eventId);
    if (shot && !known.has(stroke.playerLabel)) {
      known.set(stroke.playerLabel, labelSideOf(shot.is_player1));
    }
  }
  return (label) => {
    const direct = known.get(label);
    if (direct) return direct;
    for (const [other, s] of known) {
      if (other !== label) return opponent(s);
    }
    return label === player1Label ? "p1" : "p2";
  };
}

/** One transcript point's marks, in flag order; labels-only ones last. */
function pointMarks(
  point: DerivedPoint,
  rally: SplitStepRally | undefined,
  settledWinner: string | null | undefined,
  sideOf: (label: string) => LabelSide,
): LabelMark[] {
  const marks: LabelMark[] = [];
  const winner: LabelSide | null =
    settledWinner === null || settledWinner === undefined
      ? null
      : labelSideOf(point.won_by_player1);

  for (const code of point.flags) {
    if (!isLabelMarkCode(code)) continue;
    switch (code) {
      case POINT_FLAGS.WINNER_DISPUTED: {
        const byFlag = rally ? lastStrokeWinner(rally) : null;
        if (!winner || !byFlag) break;
        marks.push(
          mark(code, { scoreWinner: winner, lastStrokeWinner: sideOf(byFlag) }),
        );
        break;
      }
      case POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE: {
        if (!winner) break;
        marks.push(mark(code, { loser: opponent(winner) }));
        break;
      }
      case POINT_FLAGS.SAME_PLAYER_CONSECUTIVE: {
        const pair = samePlayerPairs(point.shots)[0];
        if (!pair) break;
        marks.push(mark(code, { hitter: labelSideOf(pair[0].is_player1) }));
        break;
      }
      case POINT_FLAGS.PHANTOM_STROKES_DROPPED: {
        if (!rally) break;
        const kept = new Set(point.shots.map((s) => s.event_id));
        const phantoms = rally.strokes.filter((s) => !kept.has(s.eventId));
        if (phantoms.length === 0) break;
        marks.push(
          mark(code, {
            eventIds: phantoms.map((s) => s.eventId),
            hitter: sideOf(phantoms[0].playerLabel),
          }),
        );
        break;
      }
      case POINT_FLAGS.ENDING_SUSPECT_LINE:
      case POINT_FLAGS.SECOND_SERVE_CALLED_OUT:
      case POINT_FLAGS.RESERVE_AFTER_IN:
      case POINT_FLAGS.TIEBREAK_SCORE_OFF_SIX_ALL:
      case POINT_FLAGS.RESULT_TYPE_UNKNOWN:
      case POINT_FLAGS.WINNER_GUESSED:
      case POINT_FLAGS.SCORE_FROZEN:
        marks.push(mark(code, {}));
        break;
      default:
        // A shot-scoped or labels-only code in a point's flags is not a mark
        // on the point — nor are the two score flags, which the console
        // raises from `serveSides` against the labelled score instead.
        break;
    }
  }

  // The derivation reads the last stroke's winner off the rally as the vendor
  // segmented it, so a swing at a dead ball at the end hides a flip. With the
  // tail dropped the same rule disagrees with the score: the same mark.
  if (rally && winner && !point.flags.includes(POINT_FLAGS.WINNER_DISPUTED)) {
    const trimmed = withoutDeadTail(rally);
    const byFlag = trimmed ? lastStrokeWinner(trimmed) : null;
    if (byFlag && sideOf(byFlag) !== winner) {
      marks.push(
        mark(POINT_FLAGS.WINNER_DISPUTED, {
          scoreWinner: winner,
          lastStrokeWinner: sideOf(byFlag),
        }),
      );
    }
  }
  if (rally && isServeFault(rally)) {
    marks.push(mark(LABEL_ONLY_FLAGS.SERVE_FAULT, {}));
  }
  if (settledWinner === null) {
    marks.push(mark(LABEL_ONLY_FLAGS.PICK_WINNER, {}));
  }

  return marks;
}

/** One derived shot's marks. `shots` are the point's kept strokes. */
function shotMarks(shots: DerivedShot[], index: number): LabelMark[] {
  const shot = shots[index];
  const marks: LabelMark[] = [];
  for (const code of shot.flags) {
    if (!isLabelMarkCode(code)) continue;
    switch (code) {
      case SHOT_FLAGS.OUT_BALL_RALLY_CONTINUED: {
        const next = shots[index + 1];
        marks.push(
          mark(code, {
            nextHitter: next ? labelSideOf(next.is_player1) : null,
          }),
        );
        break;
      }
      case SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT:
        marks.push(mark(code, {}, netHitTier(index === shots.length - 1)));
        break;
      case SHOT_FLAGS.GEOMETRY_DISCARDED:
        marks.push(mark(code, {}));
        break;
      default:
        break;
    }
  }
  return marks;
}

/** Consecutive kept shots by one player, two serves excepted. */
function samePlayerPairs(
  shots: readonly DerivedShot[],
): Array<[DerivedShot, DerivedShot]> {
  const pairs: Array<[DerivedShot, DerivedShot]> = [];
  for (let i = 0; i < shots.length - 1; i += 1) {
    const a = shots[i];
    const b = shots[i + 1];
    if (a.is_player1 !== b.is_player1) continue;
    if (isServeShot(a) && isServeShot(b)) continue;
    pairs.push([a, b]);
  }
  return pairs;
}

/** The side the rally's opening serve was hit from, or null when unknown. */
function openingServeSide(
  rally: SplitStepRally | undefined,
): LabelServeSide | null {
  const serve = rally?.serves[0];
  if (!serve) return null;
  if (Math.abs(serve.playerX ?? 0) < SIDE_DEAD_ZONE_M) return null;
  return serveCourtSide(serve.playerX, serve.playerY);
}

/**
 * One serve, called out by the vendor, and one or two strokes after it: the
 * returner may have played a fault. Three or more and the rally was plainly
 * played — the same cut `second_serve_called_out` makes (flags.ts
 * `MAX_DEAD_TAIL`). A second serve means the first was a fault by structure
 * and is not this flag's business.
 */
export function isServeFault(rally: SplitStepRally): boolean {
  if (rally.serves.length !== 1) return false;
  const serve = rally.serves[0];
  if (serve.in) return false;
  const serveIndex = rally.strokes.indexOf(serve);
  const tail = rally.strokes.length - serveIndex - 1;
  return tail >= 1 && tail <= MAX_DEAD_TAIL;
}

/**
 * The rally cut after its last non-serve stroke the vendor called out, when
 * one to `MAX_DEAD_TAIL` strokes follow it and none of them is a serve: the
 * ball was dead, so what came after was a swing at it. Null when the rally has
 * no such tail — the out ball is its last stroke, the tail is long enough to
 * be a rally, or a serve in it says a new point started (`reserve_after_in`'s
 * business).
 *
 * When the out ball IS the last stroke, the swing at the dead ball may itself
 * have been called out: the cut then falls after an earlier out call, but only
 * a confident one (`CONFIDENT_OUT_CALL`). On the three fully checked sessions
 * (2026-10-09) that shape changed the winner on 7 of 13 points, against a base
 * rate of 19%; with the earlier call under 0.85 it was 3 of 29, so those stay
 * uncut.
 */
export function withoutDeadTail(rally: SplitStepRally): SplitStepRally | null {
  const { strokes } = rally;
  const isOutBall = (s: SplitStepStroke) => s.strokeType !== "serve" && !s.in;
  let last = strokes.findLastIndex(isOutBall);
  if (last === -1) return null;
  if (last === strokes.length - 1) {
    last = strokes
      .slice(0, -1)
      .findLastIndex(
        (s) => isOutBall(s) && (s.lineConfidence ?? 0) >= CONFIDENT_OUT_CALL,
      );
    if (last === -1) return null;
  }
  const tail = strokes.slice(last + 1);
  if (tail.length === 0 || tail.length > MAX_DEAD_TAIL) return null;
  if (tail.some((s) => s.strokeType === "serve")) return null;
  const kept = strokes.slice(0, last + 1);
  return {
    ...rally,
    strokes: kept,
    serves: rally.serves.filter((s) => kept.includes(s)),
  };
}

function midpoint(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

/**
 * Build the marks for one session.
 *
 * `points` is the session's rows in `point_index` order, tombstones included. A
 * transcript point lands on the label point whose `vendorRallyIds` holds its
 * `rally_id`; a shot flag on the label shot whose `eventId` is the derived
 * shot's `event_id`. A flag whose rally or event has no label row is dropped.
 * `serveSides` is read off the first transcript point that lands on each label
 * point.
 *
 * `hidden: true` keeps the hidden marks, for the scorecard only.
 */
export function buildLabelMarks(
  transcript: Transcript,
  rallies: readonly SplitStepRally[],
  points: readonly MarkablePoint[],
  { hidden = false }: { hidden?: boolean } = {},
): LabelMarks {
  const pointIdByRally = new Map<number, string>();
  const shotIdByEvent = new Map<number, string>();
  points.forEach((point) => {
    for (const rallyId of point.vendorRallyIds) {
      if (!pointIdByRally.has(rallyId)) pointIdByRally.set(rallyId, point.id);
    }
    for (const shot of point.shots) {
      if (shot.eventId !== null && !shotIdByEvent.has(shot.eventId)) {
        shotIdByEvent.set(shot.eventId, shot.id);
      }
    }
  });

  const rallyById = new Map(rallies.map((r) => [r.rallyId, r]));
  const settledById = new Map(
    transcript.reconciliation.settledWinners.map((w) => [w.rallyId, w.winner]),
  );
  const shotByEvent = new Map<number, DerivedShot>();
  for (const point of transcript.points) {
    for (const shot of point.shots) shotByEvent.set(shot.event_id, shot);
  }
  const player1Label = transcript.reconciliation.player1Label;

  const marks: LabelMarks = {
    points: {},
    shots: {},
    suggestions: [],
    serveSides: {},
  };
  const push = (
    into: Record<string, LabelMark[]>,
    id: string,
    list: LabelMark[],
  ) => {
    const kept = hidden ? list : list.filter((m) => m.tier !== "hidden");
    if (kept.length === 0) return;
    (into[id] ??= []).push(...kept);
  };

  for (const point of transcript.points) {
    const pointId = pointIdByRally.get(point.rally_id);
    if (pointId === undefined) continue;

    const rally = rallyById.get(point.rally_id);
    const serveSide = openingServeSide(rally);
    if (serveSide && !(pointId in marks.serveSides)) {
      marks.serveSides[pointId] = serveSide;
    }
    const sideOf = labelSides(
      rally ?? { rallyId: point.rally_id, strokes: [], server: "", serves: [] },
      shotByEvent,
      player1Label,
    );

    push(
      marks.points,
      pointId,
      pointMarks(point, rally, settledById.get(point.rally_id), sideOf),
    );

    point.shots.forEach((shot, index) => {
      const shotId = shotIdByEvent.get(shot.event_id);
      if (shotId === undefined) return;
      push(marks.shots, shotId, shotMarks(point.shots, index));
    });

    if (point.flags.includes(POINT_FLAGS.SAME_PLAYER_CONSECUTIVE)) {
      for (const [a, b] of samePlayerPairs(point.shots)) {
        const afterShotId = shotIdByEvent.get(a.event_id);
        if (afterShotId === undefined) continue;
        marks.suggestions.push({
          kind: "missing_shot",
          key: `missing_shot:${a.event_id}`,
          pointId,
          afterShotId,
          hitter: opponent(labelSideOf(a.is_player1)),
          videoTime: midpoint(a.video_time, b.video_time),
        });
      }
    }
  }

  return marks;
}
