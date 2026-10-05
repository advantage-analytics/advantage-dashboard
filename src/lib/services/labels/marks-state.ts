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
 * Pure, and importable from the client bundle: nothing from `next/`,
 * `components/` or a server file.
 */

import type { LabelMark, LabelSuggestion } from "./marks";
import { fixLabel, MARK_LABEL, markHover, type MarkNames } from "./marks-copy";
import type { LabelPoint, LabelShot } from "./session";

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
 * Where a mark is in its life. `shot` is the row a shot mark sits on; it only
 * matters when that row is not among `point.shots`.
 *
 * A fix is never `open`: the site already acted, so it is `settled` by nature
 * and `checked` once the point is.
 */
export function markState(
  mark: LabelMark,
  point: MarkStatePoint,
  shot?: MarkStateShot,
  suggestions?: readonly LabelSuggestion[],
): MarkState {
  const checked = point.checkedAt !== null;
  if (mark.kind === "fix") return checked ? "checked" : "settled";

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
 * the labeller did.
 */
export function stateHover(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
): string {
  if (mark.kind === "fix" || state === "open") return markHover(mark, names);
  const label = MARK_LABEL[mark.code];
  switch (state) {
    case "settled":
    case "checked":
      return `${label} · settled. You changed the ending to ${sentence}.`;
    case "checked-as-is":
      return `${label} · checked as is. You confirmed the point without changing it.`;
    case "dismissed":
      return `${label} · dismissed.`;
  }
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
): MarkStates {
  const stateOf = (mark: LabelMark) =>
    markState(mark, point, undefined, suggestions);
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
