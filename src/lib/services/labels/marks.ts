/**
 * The marks the black rail draws beside a label row: what the derivation
 * flagged or fixed on the point the row came from, joined back onto the label
 * tables through the vendor ids each row froze.
 *
 * Pure. It reads a transcript built from the raw vendor file with the CURRENT
 * derivation code (`buildTranscriptForJob`) and the rallies it was built from,
 * never a stored `points.flags` / `shots.flags` column — a stored flag says
 * what the derivation thought when the rows were written, a mark says what it
 * thinks now, and the console compares the labeller against the latter. The
 * label tables carry no flags at all (session.ts).
 *
 * Two flags exist only here, computed from the rally and from nothing stored:
 * `serve_fault` (one serve, called out, a short tail — a possible fault the
 * returner hit back) and `pick_winner` (the fold never settled the winner,
 * which is exactly when the seed left `winner` null).
 *
 * Two of the derivation's flags are deliberately NOT marks here: "Wrong side
 * for the score" (`score_side_mismatch`) and "Same side twice"
 * (`service_court_repeat`) describe the VENDOR's score, which the labeller is
 * busy correcting. What this module hands over instead is the one fact only
 * the vendor file knows — `serveSides`, the side each point's opening serve
 * was actually hit from — and the console raises those two flags from it
 * against the LIVE labelled score (score-marks.ts), so a corrected winner or
 * an added point re-reads them at once.
 *
 * The result is plain data — records and arrays, no Map, Set or class —
 * because it is built in a Server Component and handed to the `"use client"`
 * console across the RSC boundary.
 *
 * Imports only the pure derivation modules and `labels/session`: nothing from
 * `next/`, `components/` or a server file may reach a module the client
 * bundle can import.
 */

import {
  lastStrokeWinner,
  POINT_FLAGS,
  serveCourtSide,
  SHOT_FLAGS,
  type DerivedPoint,
  type DerivedShot,
  type SplitStepRally,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import {
  MAX_DEAD_TAIL as SERVE_FAULT_MAX_TAIL,
  SIDE_DEAD_ZONE_M,
} from "@/lib/services/splitstep/derivation/flags";
import {
  opponent,
  type LabelPoint,
  type LabelServeSide,
  type LabelShot,
  type LabelSide,
} from "./session";

export type LabelMarkKind = "flag" | "fix";
export type LabelMarkScope = "point" | "shot";

/** Labels-only flags, computed from the rally rather than read off a row. */
export const LABEL_ONLY_FLAGS = {
  /** One serve, called out, one or two strokes after it: a fault played on? */
  SERVE_FAULT: "serve_fault",
  /** The fold never settled who won; the seed left `winner` null. */
  PICK_WINNER: "pick_winner",
} as const;

/**
 * Every code that becomes a mark, with what it is and where it sits. A code in
 * a transcript's `flags[]` that is not a key here produces nothing — the
 * withdrawn fixes, and anything the derivation adds later, stay invisible
 * until a row is written for them deliberately.
 */
export const LABEL_MARK_META = {
  [POINT_FLAGS.WINNER_DISPUTED]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.ENDING_SUSPECT_LINE]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.SECOND_SERVE_CALLED_OUT]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.SAME_PLAYER_CONSECUTIVE]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.RESERVE_AFTER_IN]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.SERVICE_COURT_REPEAT]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.SCORE_SIDE_MISMATCH]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.TIEBREAK_SCORE_OFF_SIX_ALL]: { kind: "flag", scope: "point" },
  [POINT_FLAGS.RESULT_TYPE_UNKNOWN]: { kind: "flag", scope: "point" },
  [LABEL_ONLY_FLAGS.SERVE_FAULT]: { kind: "flag", scope: "point" },
  [LABEL_ONLY_FLAGS.PICK_WINNER]: { kind: "flag", scope: "point" },
  [SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT]: { kind: "flag", scope: "shot" },
  [POINT_FLAGS.PHANTOM_STROKES_DROPPED]: { kind: "fix", scope: "point" },
  [POINT_FLAGS.WINNER_GUESSED]: { kind: "fix", scope: "point" },
  [POINT_FLAGS.SCORE_FROZEN]: { kind: "fix", scope: "point" },
  [SHOT_FLAGS.OUT_BALL_RALLY_CONTINUED]: { kind: "fix", scope: "shot" },
  [SHOT_FLAGS.GEOMETRY_DISCARDED]: { kind: "fix", scope: "shot" },
} as const satisfies Record<
  string,
  { kind: LabelMarkKind; scope: LabelMarkScope }
>;

export type LabelMarkCode = keyof typeof LABEL_MARK_META;

export function isLabelMarkCode(value: string): value is LabelMarkCode {
  return Object.prototype.hasOwnProperty.call(LABEL_MARK_META, value);
}

type NoParams = Record<string, never>;

/**
 * What each mark carries for its hover line (`markHover`). Sides, never
 * names — the console substitutes the players' names at render time.
 */
export interface LabelMarkParams {
  winner_disputed: { scoreWinner: LabelSide; lastStrokeWinner: LabelSide };
  winner_to_error_by_bounce: { loser: LabelSide };
  ending_suspect_line: NoParams;
  second_serve_called_out: NoParams;
  same_player_consecutive: { hitter: LabelSide };
  reserve_after_in: NoParams;
  service_court_repeat: { side: LabelServeSide | null };
  score_side_mismatch: {
    /**
     * The point score before the point, server-first, as the labelled rows
     * read it (score.ts's `scoreBefore`).
     */
    score: string | null;
    expected: LabelServeSide | null;
    actual: LabelServeSide | null;
  };
  tiebreak_score_off_six_all: NoParams;
  result_type_unknown: NoParams;
  serve_fault: NoParams;
  pick_winner: NoParams;
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

/** One mark on a point or a shot. `kind` and `scope` follow from `code`. */
export type LabelMark = {
  [C in LabelMarkCode]: {
    code: C;
    kind: (typeof LABEL_MARK_META)[C]["kind"];
    scope: (typeof LABEL_MARK_META)[C]["scope"];
    params: LabelMarkParams[C];
  };
}[LabelMarkCode];

/** The key `label_points.dismissed` stores for a suggestion. */
export type LabelSuggestionKey = `missing_shot:${number}` | "missing_point";

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
    };

export interface LabelMarks {
  /** Label point id → its marks, in the derivation's flag order. */
  points: Record<string, LabelMark[]>;
  /** Label shot id → its marks. */
  shots: Record<string, LabelMark[]>;
  suggestions: LabelSuggestion[];
  /**
   * Label point id → the side its opening serve was hit from, read off the
   * server's stance in the vendor file (`serveCourtSide`). Only points with
   * a vendor rally and a serve clear of the centre mark; a point the
   * labeller added is never here. What score-marks.ts holds the labelled
   * score against.
   */
  serveSides: Record<string, LabelServeSide>;
}

/** What `buildLabelMarks` reads off a session's rows. */
export type MarkablePoint = Pick<LabelPoint, "id" | "vendorRallyIds"> & {
  shots: Pick<LabelShot, "id" | "eventId">[];
};

const side = (isPlayer1: boolean): LabelSide => (isPlayer1 ? "p1" : "p2");

const SERVE_SHOT_TYPES = new Set(["First Serve", "Second Serve"]);
const isServeShot = (shot: Pick<DerivedShot, "shot_type">) =>
  shot.shot_type !== null && SERVE_SHOT_TYPES.has(shot.shot_type);

// A `serve_fault` tail — strokes after the lone serve, at most this many —
// is flags.ts's `MAX_DEAD_TAIL`, and a server within `SIDE_DEAD_ZONE_M` of
// the centre mark says nothing reliable about the side: the cut flags.ts's
// own `score_side_mismatch` makes. Both are imported so they cannot drift.

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
): LabelMark {
  const meta = LABEL_MARK_META[code];
  return { code, kind: meta.kind, scope: meta.scope, params } as LabelMark;
}

/**
 * A rally's vendor labels as sides. Read through the transcript's own shots
 * (`is_player1` by `event_id`), not by comparing labels to `player1Label`: a
 * frozen stretch relabels its strokes (frozen.ts `withServer`), so the raw
 * rally's label and the transcript's can disagree, while the event id never
 * does. A label no kept stroke carries — a phantom's, say — is the other side
 * of one that is; a rally with no kept stroke at all falls back to the label.
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
      known.set(stroke.playerLabel, side(shot.is_player1));
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

/**
 * The marks of one transcript point, in the order the derivation listed its
 * flags, plus the two labels-only flags last.
 */
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
      : side(point.won_by_player1);

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
        marks.push(mark(code, { hitter: side(pair[0].is_player1) }));
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

  if (rally && isServeFault(rally)) {
    marks.push(mark(LABEL_ONLY_FLAGS.SERVE_FAULT, {}));
  }
  if (settledWinner === null) {
    marks.push(mark(LABEL_ONLY_FLAGS.PICK_WINNER, {}));
  }

  return marks;
}

/** The marks of one derived shot, from its own flags. */
function shotMarks(shots: DerivedShot[], index: number): LabelMark[] {
  const shot = shots[index];
  const marks: LabelMark[] = [];
  for (const code of shot.flags) {
    if (!isLabelMarkCode(code)) continue;
    switch (code) {
      case SHOT_FLAGS.OUT_BALL_RALLY_CONTINUED: {
        const next = shots[index + 1];
        marks.push(
          mark(code, { nextHitter: next ? side(next.is_player1) : null }),
        );
        break;
      }
      case SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT:
      case SHOT_FLAGS.GEOMETRY_DISCARDED:
        marks.push(mark(code, {}));
        break;
      default:
        break;
    }
  }
  return marks;
}

/**
 * Consecutive kept shots by one player, two serves excepted — the pairs
 * `same_player_consecutive` fires on (flags.ts), each one a stroke the vendor
 * probably never detected.
 */
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

/**
 * The side the rally's opening serve was hit from, or null without a serve,
 * without a position, or with the server too near the centre mark to say.
 */
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
  return tail >= 1 && tail <= SERVE_FAULT_MAX_TAIL;
}

function midpoint(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

/**
 * Build the marks for one session.
 *
 * `points` is the session's rows in `point_index` order, as `getLabelSession`
 * returns them (tombstones included). A transcript point lands on the label
 * point whose `vendorRallyIds` holds its `rally_id`; a shot flag on the label
 * shot whose `eventId` is the derived shot's `event_id`. A flag whose rally
 * or event has no label row is dropped: a point the labeller deleted
 * outright, or a session seeded from a payload the derivation now reads
 * differently, draws nothing rather than something on the wrong row.
 *
 * `serveSides` is read off the first transcript point that lands on each
 * label point — a point built from several rallies opened with the first.
 */
export function buildLabelMarks(
  transcript: Transcript,
  rallies: readonly SplitStepRally[],
  points: readonly MarkablePoint[],
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
    if (list.length === 0) return;
    (into[id] ??= []).push(...list);
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
          hitter: opponent(side(a.is_player1)),
          videoTime: midpoint(a.video_time, b.video_time),
        });
      }
    }
  }

  return marks;
}
