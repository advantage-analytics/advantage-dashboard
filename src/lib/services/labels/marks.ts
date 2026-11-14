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
 * "Different ending?", "Second serve?", "No landing on the last shot" and
 * "Serve after a serve in play" are read off the labelled rows themselves
 * (marks-state.ts).
 *
 * Every code has a tier, decided once in `LABEL_MARK_META`: `count` (amber
 * chip, counted in the header), `hint` (one quiet line in the open point),
 * `hidden` (omitted unless `hidden: true`, which only the scorecard asks for).
 */

import { proposedTiebreakRallies, seededOnProposal } from "./seed-proposal";
import {
  lastStrokeWinner,
  POINT_FLAGS,
  serveCourtSide,
  SHOT_FLAGS,
  proposedPointsOf,
  stalledScoreStream,
  type DerivedPoint,
  type DerivedShot,
  type ProposedPoint,
  type ScoreStreamStall,
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

/**
 * "Game cut differs" on more than this share of the match's points, and on at
 * least `SEGMENT_SYSTEMIC_MIN` of them, is most likely the entered score being
 * wrong rather than those points. Its marks are kept — the labeller fixed 89%
 * of such points on the 19 complete sessions (2026-11-05) — but carry
 * `systemic`, so they draw grey rather than flooding the match amber
 * (marks-state.ts `reviewItemTone`).
 */
export const SEGMENT_SYSTEMIC_SHARE = 1 / 3;
export const SEGMENT_SYSTEMIC_MIN = 10;

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
  /** The stored ending cannot be true of the winner, and the strokes agree with it. */
  ENDING_CONTRADICTS_WINNER: "ending_contradicts_winner",
  /** A first serve that follows a faulted serve of the same point. */
  SECOND_SERVE_AS_FIRST: "second_serve_as_first",
  /** The point's last stroke has no landing, and it is not marked unclear. */
  LAST_LANDING_MISSING: "last_landing_missing",
  /** The point's last stroke has neither a landing nor a result. */
  LAST_SHOT_UNRESOLVED: "last_shot_unresolved",
  /** A serve stored in whose landing sits outside the service box. */
  SERVE_IN_LANDING_OUT: "serve_in_landing_out",
  /** The point's last stroke is a first serve that missed: no second serve. */
  FIRST_SERVE_FAULT_ALONE: "first_serve_fault_alone",
  /** A serve right after a serve that was in: a played let, or two points. */
  SERVE_AFTER_SERVE_IN: "serve_after_serve_in",
  /** Two serves by one player from different sides of the centre mark. */
  SERVES_FROM_BOTH_SIDES: "serves_from_both_sides",
  /** A stroke typed as a serve whose hitter is not the point's server. */
  SERVE_BY_RECEIVER: "serve_by_receiver",
  /** One of a point's first four or last two strokes lacks its coordinates. */
  PLACEMENT_MISSING: "placement_missing",
  /**
   * The point's last stroke is seeded off its landing against the vendor's own
   * call on it — In where the vendor said out or net, or Out or Net where it
   * said in: the call that decides the point was overruled by geometry alone.
   */
  LAST_CALL_OVERRULED: "last_call_overruled",
  /**
   * The point's last stroke has no ball off it at all: the November 2026
   * ball model neither fitted nor detected one (`ballUntracked`). Older files
   * never say, so it never fires on them.
   */
  LAST_SHOT_UNTRACKED: "last_shot_untracked",
  /**
   * A point of a locked game that does not add up (game-boundary.ts
   * `lockedGameNeeds`) whose last ball, called the other way, would hand the
   * point to the side the game needs: "Was the last ball out?" after a
   * boundary drag. Read off the live rows, never the vendor's file.
   */
  LAST_BALL_AGAINST_GAME: "last_ball_against_game",
} as const;

/**
 * Every code that becomes a mark, with its tier and where it sits: the one
 * place a tier is decided. A code in a transcript's `flags[]` that is not a key
 * here produces nothing.
 *
 * `net_hit_contradicts_height` takes its tier here only on the point's last
 * stroke and is `hidden` before it (`netHitTier`). `phantom_strokes_dropped` is hidden as a
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
 *
 * Retiered 2026-10-10 on Emon van Loben Sels v Eli Stephenson (188 points):
 * `segment_proposal_differs` is counted — 24 of its 28 points changed, most of
 * them the set-2 tiebreak the vendor had cut into games, and none of those
 * carried a chip before. `last_call_overruled` is new and counted: across the
 * checked points of every session, a last rally stroke seeded In that the
 * vendor called in the net was labelled out or net 25 times in 33, one it
 * called out 31 in 51, and a last serve it called out 5 in 5; the other
 * way round, a last stroke seeded Out that the vendor called in was labelled
 * in 8 times in 11.
 *
 * Retiered 2026-10-12 on Michela Moore v Emily Baek (137 points):
 * `second_serve_called_out` is counted — 5 of its 6 points changed, and two
 * of the three points changed with no chip at all were double faults that
 * carried only this hint. `segment_proposal_differs` stays counted, but not
 * when it is on most of the match: there it fired on 122 points because the
 * entered score was wrong (6–4 for a 6–0). (Undone 2026-11-05, below.)
 *
 * Retiered 2026-11-05 on the 19 complete analyst sessions (2,372 points;
 * "fixed" = winner, ending, server or game changed, or the point deleted or
 * combined; base 53%, winner changed 29%):
 * - `result_type_unknown` is counted: 87% fixed, the winner moved on 57% —
 *   the highest of any mark. It sits on "Check the ending" 89% of the time,
 *   so it adds few amber points; it is already the same item-4 question.
 * - The match-wide "Game cut differs" is no longer hidden: those points were
 *   fixed 89% of the time, 44 of them with no other visible mark. It is
 *   marked `systemic` and drawn grey instead (`SEGMENT_SYSTEMIC_SHARE`).
 * - `reserve_after_in` is a hint: 57% fixed, 22% winner — the base rate.
 * - `net_hit_contradicts_height` is hidden on every stroke: 51% fixed.
 * - `winner_to_error_by_bounce` is hidden: it never fired without
 *   `ending_suspect_line` and caught no fix that mark did not.
 *
 * 2026-11-06, on the 11 labelled matches reprocessed with the vendor's new
 * ball model (1,147 points, each pre-filled from the new file with current
 * code and compared with its final labels; base: fixed 56%, winner changed
 * 26%): `last_shot_untracked` is new and counted. It fired on 49 points; 92%
 * were fixed and the winner moved on 47%. A serve the point ends on is never
 * asked (deleting it is no fix). 22 of the 49 are on one match (5dbf53c4); on
 * the other ten it fired 27 times, 25 fixed, the winner moved on 7 — the
 * base rate, so outside that match it is mostly a stroke to delete. It cannot
 * fire on an old-model file: 0 fires over the 21 old-model sessions.
 * Measured on the same data and left as they are: `serve_fault` (63% fixed on
 * the new file, 59% on the 21 old-model sessions, against 56% / 55% — barely
 * above base) and `ending_suspect_line` (80% / 73%, above base).
 *
 * 2026-11-11: `last_shot_untracked` also fires where the last rally ball's
 * flight could not be fitted but a bounce was found (`ballFitPoor`). On the
 * 17 finished sessions whose match was re-run on the new ball model, the
 * pre-fill's last rally ball was the labelled point's last stroke on 78% of
 * 1,666 well-fitted balls, 60% of 325 poorly fitted ones (24% not a stroke of
 * the labelled point at all, 16% with the rally going on past it) and 15% of
 * 84 untracked ones. So it is asked, in the grey list, with its own words.
 *
 * 2026-11-13: the poorly fitted ball is no longer asked. On the checked
 * points of the nine analyst sessions that carry the fit columns, the
 * flagged stroke was kept as the point's last on 52 of 92 poorly fitted
 * balls (57%), deleted on 25 (27%) and played past on 15; an untracked one
 * was deleted on 13 of 19 (68%). Only the untracked ball asks "Extra shots?".
 *
 * 2026-11-11: `serve_by_receiver` is new and counted. Emon van Loben Sels v
 * Eli Stephenson point 120 published a receiver's overhead as the counted
 * serve (the vendor had cut the rally in two there and the points were
 * combined), which numbered the seven strokes before it 0. Nine live points
 * of four complete sessions had a serve by the non-server that day.
 *
 * 2026-11-06: `net_by_trajectory` is new and counted ("Into the net?"). It
 * only fires on a file from the November 2026 ball model, whose flights run
 * past the bounce (flags.ts). On 10 reprocessed matches it fired 17 times
 * and the pre-fill's last-ball result was wrong on 12 (71%; base 26%). It
 * sits beside "Was the last ball in?", which asks when the vendor's own call
 * disagrees; this one asks when the vendor and the landing both missed a net
 * ball the flight shows.
 */
export const LABEL_MARK_META = {
  [POINT_FLAGS.WINNER_DISPUTED]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.PICK_WINNER]: { tier: "count", scope: "point" },
  [POINT_FLAGS.RESERVE_AFTER_IN]: { tier: "hint", scope: "point" },
  [POINT_FLAGS.TIEBREAK_SCORE_OFF_SIX_ALL]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SCORE_SIDE_MISMATCH]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SERVICE_COURT_REPEAT]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SAME_PLAYER_CONSECUTIVE]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.LAST_SHOT_UNRESOLVED]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.FIRST_SERVE_FAULT_ALONE]: {
    tier: "count",
    scope: "point",
  },
  [LABEL_ONLY_FLAGS.SERVE_BY_RECEIVER]: { tier: "count", scope: "point" },
  [POINT_FLAGS.WINNER_GUESSED]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.LAST_CALL_OVERRULED]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.LAST_SHOT_UNTRACKED]: { tier: "count", scope: "point" },
  [LABEL_ONLY_FLAGS.LAST_BALL_AGAINST_GAME]: { tier: "hint", scope: "point" },
  [POINT_FLAGS.NET_BY_TRAJECTORY]: { tier: "count", scope: "point" },
  [POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS]: { tier: "count", scope: "point" },
  [POINT_FLAGS.ENDING_SUSPECT_LINE]: { tier: "hint", scope: "point" },
  [POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE]: { tier: "hidden", scope: "point" },
  [LABEL_ONLY_FLAGS.SHOT_AFTER_POINT_END]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.ENDING_STALE]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.ENDING_CONTRADICTS_WINNER]: {
    tier: "hint",
    scope: "point",
  },
  [LABEL_ONLY_FLAGS.SECOND_SERVE_AS_FIRST]: { tier: "hint", scope: "shot" },
  [LABEL_ONLY_FLAGS.LAST_LANDING_MISSING]: { tier: "hint", scope: "point" },
  [LABEL_ONLY_FLAGS.SERVE_AFTER_SERVE_IN]: { tier: "hint", scope: "shot" },
  [LABEL_ONLY_FLAGS.SERVES_FROM_BOTH_SIDES]: { tier: "hint", scope: "shot" },
  [LABEL_ONLY_FLAGS.SERVE_IN_LANDING_OUT]: { tier: "hint", scope: "shot" },
  [LABEL_ONLY_FLAGS.PLACEMENT_MISSING]: { tier: "hint", scope: "shot" },
  [POINT_FLAGS.SECOND_SERVE_CALLED_OUT]: { tier: "count", scope: "point" },
  [POINT_FLAGS.RESULT_TYPE_UNKNOWN]: { tier: "count", scope: "point" },
  [SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT]: { tier: "hidden", scope: "shot" },
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

/**
 * The `count` marks that are about the data, not the score: answering one
 * changes what is recorded of the point, rarely who won it. Their chip and
 * their number in the header are grey; amber is kept for a mark that can move
 * the score. Every `hint` is data too (`pointRowMarks` draws those as the
 * same grey chip on a closed row).
 *
 * Sorted 2026-10-12 on the four fully checked sessions: the labeller changed
 * the winner on 28% of "Missing shot?" points — the rate of any point, about
 * one in five — while changing something on all 40. Every other counted mark
 * moved the winner on a third to more than half of its points.
 *
 * 2026-11-05, on the 19 complete sessions: "Wrong side for the score" and
 * "Same side twice" join them. On the 78 points where they were the only
 * amber mark, the labeller changed the winner on 12. They stay counted, so
 * the point is still flagged and "Add point" still offered, but grey.
 */
export const DATA_MARK_CODES: ReadonlySet<LabelMarkCode> = new Set([
  POINT_FLAGS.SAME_PLAYER_CONSECUTIVE,
  POINT_FLAGS.SCORE_SIDE_MISMATCH,
  POINT_FLAGS.SERVICE_COURT_REPEAT,
]);

/** Whether a mark is about the data, not the score (`DATA_MARK_CODES`). */
export function isDataMark(mark: Pick<LabelMark, "code" | "tier">): boolean {
  return mark.tier !== "count" || DATA_MARK_CODES.has(mark.code);
}

export function isLabelMarkCode(value: string): value is LabelMarkCode {
  return Object.prototype.hasOwnProperty.call(LABEL_MARK_META, value);
}

type NoParams = Record<string, never>;

/** Which end of a stroke "Shot placement" is asking for. */
export type PlacementGap = "contact" | "landing" | "both";

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
  /**
   * What the vendor called the last ball, against the seed's reading, and
   * which stroke that ball was — the answer is written to that stroke only.
   */
  last_call_overruled: { vendorCall: "in" | "out" | "net"; eventId: number };
  /** The vendor stroke the point ends on, whose ball was not tracked. */
  last_shot_untracked: { eventId: number };
  /**
   * The last ball (`shotId`), the call that would hand the point to the side
   * its locked game needs (`gameWinner`), and that side.
   */
  last_ball_against_game: {
    shotId: string;
    call: "in" | "out";
    gameWinner: LabelSide;
  };
  /**
   * `by: "landing"` when the console raised it off the rows (marks-state.ts
   * `lastBallNearNet`): the last ball, called in, down within a metre of the
   * net. Absent on the derivation's own, read off the flight.
   */
  net_by_trajectory: { by?: "landing" };
  shot_after_point_end: {
    /** The last live stroke that lands out or in the net. */
    shotId: string;
    /** The live strokes after it, in video order — "Split here" starts at the first. */
    after: string[];
  };
  pick_winner: NoParams;
  /** What the strokes derive (ending-derived.ts) — the "Make it …" patch. */
  ending_stale: {
    ending: LabelEnding;
    endedBy: LabelSide | null;
    /** Who the rows say won; null when they do not settle it. */
    winner: LabelSide | null;
  };
  /** The point as stored, for the sentence: nothing here derives a fix. */
  ending_contradicts_winner: {
    ending: LabelEnding;
    endedBy: LabelSide | null;
    winner: LabelSide;
    server: LabelSide | null;
  };
  /** The serve typed as a first serve that follows a faulted one. */
  second_serve_as_first: { shotId: string };
  last_landing_missing: NoParams;
  last_shot_unresolved: NoParams;
  first_serve_fault_alone: NoParams;
  /** The serve, and what its landing reads as. */
  serve_in_landing_out: { shotId: string; landing: "out" | "net" };
  /** The serve that follows a serve in play — where "Split here" cuts. */
  serve_after_serve_in: { shotId: string };
  /** The later of the two serves: where the second point starts. */
  serves_from_both_sides: { shotId: string };
  /** The stroke typed as a serve, who hit it, and the point's server. */
  serve_by_receiver: { shotId: string; hitter: LabelSide; server: LabelSide };
  /** The stroke to place, and what the gap costs: see `markHover`. */
  placement_missing: {
    shotId: string;
    stroke: "serve" | "return" | "shot";
    missing: PlacementGap;
  };
  net_hit_contradicts_height: NoParams;
  phantom_strokes_dropped: {
    /** The rally's strokes the transcript has no shot for. */
    eventIds: number[];
    hitter: LabelSide;
  };
  winner_guessed: NoParams;
  score_frozen: NoParams;
  /**
   * The segmentation's proposal for the point (`transcript.segmentation`).
   * `proposedGame` is match-cumulative like `points.game_number`, not the
   * proposal's per-set number; `mergedWith` is the rally id of the neighbour
   * it would be merged with, when it would be. All null when the transcript
   * carries no proposal for the rally.
   */
  segment_proposal_differs: {
    proposedGame: number | null;
    proposedServer: LabelSide | null;
    mergedWith: number | null;
    /**
     * The mark is on most of the match (`SEGMENT_SYSTEMIC_SHARE`): the entered
     * score is the likelier mistake, so its item reads grey.
     */
    systemic: boolean;
  };
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
      /**
       * The pair's second label shot, when it has a row: a split that puts
       * the two in different points answers the suggestion
       * (`homeShotSuggestions`).
       */
      nextShotId?: string;
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
  /**
   * The vendor's score stream hardly moved over the match (frozen.ts
   * `stalledScoreStream`): its games, servers and winners were read from the
   * serve and the last shot instead. Absent when it followed the match.
   */
  scoreStalled?: ScoreStreamStall;
}

/** What `buildLabelMarks` reads off a session's rows. */
export type MarkablePoint = Pick<LabelPoint, "id" | "vendorRallyIds"> & {
  shots: Pick<LabelShot, "id" | "eventId">[];
  /**
   * The row's frozen seed, when the caller has it: a row seeded on the
   * segmenter's cut (seed-proposal.ts) carries no "Game cut differs".
   */
  seed?: Pick<
    NonNullable<LabelPoint["seed"]>,
    "set_number" | "game_number" | "server"
  > | null;
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
  proposed: ProposedPoint | null,
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
      case POINT_FLAGS.NET_BY_TRAJECTORY:
      case POINT_FLAGS.SECOND_SERVE_CALLED_OUT:
      case POINT_FLAGS.RESERVE_AFTER_IN:
      case POINT_FLAGS.TIEBREAK_SCORE_OFF_SIX_ALL:
      case POINT_FLAGS.RESULT_TYPE_UNKNOWN:
      case POINT_FLAGS.WINNER_GUESSED:
      case POINT_FLAGS.SCORE_FROZEN:
        marks.push(mark(code, {}));
        break;
      case POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS:
        marks.push(
          mark(code, {
            proposedGame: proposed?.game ?? null,
            proposedServer: proposed
              ? labelSideOf(proposed.server === "player1")
              : null,
            mergedWith: proposed?.mergedWith ?? null,
            // Settled once every point is read, below.
            systemic: false,
          }),
        );
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
  // The stroke that decides the point, seeded off its landing against the
  // vendor's own call: In where it said out or net, Out or Net where it said in.
  const last = point.shots.at(-1);
  const called = last
    ? rally?.strokes.find((stroke) => stroke.eventId === last.event_id)
    : undefined;
  // A serve is never asked: deleting the point's only serve is no fix. Nor
  // a ball seen bouncing but fitted poorly (`ballFitPoor`): that stroke is
  // the point's real last one more often than not.
  if (called?.ballUntracked && called.strokeType !== "serve") {
    marks.push(
      mark(LABEL_ONLY_FLAGS.LAST_SHOT_UNTRACKED, { eventId: called.eventId }),
    );
  }
  if (last && called) {
    const vendorCall = called.netHit ? "net" : called.in ? "in" : "out";
    const seededIn = last.result === "In";
    const seededMissed = last.result === "Out" || last.result === "Net";
    if (
      (seededIn && vendorCall !== "in") ||
      (seededMissed && vendorCall === "in")
    ) {
      marks.push(
        mark(LABEL_ONLY_FLAGS.LAST_CALL_OVERRULED, {
          vendorCall,
          eventId: last.event_id,
        }),
      );
    }
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

/**
 * Each `missing_shot` filed under the label point that holds its pair's first
 * stroke (`afterShotId`) in `points` — not the first point carrying the
 * rally, which after a split (point-split.ts) is the earlier half while the
 * stroke sits in the later one. A pair a split put in two points is dropped:
 * the second stroke opens a new point, so nothing is missing between them.
 * A suggestion whose stroke no row holds keeps its point. Other suggestions
 * pass through.
 *
 * Run on the server's marks and again on the console's live rows, whose
 * splits happen after the page built its marks.
 */
export function homeShotSuggestions(
  suggestions: readonly LabelSuggestion[],
  points: readonly { id: string; shots?: readonly { id: string }[] }[],
): LabelSuggestion[] {
  const pointOf = new Map<string, string>();
  for (const point of points) {
    for (const shot of point.shots ?? []) pointOf.set(shot.id, point.id);
  }
  return suggestions.flatMap((s): LabelSuggestion[] => {
    if (s.kind !== "missing_shot") return [s];
    const home = pointOf.get(s.afterShotId);
    if (home === undefined) return [s];
    const next = s.nextShotId ? pointOf.get(s.nextShotId) : undefined;
    if (next !== undefined && next !== home) return [];
    return home === s.pointId ? [s] : [{ ...s, pointId: home }];
  });
}

function midpoint(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

/**
 * The share of the rows a proposal places that must sit on its cut for the
 * session to read as seeded on it. A session seeded on the vendor's cut
 * agrees on far fewer; one seeded on the proposal misses only the rallies a
 * later proposal moved.
 */
const SEEDED_ON_PROPOSAL_SHARE = 0.9;

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
  const seedByPoint = new Map<string, MarkablePoint["seed"]>();
  points.forEach((point) => {
    seedByPoint.set(point.id, point.seed ?? null);
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
  const proposed = transcript.segmentation
    ? proposedPointsOf(
        transcript.segmentation,
        transcript.points.map((point) => point.rally_id),
      )
    : new Map<number, ProposedPoint>();

  const inProposedTiebreak = transcript.segmentation
    ? proposedTiebreakRallies(transcript.segmentation)
    : () => false;

  // Whether the session was seeded on the proposal's cut (seed-proposal.ts):
  // nearly every row the proposal places sits where it put it. Asked of the
  // session first — a session seeded on the vendor's cut keeps the flag on a
  // row that happens to agree — and then of each row, so a proposal that has
  // since moved a rally (a newer vendor file) flags that row alone.
  const rowOnProposal = new Set<string>();
  let placed = 0;
  for (const point of transcript.points) {
    const pointId = pointIdByRally.get(point.rally_id);
    const to = proposed.get(point.rally_id);
    if (pointId === undefined || !to) continue;
    placed += 1;
    if (
      seededOnProposal(
        seedByPoint.get(pointId) ?? null,
        to,
        inProposedTiebreak(point.rally_id),
      )
    ) {
      rowOnProposal.add(pointId);
    }
  }
  const sessionOnProposal =
    placed > 0 && rowOnProposal.size >= placed * SEEDED_ON_PROPOSAL_SHARE;

  const marks: LabelMarks = {
    points: {},
    shots: {},
    suggestions: [],
    serveSides: {},
  };
  // Set only on a stalled stream, so an ordinary match's marks are unchanged.
  const stall = stalledScoreStream(transcript.points);
  if (stall) marks.scoreStalled = stall;
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

    // A session seeded on the proposal's cut has nothing to differ from:
    // the flag was raised against the vendor's rows, which it never held.
    const to = proposed.get(point.rally_id) ?? null;
    const onProposal =
      sessionOnProposal &&
      rowOnProposal.has(pointId) &&
      to !== null &&
      // Half of a proposed merge is still two rows: that stays asked.
      to.mergedWith === null;
    push(
      marks.points,
      pointId,
      pointMarks(
        point,
        rally,
        settledById.get(point.rally_id),
        sideOf,
        to,
      ).filter(
        (m) => !onProposal || m.code !== POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS,
      ),
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
        const nextShotId = shotIdByEvent.get(b.event_id);
        marks.suggestions.push({
          kind: "missing_shot",
          key: `missing_shot:${a.event_id}`,
          pointId,
          afterShotId,
          nextShotId,
          hitter: opponent(labelSideOf(a.is_player1)),
          videoTime: midpoint(a.video_time, b.video_time),
        });
      }
    }
  }
  // A split point shares its rally with the point it came from, so the
  // rally's suggestions were filed under the earlier one: file each under
  // the point that holds its stroke now.
  marks.suggestions = homeShotSuggestions(marks.suggestions, points);

  // "Game cut differs" on most of the match is most likely the entered score
  // the re-cut was fitted to being wrong. The marks stay — those points were
  // still fixed most of the time — but say so, and read grey.
  const recut = Object.values(marks.points).filter((list) =>
    list.some((m) => m.code === POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS),
  ).length;
  if (
    recut >= SEGMENT_SYSTEMIC_MIN &&
    recut > transcript.points.length * SEGMENT_SYSTEMIC_SHARE
  ) {
    for (const [pointId, list] of Object.entries(marks.points)) {
      marks.points[pointId] = list.map((m) =>
        m.code === POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS
          ? { ...m, params: { ...m.params, systemic: true } }
          : m,
      );
    }
  }

  return marks;
}
