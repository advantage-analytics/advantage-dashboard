/**
 * The header's flag list and its jumps: every point whose review flag is open,
 * read exactly as the row's chip reads it (`reviewFlag`), then grouped by the
 * six items the flag asks and stepped through point by point. Pure, so the
 * rail and the console's `[` / `]` keys share one answer.
 */

import type { LabelMarks } from "./marks";
import {
  REVIEW_ITEMS,
  reviewFlag,
  reviewItemQuestion,
  type ReviewItem,
} from "./marks-state";
import type { LabelPoint } from "./session";
import type { LabelScoreMismatch } from "./set-scores";
import { gameOverflow, gameUnderflow } from "./game-shift";
import { setBreakLabel, setBreakSuspects } from "./set-break";
import { tiebreakFolds } from "./tiebreak-fold";
import { tiebreakServeOrders, type TiebreakServeOrder } from "./tiebreak-serve";
import { foldedPointIds, gameServeRepeats } from "./game-serve-order";

/** One point's open review flag. */
export interface OpenFlag {
  pointId: string;
  /** As the rail numbers the point: `pointIndex + 1`. */
  pointNumber: number;
  /** The flag is about the data, not the score: grey, and counted apart. */
  data: boolean;
  /** The flag's open items, in id order; never empty. */
  items: ReviewItem[];
}

/**
 * The score that doesn't add up, as one more stop: on the mismatching set's
 * last live point — where the set's score is read — or, when the rows never
 * reach that set, on the last live point of all. Counted with the points, and
 * `]` lands on it, so a set that ends on the wrong score is never a dot alone.
 */
export interface ScoreStop {
  pointId: string;
  pointNumber: number;
  /** "Set 1 ends 5–5, record 6–4". */
  label: string;
}

/** A stop `[` / `]` can land on: a flagged point, or the score. */
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
 * it would fold), a tiebreak off its serve order, a game served by the same
 * player as the game beside it, and a sit-down long enough
 * to be a set break the rows do not have. Read off the rows alone,
 * so there on a session labelled without marks too. `]` and `[` land on
 * each; the header's total stays the points and the score, and its jump's
 * tooltip says how many slots there are beside them.
 */
export function slotStops(
  points: readonly LabelPoint[],
  adScoring: boolean,
  /** set-scores.ts `matchTiebreakSet`: the fold's set, which never overflows. */
  matchTiebreakSet: number | null = null,
): ScoreStop[] {
  const numberOf = new Map(points.map((p) => [p.id, p.pointIndex + 1]));
  const stop = (pointId: string | undefined, label: string): ScoreStop[] =>
    pointId === undefined
      ? []
      : [{ pointId, pointNumber: numberOf.get(pointId) ?? 0, label }];
  const folds = tiebreakFolds(points, adScoring, matchTiebreakSet);
  return [
    ...gameOverflow(points, adScoring, matchTiebreakSet).flatMap((game) =>
      stop(game.leftovers[0]?.id, "Game already won, with points after it"),
    ),
    ...gameUnderflow(points, adScoring, matchTiebreakSet).flatMap((game) =>
      stop(
        game.lastPointId,
        `Game ${game.gameInSet} isn’t finished at ${game.score}`,
      ),
    ),
    ...folds.flatMap((fold) =>
      stop(
        fold.pointIds[0],
        fold.type === "match_tiebreak" ? "Match tiebreak?" : "Tiebreak at 6–6?",
      ),
    ),
    ...tiebreakServeStops(tiebreakServeOrders(points)),
    ...gameServeRepeats(points, foldedPointIds(folds)).flatMap((repeat) =>
      stop(repeat.pointId, "Same server two games in a row"),
    ),
    // No slot of its own in the rail: the clock says a set ended where the
    // rows carry on (set-break.ts), and the stop is the game after the gap.
    ...setBreakSuspects(points).flatMap((suspect) =>
      stop(suspect.pointId, setBreakLabel(suspect)),
    ),
  ];
}

/**
 * What a stop is called in a tooltip: its point's first open question, in the
 * words the row asks it (`reviewItemQuestion`), or the score's words.
 */
export function flagStopLabel(stop: FlagStop): string {
  return "items" in stop ? reviewItemQuestion(stop.items[0]) : stop.label;
}

/**
 * Every open flag, in the rail's order: one per live point whose review flag
 * (`reviewFlag`) is open, carrying the items still open on it. Grey (`data`)
 * when the whole flag is, as the row's chip draws it; a demoted flag is left
 * out, as the row leaves it off. Deleted points have none.
 */
export function openFlags(
  points: readonly LabelPoint[],
  marks: LabelMarks,
): OpenFlag[] {
  const flags: OpenFlag[] = [];
  for (const point of points) {
    const flag = reviewFlag(point, marks, points);
    if (!flag || flag.demoted || flag.state !== "open") continue;
    flags.push({
      pointId: point.id,
      pointNumber: point.pointIndex + 1,
      data: flag.tone === "data",
      items: flag.items.filter((item) => item.state === "open"),
    });
  }
  return flags;
}

export interface FlagRow {
  /** The item's id as a string ("1"…"6"): the row's key and `data-flag-kind`. */
  code: string;
  /** The item's question: "How did the last ball end?". */
  label: string;
  /** Each point once, in rail order. */
  points: { pointId: string; pointNumber: number }[];
}

export interface FlagGroup {
  /** The item's question. */
  name: string;
  /** Points with the item open. */
  count: number;
  /** One row: the item, so the lists' rows keep their shape. */
  rows: FlagRow[];
}

/**
 * `flags` grouped by review item, in the order the items are answered
 * (`REVIEW_ITEMS`), and only where something is open: at most six. A point
 * with two items open is in both groups, so the groups' counts may add up to
 * more than the points.
 */
export function flagGroups(flags: readonly OpenFlag[]): FlagGroup[] {
  const groups: FlagGroup[] = [];
  for (const item of REVIEW_ITEMS) {
    const mine = flags.filter((f) => f.items.some((i) => i.id === item.id));
    if (mine.length === 0) continue;
    groups.push({
      name: item.question,
      count: mine.length,
      rows: [
        {
          code: String(item.id),
          label: item.question,
          points: firstPerPoint(mine).map(({ pointId, pointNumber }) => ({
            pointId,
            pointNumber,
          })),
        },
      ],
    });
  }
  return groups;
}

/** One stop per point, the first in the list: a jump goes to a point. */
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
 * `flags` may come in any order (the score stop is appended to the points).
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
  // One per point, the first stop on it: a jump goes to a point.
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
