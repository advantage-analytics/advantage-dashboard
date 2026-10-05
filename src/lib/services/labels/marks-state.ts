/**
 * A mark's life-cycle and what the point row shows of its marks.
 *
 * Derived, never stored. A flag is never deleted, only quietened: it is
 * `open` until the labeller changes the point (`settled`), confirms it
 * unchanged (`checked-as-is`), does both (`checked`) or dismisses the
 * suggestion it opened (`dismissed`). Unchecking a point turns every flag the
 * labeller did not settle amber again. The one stored piece is
 * `label_points.dismissed`; everything else reads the rows' own status.
 *
 * The one exception to "never deleted" is the pair of score flags
 * (score-marks.ts): they are read off the labelled score on every render,
 * so one that no longer disagrees is simply not there. While one is, it has
 * this life-cycle like any other.
 *
 * Pure, and importable from the client bundle: nothing from `next/`,
 * `components/` or a server file.
 */

import type { LabelMark, LabelMarks, LabelSuggestion } from "./marks";
import { fixLabel, MARK_LABEL, markHover, type MarkNames } from "./marks-copy";
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
function shotChanged(shot: MarkStateShot, asMarked = false): boolean {
  if (shot.siteRemovalRestoredAt !== null) return true;
  if (shot.status === "edited" || shot.status === "deleted") return true;
  // A mark never sits on a shot the labeller added, so `added` only counts
  // for the point as a whole.
  return !asMarked && shot.status === "added";
}

/**
 * Whether the labeller changed the point or any of its shots — what settles a
 * flag, and what draws the row's pencil.
 */
export function pointChanged(point: MarkStatePoint): boolean {
  if (point.status === "edited" || point.status === "added") return true;
  return point.shots.some((shot) => shotChanged(shot));
}

const MISSING_SHOT_PREFIX = "missing_shot:";

/**
 * Whether the suggestion a flag opened was dismissed.
 *
 * `same_player_consecutive` opens one `missing_shot:<afterEventId>` per pair
 * and the mark does not say which. With the session's `suggestions` the flag
 * is dismissed once every one of the point's own is; without them, once any
 * `missing_shot:` key is on the point.
 */
function flagDismissed(
  mark: LabelMark,
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
): boolean {
  if (mark.code === "service_court_repeat") {
    return point.dismissed.includes("missing_point");
  }
  if (mark.code !== "same_player_consecutive") return false;
  const own = suggestions?.filter(
    (s) => s.kind === "missing_shot" && s.pointId === point.id,
  );
  if (own && own.length > 0) {
    return own.every((s) => point.dismissed.includes(s.key));
  }
  return point.dismissed.some((key) => key.startsWith(MISSING_SHOT_PREFIX));
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
 * Where a mark is in its life. `shot` is the row a shot mark sits on; it only
 * matters when that row is not among `point.shots`. `points` — the session's
 * rows in rail order — lets a "Same side twice" question read settled once a
 * point was added between the two (`missingPointAdded`); without them that
 * answer is not seen.
 *
 * A fix is never `open`: the site already acted, so it is `settled` by nature
 * and `checked` once the point is.
 */
export function markState(
  mark: LabelMark,
  point: MarkStatePoint,
  shot?: MarkStateShot,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkState {
  const checked = point.checkedAt !== null;
  if (mark.kind === "fix") return checked ? "checked" : "settled";

  // Answered outranks dismissed, as it does for the suggestion itself: the
  // point is there either way.
  if (
    mark.code === "service_court_repeat" &&
    missingPointAdded(point, suggestions, points)
  ) {
    return checked ? "checked" : "settled";
  }

  if (flagDismissed(mark, point, suggestions)) return "dismissed";

  const changed =
    pointChanged(point) || (shot !== undefined && shotChanged(shot, true));
  if (changed) return checked ? "checked" : "settled";
  return checked ? "checked-as-is" : "open";
}

/**
 * The hover line for a mark in a state. `sentence` is the point as the rail
 * reads it now (the console's `pointSentence`), passed as a string so `lib/`
 * never imports from `components/`.
 *
 * An open flag reads its own line. A fix reads its own line in every state —
 * the hover still says what the site did. A flag settled and then checked
 * keeps the settled line: the row still shows what was questioned and what
 * the labeller did. A "Same side twice" settled by "Add point" (`pointAdded`,
 * from `missingPointAdded`) says that instead — the flagged point's ending
 * never changed, so the ordinary settled line would be false.
 */
export function stateHover(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
  pointAdded = false,
): string {
  if (mark.kind === "fix" || state === "open") return markHover(mark, names);
  const label = MARK_LABEL[mark.code];
  switch (state) {
    case "settled":
    case "checked":
      if (pointAdded && mark.code === "service_court_repeat") {
        return `${label} · settled. You added the missing point.`;
      }
      return `${label} · settled. You changed the ending to ${sentence}.`;
    case "checked-as-is":
      return `${label} · checked as is. You confirmed the point without changing it.`;
    case "dismissed":
      return `${label} · dismissed.`;
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
 * second. An open flag and a fix are named by their chip label
 * (`fixLabel`) over their own line; every other state is `stateHover`'s
 * sentence cut at its first full stop — "Check the ending · settled" over
 * "You changed the ending to …".
 */
export function stateHoverParts(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
  pointAdded = false,
): MarkHoverParts {
  if (mark.kind === "fix" || state === "open") {
    return { name: fixLabel(mark), detail: markHover(mark, names) };
  }
  const line = stateHover(mark, state, names, sentence, pointAdded);
  const cut = line.indexOf(". ");
  if (cut === -1) return { name: line.replace(/\.$/, ""), detail: null };
  return { name: line.slice(0, cut), detail: line.slice(cut + 2) };
}

/**
 * A hover's two parts as one line — the chip's accessible name. A name that
 * is a question ("Net or out?") already ends itself.
 */
export function hoverLine({ name, detail }: MarkHoverParts): string {
  const stop = /[.?!]$/.test(name) ? "" : ".";
  return detail ? `${name}${stop} ${detail}` : `${name}${stop}`;
}

/**
 * "Out call ignored" is the vendor file's commonest defect — on up to a
 * third of all strokes — so it is shown on its shot only and never raised to
 * the point row, nor counted in the match's totals (board 08m).
 */
export const SHOT_ONLY_CODE: LabelMark["code"] = "out_ball_rally_continued";

/**
 * "1 shot removed" stands for the point's ghosts — the strokes the site
 * removed that are still out of the rally (`isGhostShot`). Restore puts one
 * back and the chip must follow: it counts the ghosts still live, and goes
 * when none is (board 08m §3: "Restore … drops the grey mark from the
 * point"). The mark's `eventIds` are narrowed to the live ghosts' vendor ids
 * where they line up, so "2 shots removed" reads "1 shot removed" after one
 * Restore; where they do not, the mark keeps its own count.
 */
export function liveGhostFixes(
  point: Pick<LabelPoint, "shots">,
  pointMarks: readonly LabelMark[],
): LabelMark[] {
  const ghosts = point.shots.filter(isGhostShot);
  return pointMarks.flatMap((mark): LabelMark[] => {
    if (mark.code !== "phantom_strokes_dropped") return [mark];
    if (ghosts.length === 0) return [];
    const live = new Set(ghosts.map((shot) => shot.eventId));
    const eventIds = mark.params.eventIds.filter((id) => live.has(id));
    if (eventIds.length === 0) return [mark];
    const narrowed: LabelMark = {
      ...mark,
      params: { ...mark.params, eventIds },
    };
    return [narrowed];
  });
}

/**
 * The marks a point row stands for, as the rail rolls them up: the point's
 * own (ghost fixes counted for the ghosts still live) and those of its live
 * strokes, the shot-only code left out.
 */
export function pointRowMarkList(
  point: LabelPoint,
  marks: LabelMarks,
): { point: LabelMark[]; shots: LabelMark[] } {
  return {
    point: liveGhostFixes(point, marks.points[point.id] ?? []),
    shots: point.shots
      // A deleted stroke's row is a tombstone and carries no chip, so its
      // marks are not counted toward what "open the point" would show.
      .filter((shot) => shot.status !== "deleted")
      .flatMap((shot) => marks.shots[shot.id] ?? [])
      .filter((mark) => mark.code !== SHOT_ONLY_CODE),
  };
}

/** What the rail header counts across the match. */
export interface MarkSummary {
  /** Flags still open — what is left to check. */
  open: number;
  /** Live points carrying at least one open flag. */
  openPoints: number;
  /** Automatic fixes, in every state: a ghost still drawn counts, a restored one does not. */
  fixes: number;
  /** Live points carrying at least one fix. */
  fixPoints: number;
}

/**
 * The match's totals, over every live point — marks, not points, counted
 * exactly as the rows roll them up (`pointRowMarkList`, `markStates`).
 */
export function markSummary(
  points: readonly LabelPoint[],
  marks: LabelMarks,
): MarkSummary {
  const summary: MarkSummary = {
    open: 0,
    openPoints: 0,
    fixes: 0,
    fixPoints: 0,
  };
  for (const point of points) {
    if (point.status === "deleted") continue;
    const own = pointRowMarkList(point, marks);
    const states = markStates(
      own.point,
      own.shots,
      point,
      marks.suggestions,
      points,
    );
    const all = [
      ...own.point.map((mark, i) => ({ mark, state: states.point[i] })),
      ...own.shots.map((mark, i) => ({ mark, state: states.shots[i] })),
    ];
    const open = all.filter(
      (m) => m.mark.kind === "flag" && m.state === "open",
    ).length;
    const fixes = all.filter((m) => m.mark.kind === "fix").length;
    summary.open += open;
    summary.fixes += fixes;
    if (open > 0) summary.openPoints += 1;
    if (fixes > 0) summary.fixPoints += 1;
  }
  return summary;
}

/** The states of a point's marks, and whether the labeller changed it. */
export interface MarkStates {
  /** One per point mark, in order. */
  point: MarkState[];
  /** One per shot mark, in order. */
  shots: MarkState[];
  /** The point or one of its shots was changed by the labeller. */
  changed: boolean;
}

/**
 * The states `rollupMarks` reads. `shotMarks` is every mark on the point's
 * shots, flattened in rail order — a shot inside the point shares the point's
 * life, so no per-shot row is needed here.
 */
export function markStates(
  pointMarks: readonly LabelMark[],
  shotMarks: readonly LabelMark[],
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkStates {
  const stateOf = (mark: LabelMark) =>
    markState(mark, point, undefined, suggestions, points);
  return {
    point: pointMarks.map(stateOf),
    shots: shotMarks.map(stateOf),
    changed: pointChanged(point),
  };
}

/**
 * One chip on the point row.
 *
 * `text` is the words, or null for the icon-only form. `count` is how many
 * marks the chip stands for; the chip draws it as a bare number only when
 * `text` is null and it is past one.
 */
export interface MarkRollupChip {
  text: string | null;
  count: number;
  state: MarkState;
}

export interface MarkRollup {
  flag: MarkRollupChip | null;
  fix: MarkRollupChip | null;
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
 * What the point row shows: at most one flag chip and one fix chip.
 *
 * The first chip keeps its words and the rest fold to icons, so a fix beside
 * a worded flag is icon-only. Past one of a kind the words give way to a
 * count — "N to check" for the flags still open, a bare number for fixes. A
 * quiet chip (nothing open; a fix on a checked point) has no words at all.
 * Shot marks count toward the point's totals.
 */
export function rollupMarks(
  pointMarks: readonly LabelMark[],
  shotMarks: readonly LabelMark[],
  states: MarkStates,
): MarkRollup {
  const all = [
    ...pointMarks.map((mark, i) => ({ mark, state: states.point[i] })),
    ...shotMarks.map((mark, i) => ({ mark, state: states.shots[i] })),
  ];
  const flags = all.filter((m) => m.mark.kind === "flag");
  const fixes = all.filter((m) => m.mark.kind === "fix");

  let flag: MarkRollupChip | null = null;
  if (flags.length > 0) {
    const open = flags.filter((m) => m.state === "open");
    flag = {
      text:
        open.length === 0
          ? null
          : open.length === 1
            ? MARK_LABEL[open[0].mark.code]
            : `${open.length} to check`,
      count: flags.length,
      state: mostOpen(flags.map((m) => m.state)),
    };
  }

  let fix: MarkRollupChip | null = null;
  if (fixes.length > 0) {
    const state = mostOpen(fixes.map((m) => m.state));
    const worded =
      fixes.length === 1 &&
      state === "settled" &&
      (flag?.text ?? null) === null;
    fix = {
      text: worded ? fixLabel(fixes[0].mark) : null,
      count: fixes.length,
      state,
    };
  }

  return { flag, fix, pencil: states.changed };
}
