/**
 * A mark's life-cycle and what the point row shows of its marks.
 *
 * Derived, never stored. Only a `count` mark (marks.ts `LabelMarkTier`) has a
 * life: it is never deleted, only quietened — `open` until the labeller
 * changes the point (`settled`), confirms it unchanged (`checked-as-is`),
 * does both (`checked`) or dismisses the suggestion it opened (`dismissed`).
 * Unchecking a point turns every mark the labeller did not settle amber
 * again. The one stored piece is `label_points.dismissed`; everything else
 * reads the rows' own status.
 *
 * A `hint` has no state: it is a word on the open point's quiet line, there
 * whatever the labeller has done, and counted nowhere. A `hidden` mark is
 * nothing here at all — `pointRowMarkList` drops one even if it is handed
 * one.
 *
 * The one exception to "never deleted" is the pair of score marks
 * (score-marks.ts): they are read off the labelled score on every render,
 * so one that no longer disagrees is simply not there. While one is, it has
 * this life-cycle like any other.
 *
 * Pure, and importable from the client bundle: nothing from `next/`,
 * `components/` or a server file.
 */

import type { LabelMark, LabelMarks, LabelSuggestion } from "./marks";
import { MARK_LABEL, markHover, type MarkNames } from "./marks-copy";
import { isGhostShot, type LabelPoint, type LabelShot } from "./session";
import { addedPointBetween, type SuggestionNeighbour } from "./suggestions";

export type MarkState =
  "open" | "settled" | "checked" | "checked-as-is" | "dismissed";

/** What the life-cycle reads off a label shot. */
export type MarkStateShot = Pick<LabelShot, "status" | "siteRemovalRestoredAt">;

/** What the life-cycle reads off a label point. */
export type MarkStatePoint = Pick<
  LabelPoint,
  "id" | "status" | "checkedAt" | "dismissed"
> & { shots: readonly MarkStateShot[] };

/** A ghost the labeller put back, or a shot they edited, added or removed. */
function shotChanged(shot: MarkStateShot): boolean {
  if (shot.siteRemovalRestoredAt !== null) return true;
  return (
    shot.status === "edited" ||
    shot.status === "deleted" ||
    shot.status === "added"
  );
}

/**
 * Whether the labeller changed the point or any of its shots — what settles a
 * mark, and what draws the row's pencil.
 */
export function pointChanged(point: MarkStatePoint): boolean {
  if (point.status === "edited" || point.status === "added") return true;
  return point.shots.some(shotChanged);
}

/**
 * Whether the suggestion a mark opened was dismissed: "Same side twice" opens
 * the missing-point slot, and "Dismiss" on it stores `missing_point`.
 */
function markDismissed(mark: LabelMark, point: MarkStatePoint): boolean {
  return (
    mark.code === "service_court_repeat" &&
    point.dismissed.includes("missing_point")
  );
}

/**
 * Whether the `missing_point` suggestion on `point` was answered with "Add
 * point": a live added point now sits between the two served from one side
 * (`addedPointBetween`). Needs the session's `suggestions` and its `points`
 * (the rail's rows); without either it cannot be seen and is false. The one
 * change that settles a flag from OUTSIDE the point — the flagged point
 * itself is untouched, but the question it asked is answered.
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

  if (markDismissed(mark, point)) return "dismissed";

  if (pointChanged(point)) return checked ? "checked" : "settled";
  return checked ? "checked-as-is" : "open";
}

/**
 * The hover line for a mark in a state. `sentence` is the point as the rail
 * reads it now (the console's `pointSentence`), passed as a string so `lib/`
 * never imports from `components/`.
 *
 * An open mark reads its own line. One settled and then checked keeps the
 * settled line: the row still shows what was questioned and what the
 * labeller did. A "Same side twice" settled by "Add point" (`pointAdded`,
 * from `missingPointAdded`) says that instead — the marked point's ending
 * never changed, so the ordinary settled line would be false.
 */
export function stateHover(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
  pointAdded = false,
): string {
  if (state === "open") return markHover(mark, names);
  return hoverLine(answeredParts(mark, state, sentence, pointAdded));
}

/**
 * A mark's line once it is answered, in its two parts: "{label} · {state}"
 * over what the labeller did — nothing under a dismissal, which says it all.
 */
function answeredParts(
  mark: LabelMark,
  state: Exclude<MarkState, "open">,
  sentence: string,
  pointAdded: boolean,
): MarkHoverParts {
  const label = MARK_LABEL[mark.code];
  switch (state) {
    case "settled":
    case "checked":
      if (pointAdded && mark.code === "service_court_repeat") {
        return {
          name: `${label} · settled`,
          detail: "You added the missing point.",
        };
      }
      return {
        name: `${label} · settled`,
        detail: `You changed the ending to ${sentence}.`,
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

/** A hover in the dark tooltip's two lines: the name, then what it means. */
export interface MarkHoverParts {
  /** The mark's short name, with its state once it is no longer open. */
  name: string;
  /** The sentence under it; null when the name says everything. */
  detail: string | null;
}

/**
 * `stateHover` in two parts, for a tooltip that names first and explains
 * second. An open mark is named by its label over its own line; every other
 * state is the answered line — "Check the ending · settled" over "You
 * changed the ending to …".
 */
export function stateHoverParts(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
  pointAdded = false,
): MarkHoverParts {
  if (state === "open") {
    return { name: MARK_LABEL[mark.code], detail: markHover(mark, names) };
  }
  return answeredParts(mark, state, sentence, pointAdded);
}

/**
 * A hover's two parts as one line — the chip's accessible name. A name that
 * is a question ("Net or out?") already ends itself.
 */
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

/**
 * The point's last stroke still in the rally: not deleted, and not one the
 * site removed that is still drawn as a ghost (`isGhostShot`).
 */
function lastLiveShot(
  point: MarkListPoint,
): MarkListPoint["shots"][number] | undefined {
  return point.shots.findLast(
    (shot) => shot.status !== "deleted" && !isGhostShot(shot),
  );
}

/** What a point shows of the session's marks, by tier. */
export interface PointRowMarkList {
  /** The amber chip's marks, which the header counts. */
  count: LabelMark[];
  /** The open point's quiet line. Never on a closed row, never counted. */
  hints: LabelMark[];
}

/**
 * The marks a point stands for, by tier — the ONE roll-up the row, the well
 * and the header all read.
 *
 * `count` is the point's own count marks and those of its live strokes (a
 * deleted stroke's row is a tombstone and carries nothing). `hints` is the
 * point's own hints and then those of its LAST live stroke only: a hint on a
 * stroke is about how the point ended, and a stroke the labeller has since
 * played on from — or removed — no longer ends it. Each hint code is listed
 * once, however many rallies the point was combined from. A `hidden` mark is
 * in neither list, whoever built the marks.
 */
export function pointRowMarkList(
  point: MarkListPoint,
  marks: LabelMarks,
): PointRowMarkList {
  const own = marks.points[point.id] ?? [];
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const last = lastLiveShot(point);
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
    const open = states.marks.filter((state) => state === "open").length;
    summary.open += open;
    if (open > 0) summary.openPoints += 1;
  }
  return summary;
}

/** The states of a point's count marks, and whether the labeller changed it. */
export interface MarkStates {
  /** One per mark, in order. */
  marks: MarkState[];
  /** The point or one of its shots was changed by the labeller. */
  changed: boolean;
}

/** The states `rollupMarks` reads, for `pointRowMarkList`'s `count`. */
export function markStates(
  countMarks: readonly LabelMark[],
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkStates {
  return {
    marks: countMarks.map((mark) =>
      markState(mark, point, suggestions, points),
    ),
    changed: pointChanged(point),
  };
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

export interface MarkRollup {
  flag: MarkRollupChip | null;
  /** The blue "Changed by you" pencil. */
  pencil: boolean;
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
 * What the point row shows: at most one chip, for its `count` marks.
 *
 * One mark still open is its own words; past one the words give way to
 * "N to check". A quiet chip (nothing open) has no words at all.
 */
export function rollupMarks(
  countMarks: readonly LabelMark[],
  states: MarkStates,
): MarkRollup {
  let flag: MarkRollupChip | null = null;
  if (countMarks.length > 0) {
    const open = countMarks.filter((_, i) => states.marks[i] === "open");
    flag = {
      text:
        open.length === 0
          ? null
          : open.length === 1
            ? MARK_LABEL[open[0].code]
            : `${open.length} to check`,
      count: countMarks.length,
      state: mostOpen(states.marks),
    };
  }
  return { flag, pencil: states.changed };
}
