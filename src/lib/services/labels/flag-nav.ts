/**
 * The header's flag list and its jumps: every open `count` mark in the match,
 * read exactly as the rows read them (`pointRowMarkList`, `markStates`), then
 * grouped into the four kinds the list shows and stepped through point by
 * point. Pure, so the rail and the console's `[` / `]` keys share one answer.
 */

import type { LabelMarkCode, LabelMarks } from "./marks";
import { MARK_LABEL } from "./marks-copy";
import { markStates, pointRowMarkList } from "./marks-state";
import type { LabelPoint } from "./session";

/** One open mark on one point. */
export interface OpenFlag {
  pointId: string;
  /** As the rail numbers the point: `pointIndex + 1`. */
  pointNumber: number;
  code: LabelMarkCode;
}

/** Every open `count` mark, in the rail's order. Deleted points have none. */
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
      });
    });
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
    ],
  },
  { name: "Missing shot", codes: ["same_player_consecutive"] },
  { name: "Serve", codes: ["reserve_after_in", "service_court_repeat"] },
  {
    name: "Score",
    codes: ["score_side_mismatch", "tiebreak_score_off_six_all"],
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
      const seen = new Set<string>();
      rows.push({
        code,
        label: MARK_LABEL[code],
        points: mine
          .filter((f) => !seen.has(f.pointId) && seen.add(f.pointId))
          .map(({ pointId, pointNumber }) => ({ pointId, pointNumber })),
      });
    }
    if (rows.length > 0) groups.push({ name: kind.name, count, rows });
  }
  return groups;
}

/**
 * The flag a jump lands on: the first flagged point after `fromPointId` (or
 * the last before it, going back), wrapping round the match. From no point,
 * forward starts at the top and back at the bottom. Null with nothing open.
 */
export function stepFlag(
  flags: readonly OpenFlag[],
  points: readonly Pick<LabelPoint, "id">[],
  fromPointId: string | null,
  direction: 1 | -1,
): OpenFlag | null {
  if (flags.length === 0) return null;
  const order = new Map(points.map((point, i) => [point.id, i]));
  const at = fromPointId === null ? null : (order.get(fromPointId) ?? null);
  // One per point, the point's first open mark: a jump goes to a point.
  const seen = new Set<string>();
  const stops = flags.filter(
    (f) => !seen.has(f.pointId) && seen.add(f.pointId),
  );
  const pos = (f: OpenFlag) => order.get(f.pointId) ?? -1;
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
