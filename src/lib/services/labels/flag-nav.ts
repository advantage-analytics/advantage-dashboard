/**
 * The header's flag list and its jumps: every open `count` mark in the match,
 * read exactly as the rows read them (`pointRowMarkList`, `markStates`), then
 * grouped into the four kinds the list shows and stepped through point by
 * point. Pure, so the rail and the console's `[` / `]` keys share one answer.
 */

import type { LabelMarkCode, LabelMarks } from "./marks";
import { MARK_LABEL } from "./marks-copy";
import {
  markStates,
  markTone,
  openHintMarks,
  pointRowMarkList,
  pointWinnerContradicted,
} from "./marks-state";
import type { LabelPoint } from "./session";
import type { LabelScoreMismatch } from "./set-scores";
import { gameOverflow, gameUnderflow } from "./game-shift";
import { setBreakLabel, setBreakSuspects } from "./set-break";
import { tiebreakFolds } from "./tiebreak-fold";
import { tiebreakServeOrders, type TiebreakServeOrder } from "./tiebreak-serve";

/** One open mark on one point. */
export interface OpenFlag {
  pointId: string;
  /** As the rail numbers the point: `pointIndex + 1`. */
  pointNumber: number;
  code: LabelMarkCode;
  /** About the data, not the score (`markTone`): grey, and counted apart. */
  data: boolean;
}

/**
 * The score that doesn't add up, as one more stop: on the mismatching set's
 * last live point — where the set's score is read — or, when the rows never
 * reach that set, on the last live point of all. Counted with the marks, and
 * `]` lands on it, so a set that ends on the wrong score is never a dot alone.
 */
export interface ScoreStop {
  pointId: string;
  pointNumber: number;
  /** "Set 1 ends 5–5, record 6–4". */
  label: string;
}

/** A stop `[` / `]` can land on: an open mark, or the score. */
export type FlagStop = OpenFlag | ScoreStop;

/** "Set 1 ends 5–5, record 6–4": the score stop's words. */
export function scoreStopLabel(mismatch: LabelScoreMismatch): string {
  return `Set ${mismatch.setNumber} ends ${mismatch.labelled}, record ${mismatch.entered}`;
}

/** The score stop for `mismatch`; null with none, or no live point at all. */
export function scoreStop(
  mismatch: LabelScoreMismatch | null,
  points: readonly Pick<LabelPoint, "id" | "pointIndex" | "status">[],
): ScoreStop | null {
  if (!mismatch) return null;
  const id =
    mismatch.lastPointId ??
    points.findLast((point) => point.status !== "deleted")?.id ??
    null;
  const point = id === null ? undefined : points.find((p) => p.id === id);
  if (!point) return null;
  return {
    pointId: point.id,
    pointNumber: point.pointIndex + 1,
    label: scoreStopLabel(mismatch),
  };
}

/**
 * Each tiebreak off its serve order (tiebreak-serve.ts) as a stop: on the
 * first point that is off it, where the rail draws its slot.
 */
export function tiebreakServeStops(
  orders: readonly TiebreakServeOrder[],
): ScoreStop[] {
  return orders.map((order) => ({
    pointId: order.off[0].pointId,
    pointNumber: order.off[0].pointNumber,
    label: `${order.type === "tiebreak" ? "Tiebreak" : "Match tiebreak"} serve order is off`,
  }));
}

/**
 * Every amber slot the rail draws between rows, as stops: a game already won
 * with rows after it (on its first leftover), a game that ends short (on its
 * last row, which the slot follows), the tiebreak at 6–6 (on the first point
 * it would fold), a tiebreak off its serve order and a sit-down long enough
 * to be a set break the rows do not have. Read off the rows alone,
 * so there on a session labelled without marks too. `]` and `[` land on
 * each; the header's total stays the marks and the score, and its jump's
 * tooltip says how many slots there are beside them.
 */
export function slotStops(
  points: readonly LabelPoint[],
  adScoring: boolean,
): ScoreStop[] {
  const numberOf = new Map(points.map((p) => [p.id, p.pointIndex + 1]));
  const stop = (pointId: string | undefined, label: string): ScoreStop[] =>
    pointId === undefined
      ? []
      : [{ pointId, pointNumber: numberOf.get(pointId) ?? 0, label }];
  return [
    ...gameOverflow(points, adScoring).flatMap((game) =>
      stop(game.leftovers[0]?.id, "Game already won, with points after it"),
    ),
    ...gameUnderflow(points, adScoring).flatMap((game) =>
      stop(
        game.lastPointId,
        `Game ${game.gameInSet} isn’t finished at ${game.score}`,
      ),
    ),
    ...tiebreakFolds(points, adScoring).flatMap((fold) =>
      stop(fold.pointIds[0], "Tiebreak at 6–6?"),
    ),
    ...tiebreakServeStops(tiebreakServeOrders(points)),
    // No slot of its own in the rail: the clock says a set ended where the
    // rows carry on (set-break.ts), and the stop is the game after the gap.
    ...setBreakSuspects(points).flatMap((suspect) =>
      stop(suspect.pointId, setBreakLabel(suspect)),
    ),
  ];
}

/** What a stop is called in a tooltip: its mark's words, or the score's. */
export function flagStopLabel(stop: FlagStop): string {
  return "code" in stop ? MARK_LABEL[stop.code] : stop.label;
}

/**
 * Every open flag, in the rail's order: each point's open `count` marks, then
 * — until the point is checked — its hints, which are grey (`data`) like the
 * chip its row draws for them. Deleted points have none.
 */
export function openFlags(
  points: readonly LabelPoint[],
  marks: LabelMarks,
): OpenFlag[] {
  const flags: OpenFlag[] = [];
  for (const point of points) {
    if (point.status === "deleted") continue;
    const { count } = pointRowMarkList(point, marks);
    const states = markStates(count, point, marks.suggestions, points);
    count.forEach((mark, i) => {
      if (states[i] !== "open") return;
      flags.push({
        pointId: point.id,
        pointNumber: point.pointIndex + 1,
        code: mark.code,
        data: markTone(mark, point, marks.suggestions) === "data",
      });
    });
    // A winner the strokes contradict is the score: amber, and still open
    // on a checked point. Every other hint is data, and goes when checked.
    const contradicted = pointWinnerContradicted(point, marks);
    if (point.checkedAt !== null && !contradicted) continue;
    for (const hint of openHintMarks(point, marks)) {
      const score = contradicted && hint.code === "ending_stale";
      if (point.checkedAt !== null && !score) continue;
      flags.push({
        pointId: point.id,
        pointNumber: point.pointIndex + 1,
        code: hint.code,
        data: !score,
      });
    }
  }
  return flags;
}

/** The list's groups, in the order a labeller works through them. */
const KINDS: readonly { name: string; codes: readonly LabelMarkCode[] }[] = [
  {
    name: "Ending",
    codes: [
      "winner_disputed",
      "pick_winner",
      "last_shot_unresolved",
      "winner_guessed",
      "last_call_overruled",
      // The grey list's: how the point ended, not who won it.
      "shot_after_point_end",
      "ending_stale",
      "ending_suspect_line",
      "winner_to_error_by_bounce",
      "result_type_unknown",
    ],
  },
  { name: "Missing shot", codes: ["same_player_consecutive"] },
  {
    name: "Serve",
    codes: [
      "reserve_after_in",
      "service_court_repeat",
      "first_serve_fault_alone",
      "second_serve_called_out",
      "second_serve_as_first",
      "serve_after_serve_in",
      "serve_in_landing_out",
    ],
  },
  {
    name: "Landing",
    codes: ["last_landing_missing", "net_hit_contradicts_height"],
  },
  {
    name: "Score",
    codes: [
      "score_side_mismatch",
      "tiebreak_score_off_six_all",
      "segment_proposal_differs",
    ],
  },
];

export interface FlagRow {
  code: LabelMarkCode;
  /** The rows' own words: "Check the ending". */
  label: string;
  /** Each point once, in rail order. */
  points: { pointId: string; pointNumber: number }[];
}

export interface FlagGroup {
  name: string;
  /** Open marks in the group, not points. */
  count: number;
  rows: FlagRow[];
}

/**
 * `flags` grouped into kinds, each kind's rows in the kind's own order and
 * only where something is open. A code no kind names lands in "Other", so a
 * new `count` mark is listed before anyone files it.
 */
export function flagGroups(flags: readonly OpenFlag[]): FlagGroup[] {
  const named = new Set(KINDS.flatMap((kind) => kind.codes));
  const other = [...new Set(flags.map((f) => f.code))].filter(
    (code) => !named.has(code),
  );
  const kinds = [...KINDS, { name: "Other", codes: other }];
  const groups: FlagGroup[] = [];
  for (const kind of kinds) {
    const rows: FlagRow[] = [];
    let count = 0;
    for (const code of kind.codes) {
      const mine = flags.filter((f) => f.code === code);
      if (mine.length === 0) continue;
      count += mine.length;
      rows.push({
        code,
        label: MARK_LABEL[code],
        points: firstPerPoint(mine).map(({ pointId, pointNumber }) => ({
          pointId,
          pointNumber,
        })),
      });
    }
    if (rows.length > 0) groups.push({ name: kind.name, count, rows });
  }
  return groups;
}

/** One mark per point, the first in the list: a jump goes to a point. */
function firstPerPoint<F extends Pick<OpenFlag, "pointId">>(
  flags: readonly F[],
): F[] {
  const seen = new Set<string>();
  return flags.filter((f) => !seen.has(f.pointId) && seen.add(f.pointId));
}

/**
 * The flag a jump lands on: the first flagged point after `fromPointId` (or
 * the last before it, going back), wrapping round the match. From no point,
 * forward starts at the top and back at the bottom. Null with nothing open.
 * `flags` may come in any order (the score stop is appended to the marks).
 */
export function stepFlag<F extends Pick<OpenFlag, "pointId">>(
  flags: readonly F[],
  points: readonly Pick<LabelPoint, "id">[],
  fromPointId: string | null,
  direction: 1 | -1,
): F | null {
  if (flags.length === 0) return null;
  const order = new Map(points.map((point, i) => [point.id, i]));
  const at = fromPointId === null ? null : (order.get(fromPointId) ?? null);
  const pos = (f: F) => order.get(f.pointId) ?? -1;
  // One per point, the point's first open mark: a jump goes to a point.
  const stops = firstPerPoint([...flags].sort((a, b) => pos(a) - pos(b)));
  if (direction === 1) {
    return (
      (at === null ? undefined : stops.find((f) => pos(f) > at)) ?? stops[0]
    );
  }
  return (
    (at === null ? undefined : stops.findLast((f) => pos(f) < at)) ??
    stops[stops.length - 1]
  );
}
