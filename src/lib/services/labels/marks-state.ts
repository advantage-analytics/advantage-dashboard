/**
 * A mark's life-cycle and what the point row shows of its marks. Derived, never
 * stored; the one stored piece is `label_points.dismissed`.
 *
 * Only a `count` mark (marks.ts `LabelMarkTier`) has a life: `open` until the
 * labeller changes the point (`settled`), confirms it unchanged
 * (`checked-as-is`), does both (`checked`) or dismisses the suggestion it
 * opened (`dismissed`). Unchecking a point reopens every mark the labeller did
 * not settle. A `hint` has no state; a `hidden` mark is dropped.
 *
 * The two score marks (score-marks.ts) are read off the labelled score on every
 * render, so one that no longer disagrees is simply not there.
 */

import { labelShotValues } from "./edit";
import type { LabelMark, LabelMarks, LabelSuggestion } from "./marks";
import { MARK_LABEL, markHover, type MarkNames } from "./marks-copy";
import {
  isLiveShot,
  isMissedResult,
  isServeStroke,
  type LabelPoint,
  type LabelShot,
} from "./session";
import { deriveShotResult } from "./shot-derived";
import { addedPointBetween, type SuggestionNeighbour } from "./suggestions";

export type MarkState =
  "open" | "settled" | "checked" | "checked-as-is" | "dismissed";

export type MarkStateShot = Pick<LabelShot, "status" | "siteRemovalRestoredAt">;

export type MarkStatePoint = Pick<
  LabelPoint,
  "id" | "status" | "checkedAt" | "dismissed"
> & { shots: readonly MarkStateShot[] };

/**
 * Whether the labeller changed the point or any of its shots — a shot they
 * edited, added or removed, or a ghost they put back. What settles a mark,
 * and what draws the row's pencil.
 */
export function pointChanged(point: MarkStatePoint): boolean {
  if (point.status === "edited" || point.status === "added") return true;
  return point.shots.some(
    (shot) =>
      shot.siteRemovalRestoredAt !== null ||
      shot.status === "edited" ||
      shot.status === "deleted" ||
      shot.status === "added",
  );
}

/**
 * Whether the `missing_point` suggestion on `point` was answered with "Add
 * point": a live added point now sits between the two served from one side
 * (`addedPointBetween`). Needs the session's `suggestions` and `points`; false
 * without either. The one change that settles a mark from outside the point.
 */
export function missingPointAdded(
  point: Pick<MarkStatePoint, "id">,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): boolean {
  if (!suggestions || !points) return false;
  return suggestions.some(
    (s) =>
      s.kind === "missing_point" &&
      s.pointId === point.id &&
      addedPointBetween(points, s.beforePointId, s.pointId),
  );
}

/**
 * Where a `count` mark is in its life. `points` — the session's rows in rail
 * order — lets a "Same side twice" question read settled once a point was
 * added between the two (`missingPointAdded`); without them that answer is
 * not seen.
 */
export function markState(
  mark: LabelMark,
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkState {
  const checked = point.checkedAt !== null;

  // Answered outranks dismissed, as it does for the suggestion itself: the
  // point is there either way.
  if (
    mark.code === "service_court_repeat" &&
    missingPointAdded(point, suggestions, points)
  ) {
    return checked ? "checked" : "settled";
  }

  // "Same side twice" opens the missing-point slot; "Dismiss" on it stores
  // `missing_point`.
  if (
    mark.code === "service_court_repeat" &&
    point.dismissed.includes("missing_point")
  ) {
    return "dismissed";
  }

  if (pointChanged(point)) return checked ? "checked" : "settled";
  return checked ? "checked-as-is" : "open";
}

/** A hover in the dark tooltip's two lines: the name, then what it means. */
export interface MarkHoverParts {
  /** The mark's short name, with its state once it is no longer open. */
  name: string;
  /** The sentence under it; null when the name says everything. */
  detail: string | null;
}

/**
 * A mark's hover in a state, in two parts. `sentence` is the point as the rail
 * reads it now, passed as a string so `lib/` never imports from `components/`.
 *
 * An open mark is named by its label over its own line. Every other state is
 * "{label} · {state}" over what the labeller did; nothing under a dismissal. A
 * "Same side twice" settled by "Add point" (`pointAdded`) says that instead:
 * the marked point's ending never changed.
 */
export function stateHoverParts(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
  pointAdded = false,
): MarkHoverParts {
  const label = MARK_LABEL[mark.code];
  switch (state) {
    case "open":
      return { name: label, detail: markHover(mark, names) };
    case "settled":
    case "checked":
      return {
        name: `${label} · settled`,
        detail:
          pointAdded && mark.code === "service_court_repeat"
            ? "You added the missing point."
            : `You changed the ending to ${sentence}.`,
      };
    case "checked-as-is":
      return {
        name: `${label} · checked as is`,
        detail: "You confirmed the point without changing it.",
      };
    case "dismissed":
      return { name: `${label} · dismissed`, detail: null };
  }
}

/** A hover's two parts as one line: the chip's accessible name. */
export function hoverLine({ name, detail }: MarkHoverParts): string {
  const stop = /[.?!]$/.test(name) ? "" : ".";
  return detail ? `${name}${stop} ${detail}` : `${name}${stop}`;
}

/** What the roll-up reads off a label point. A `LabelPoint` satisfies it. */
export type MarkListPoint = Pick<LabelPoint, "id"> & {
  shots: readonly Pick<
    LabelShot,
    "id" | "status" | "siteRemoval" | "siteRemovalRestoredAt"
  >[];
};

/** What a point shows of the session's marks, by tier. */
export interface PointRowMarkList {
  /** The amber chip's marks, which the header counts. */
  count: LabelMark[];
  /** The open point's quiet line. Never on a closed row, never counted. */
  hints: LabelMark[];
}

/**
 * The marks a point stands for, by tier: the one roll-up the row, the well and
 * the header all read.
 *
 * `count` is the point's own count marks and those of its live strokes. `hints`
 * is the point's own hints, then those of its last live stroke only
 * (`isLiveShot`): a hint on a stroke is about how the point ended. Each hint
 * code is listed once. A `hidden` mark is in neither list.
 */
export function pointRowMarkList(
  point: MarkListPoint,
  marks: LabelMarks,
): PointRowMarkList {
  const own = marks.points[point.id] ?? [];
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const last = point.shots.findLast((shot) => isLiveShot(shot));
  const hints: LabelMark[] = [];
  for (const mark of [...own, ...(last ? (marks.shots[last.id] ?? []) : [])]) {
    if (mark.tier !== "hint") continue;
    if (hints.some((seen) => seen.code === mark.code)) continue;
    hints.push(mark);
  }
  return {
    count: [
      ...own,
      ...live.flatMap((shot) => marks.shots[shot.id] ?? []),
    ].filter((mark) => mark.tier === "count"),
    hints,
  };
}

/**
 * "Shot after the point ended?": the one hint read off the labelled rows rather
 * than the vendor file. The point's second-to-last live stroke is not a serve
 * and its coordinates say it landed out or in the net, so the stroke after it
 * may be a swing at a dead ball. Live means not deleted and not a ghost.
 */
export function shotAfterPointEnd(
  point: Pick<LabelPoint, "shots">,
): Extract<LabelMark, { code: "shot_after_point_end" }> | null {
  const live = point.shots.filter((shot) => isLiveShot(shot));
  if (live.length < 2) return null;
  const landed = live[live.length - 2];
  if (isServeStroke(landed.stroke)) return null;
  const result = deriveShotResult(labelShotValues(landed));
  if (!isMissedResult(result)) return null;
  return {
    code: "shot_after_point_end",
    tier: "hint",
    scope: "point",
    params: { landed: live.length - 1, extra: live.length, result },
  };
}

/** What the rail header counts across the match. */
export interface MarkSummary {
  /** `count` marks still open — what is left to check. */
  open: number;
  /** Live points carrying at least one open mark. */
  openPoints: number;
}

/**
 * The match's total, over every live point — marks, not points, counted
 * exactly as the rows roll them up (`pointRowMarkList`, `markStates`). Hints
 * and hidden marks are not in it.
 */
export function markSummary(
  points: readonly LabelPoint[],
  marks: LabelMarks,
): MarkSummary {
  const summary: MarkSummary = { open: 0, openPoints: 0 };
  for (const point of points) {
    if (point.status === "deleted") continue;
    const { count } = pointRowMarkList(point, marks);
    const states = markStates(count, point, marks.suggestions, points);
    const open = states.filter((state) => state === "open").length;
    summary.open += open;
    if (open > 0) summary.openPoints += 1;
  }
  return summary;
}

/** The states `rollupMarks` reads: one per `count` mark, in order. */
export function markStates(
  countMarks: readonly LabelMark[],
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkState[] {
  return countMarks.map((mark) => markState(mark, point, suggestions, points));
}

/**
 * The chip on the point row.
 *
 * `text` is the words, or null for the icon-only form. `count` is how many
 * marks the chip stands for.
 */
export interface MarkRollupChip {
  text: string | null;
  count: number;
  state: MarkState;
}

/** Most open first: a chip is as open as its most open member. */
const OPENNESS: readonly MarkState[] = [
  "open",
  "settled",
  "dismissed",
  "checked-as-is",
  "checked",
];

export function mostOpen(states: readonly MarkState[]): MarkState {
  return OPENNESS.find((state) => states.includes(state)) ?? "checked";
}

/**
 * What the point row shows: at most one chip, for its `count` marks — null
 * when it has none.
 *
 * One mark still open is its own words; past one the words give way to
 * "N to check". A quiet chip (nothing open) has no words at all.
 */
export function rollupMarks(
  countMarks: readonly LabelMark[],
  states: readonly MarkState[],
): MarkRollupChip | null {
  if (countMarks.length === 0) return null;
  const open = countMarks.filter((_, i) => states[i] === "open");
  return {
    text:
      open.length === 0
        ? null
        : open.length === 1
          ? MARK_LABEL[open[0].code]
          : `${open.length} to check`,
    count: countMarks.length,
    state: mostOpen(states),
  };
}
