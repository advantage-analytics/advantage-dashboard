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
 * The live marks (score-marks.ts) are read off the labelled rows on every
 * render, so one that no longer holds is simply not there — as are the hints
 * read off the rows (`pointEndedEarly`, `endingStale`, `secondServeAsFirst`,
 * `lastLandingMissing`, `serveAfterServeIn`).
 */

import { deriveEnding } from "./ending-derived";
import type { LabelMark, LabelMarks, LabelSuggestion } from "./marks";
import { MARK_LABEL, markHover, type MarkNames } from "./marks-copy";
import {
  endsPointWhenMissed,
  isLiveShot,
  isMissedResult,
  isNonPointEnding,
  isLetServe,
  isServeStroke,
  liveShotsInOrder,
  type LabelPoint,
  type LabelShot,
} from "./session";
import { effectiveShotResult, type ResultReadableShot } from "./shot-derived";
import {
  addedPointBetween,
  suggestionState,
  type SuggestionNeighbour,
} from "./suggestions";

export type MarkState =
  "open" | "settled" | "checked" | "checked-as-is" | "dismissed";

/**
 * `afterEventId` is read for "Missing shot?" alone — the added stroke that
 * answers its slot — and may be left out where the mark is not in question.
 */
export type MarkStateShot = Pick<
  LabelShot,
  "status" | "siteRemovalRestoredAt"
> &
  Partial<Pick<LabelShot, "afterEventId" | "eventId">> &
  ResultReadableShot;

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
 * The states of the `missing_shot` slots a "Missing shot?" mark opened on
 * `point` (`suggestionState`); empty without the session's `suggestions`.
 */
function missingShotStates(
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
): ReturnType<typeof suggestionState>[] {
  if (!suggestions) return [];
  const shots = point.shots.map((shot) => ({
    ...shot,
    afterEventId: shot.afterEventId ?? null,
  }));
  return suggestions
    .filter((s) => s.kind === "missing_shot" && s.pointId === point.id)
    .map((s) => suggestionState(s, { dismissed: point.dismissed, shots }));
}

/**
 * Where a `count` mark is in its life. `points` — the session's rows in rail
 * order — lets a "Same side twice" question read settled once a point was
 * added between the two (`missingPointAdded`); without them that answer is
 * not seen. "Missing shot?" reads its slots the same way: settled once one is
 * answered with "Add shot", dismissed once every one is dismissed.
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

  if (mark.code === "same_player_consecutive") {
    const slots = missingShotStates(point, suggestions);
    if (slots.includes("done")) return checked ? "checked" : "settled";
    if (slots.length > 0 && slots.every((s) => s === "dismissed")) {
      return "dismissed";
    }
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
 * Whether the session draws the site's removed strokes as ghosts — the
 * `ghosts` every reading of a point's rows takes (`isLiveShot`). The marks
 * are built for a session labelled with marks on and not otherwise, so the
 * marks' presence is the answer.
 */
export function drawsGhosts(marks: LabelMarks | null | undefined): boolean {
  return !!marks;
}

/** In, out or net, coordinates first (`effectiveShotResult`). */
const shotResult = effectiveShotResult;

/**
 * "Point ended here": the last live stroke that is not a first serve and
 * whose ball was out or in the net — a rally ball, or a second serve's double
 * fault (`endsPointWhenMissed`) — with one or more live strokes after it. Those were
 * hit after the point ended — or are a second point the vendor ran into this
 * one — so the hint offers to remove them or to split there. Live means not
 * deleted and, with `ghosts` on, not a ghost.
 */
export function pointEndedEarly(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "shot_after_point_end" }> | null {
  const live = liveShotsInOrder(point, ghosts);
  for (let i = live.length - 2; i >= 0; i -= 1) {
    const shot = live[i];
    if (!endsPointWhenMissed(shot.stroke)) continue;
    if (!isMissedResult(shotResult(shot))) continue;
    return {
      code: "shot_after_point_end",
      tier: "hint",
      scope: "point",
      params: {
        shotId: shot.id,
        after: live.slice(i + 1).map((s) => s.id),
      },
    };
  }
  return null;
}

/** A stroke with no landing placed, the labeller not having called it unclear. */
function landingMissingOn(shot: LabelShot): boolean {
  if (shot.landingX !== null && shot.landingY !== null) return false;
  return !shot.unclear.some((f) => f === "landing_x" || f === "landing_y");
}

/**
 * "No landing on the last shot": the point's last live stroke has no landing
 * placed and the labeller has not marked it unclear. The result is derived
 * from the coordinates, so until the bounce is placed the ending stays
 * whatever was stored.
 */
export function lastLandingMissing(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "last_landing_missing" }> | null {
  const last = liveShotsInOrder(point, ghosts).at(-1);
  if (!last || !landingMissingOn(last)) return null;
  return {
    code: "last_landing_missing",
    tier: "hint",
    scope: "point",
    params: {},
  };
}

/**
 * "Ending can't be read": the last live stroke is missing its landing
 * (`lastLandingMissing`) and has no stored result either, so nothing says how
 * the point ended. A `count` mark, raised live by score-marks.ts; gone once a
 * landing or a result is set.
 */
export function lastShotUnresolved(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "last_shot_unresolved" }> | null {
  // Cheap exit before the sort: some stroke must have neither.
  if (
    !point.shots.some(
      (shot) =>
        shot.result === null &&
        (shot.landingX === null || shot.landingY === null),
    )
  ) {
    return null;
  }
  const last = liveShotsInOrder(point, ghosts).at(-1);
  if (!last || last.result !== null || !landingMissingOn(last)) return null;
  return {
    code: "last_shot_unresolved",
    tier: "count",
    scope: "point",
    params: {},
  };
}

/**
 * "Serve after a serve in play": a live serve whose previous live stroke is a
 * serve with a stored result of `in` — a let that was played on, or two points
 * the vendor ran into one rally. The first such serve in video order; the
 * action splits the point there.
 */
export function serveAfterServeIn(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "serve_after_serve_in" }> | null {
  const live = liveShotsInOrder(point, ghosts);
  for (let i = 1; i < live.length; i += 1) {
    const before = live[i - 1];
    if (!isServeStroke(live[i].stroke)) continue;
    if (!isServeStroke(before.stroke) || before.result !== "in") continue;
    return {
      code: "serve_after_serve_in",
      tier: "hint",
      scope: "shot",
      params: { shotId: live[i].id },
    };
  }
  return null;
}

/**
 * "Ending looks stale": the point's stored ending is not what its strokes
 * derive (`deriveEnding`) — the ending or the ended-by differ, or none is
 * stored at all. How a point whose ending was left behind (a stroke edited
 * before the server kept the two in step, a point added by hand) gets fixed:
 * on a click of "Use it", never on load. Nothing for a let or a non-point,
 * whose ending says the rows do not decide it, and nothing while the rows
 * say nothing. `ghosts` is whether a site-removed stroke is still a ghost.
 */
export function endingStale(
  point: Pick<LabelPoint, "ending" | "endedBy" | "winner" | "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "ending_stale" }> | null {
  if (isNonPointEnding(point.ending)) return null;
  const derived = deriveEnding(point, ghosts);
  if (!derived) return null;
  if (
    point.ending !== null &&
    point.ending === derived.ending &&
    point.endedBy === derived.endedBy
  ) {
    return null;
  }
  return {
    code: "ending_stale",
    tier: "hint",
    scope: "point",
    params: {
      ending: derived.ending,
      endedBy: derived.endedBy,
      winner: derived.winner,
    },
  };
}

/**
 * "Second serve?": a live serve typed `first_serve` that follows an earlier
 * live serve of the point whose ball missed — by structure the second serve,
 * however the vendor typed it. A let between them is replayed and changes
 * nothing: it neither faults nor clears an earlier fault, and a first serve
 * after a let alone is a first serve. The first such serve in video order;
 * the action retypes it (`{ stroke: "second_serve" }`).
 */
export function secondServeAsFirst(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "second_serve_as_first" }> | null {
  const live = liveShotsInOrder(point, ghosts);
  let faulted = false;
  for (const shot of live) {
    if (!isServeStroke(shot.stroke) || isLetServe(shot)) continue;
    if (faulted && shot.stroke === "first_serve") {
      return {
        code: "second_serve_as_first",
        tier: "hint",
        scope: "shot",
        params: { shotId: shot.id },
      };
    }
    faulted = isMissedResult(shot.result);
  }
  return null;
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
