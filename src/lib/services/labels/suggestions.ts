/**
 * A suggestion's life, and the one thing about it that is stored.
 *
 * The marks module proposes (`marks.ts` `LabelSuggestion`): a stroke the vendor
 * probably never detected between two by one player, or a point between two
 * served from one side. "Add shot" is the existing add operation
 * (`planAddedShot`); "Dismiss" appends the suggestion's key to
 * `label_points.dismissed`, the only column this module plans a write for.
 * Whether a suggestion is still open is derived (`suggestionState`).
 *
 * Pure: the console runs `applyDismiss` and `suggestions-session.ts` runs
 * `planDismiss`.
 */

import { MAX_DEAD_TAIL } from "../splitstep/derivation/flags";
import type { LabelSuggestion } from "./marks";
import type { Planned } from "./operations";
import { isMissedResult, type LabelPoint, type LabelShot } from "./session";
import { effectiveShotResult, type ResultReadableShot } from "./shot-derived";

export type SuggestionState = "open" | "dismissed" | "done";

/**
 * The keys `label_points.dismissed` may hold: a missing shot (by the pair's
 * first event), a missing point, and "Point ended here" (by the stroke the
 * point ended on, `pointEndedKey`) — never a draft stroke's temporary id,
 * which the stroke loses once its insert lands — and any other hint the well
 * draws as a question, by its code (`hintDismissKey`): "Was the last ball
 * in?", "Second serve?", "Different ending?".
 */
export const SUGGESTION_KEY_RE =
  /^(missing_shot:\d+|missing_point|point_ended:(?!pending-)[0-9A-Za-z-]+|hint:[a-z_]+)$/;

/** A hint the labeller answered "no" to, as `dismissed` stores it. */
export function hintDismissKey(code: string): string {
  return `hint:${code}`;
}

/** "Point ended here" on the stroke `shotId`, as `dismissed` stores it. */
export function pointEndedKey(shotId: string): string {
  return `point_ended:${shotId}`;
}

export function isSuggestionKey(value: unknown): value is string {
  return typeof value === "string" && SUGGESTION_KEY_RE.test(value);
}

/** What a suggestion's state reads off its point. */
export type SuggestionPoint = Pick<LabelPoint, "dismissed"> & {
  /** Read for a `missing_point`: a replayed let answers it. Optional for a shot's. */
  ending?: LabelPoint["ending"];
  /**
   * `eventId` and the result columns are read for a `missing_shot` alone: the
   * pair's first stroke ruled out or in the net answers it.
   */
  shots: readonly (Pick<LabelShot, "status" | "afterEventId"> &
    Partial<Pick<LabelShot, "eventId">> &
    ResultReadableShot)[];
};

/** What `addedPointBetween` reads of the session's rows, in rail order. */
export type SuggestionNeighbour = Pick<LabelPoint, "id" | "status">;

/**
 * The two ids a `missing_point` is read against — the suggestion's own
 * `pointId` (the flagged point) and `beforePointId`. Optional so a bare
 * `{ kind, key }` still has a state: without them, or without `points`, the
 * add cannot be seen and only a let or a dismissal answers it.
 */
type StatefulSuggestion = Pick<LabelSuggestion, "kind" | "key"> & {
  pointId?: string;
  beforePointId?: string;
};

export const MISSING_SHOT_PREFIX = "missing_shot:";

/** The vendor stroke a `missing_shot` key names — the pair's first. */
function afterEventIdOf(key: string): number | null {
  if (!key.startsWith(MISSING_SHOT_PREFIX)) return null;
  const id = Number(key.slice(MISSING_SHOT_PREFIX.length));
  return Number.isInteger(id) ? id : null;
}

/**
 * Whether a LIVE point the labeller added sits strictly between `beforeId`
 * and `afterId` in `points` (the rows in rail order) — what "Add point" puts
 * there. False when either is missing or they are not in that order.
 */
export function addedPointBetween(
  points: readonly SuggestionNeighbour[],
  beforeId: string,
  afterId: string,
): boolean {
  const a = points.findIndex((point) => point.id === beforeId);
  const b = points.findIndex((point) => point.id === afterId);
  if (a === -1 || b === -1 || b <= a) return false;
  return points.slice(a + 1, b).some((point) => point.status === "added");
}

/**
 * Where a suggestion stands on its point.
 *
 * A `missing_shot` is `done` once a LIVE stroke the labeller added follows
 * the pair's first vendor stroke (`afterEventId` — what `planAddedShot`
 * writes for a stroke added after it). Deleting that added stroke opens the
 * suggestion again. It is `done` too once the pair's first stroke reads out
 * or net (`effectiveShotResult`, so placed coordinates win) with no more than
 * `MAX_DEAD_TAIL` live strokes after it: the point ended on it. A miss deeper
 * in the rally answers nothing — the rally went on, so the vendor's bounce
 * was wrong, not the gap. Done outranks dismissed: the stroke is there
 * either way.
 *
 * A `missing_point` is `done` once the flagged point's ending is
 * `let_replayed` — the second serve from that side was the same point played
 * again, so nothing is missing — or once a live added point sits between the
 * two (`addedPointBetween`, which needs the session's `points`). Deleting
 * that added point opens the suggestion again.
 */
export function suggestionState(
  suggestion: StatefulSuggestion,
  point: SuggestionPoint,
  points?: readonly SuggestionNeighbour[],
): SuggestionState {
  if (suggestion.kind === "missing_shot") {
    const after = afterEventIdOf(suggestion.key);
    if (
      after !== null &&
      point.shots.some(
        (shot) => shot.status === "added" && shot.afterEventId === after,
      )
    ) {
      return "done";
    }
    // The pair's first ball out or in the net AT THE POINT'S END: the point
    // ended on it, the second stroke was a swing at a dead ball, and nothing
    // is missing. Only while at most `MAX_DEAD_TAIL` live strokes follow it —
    // a "miss" three or more strokes before the rally's end is a mis-tracked
    // bounce (both coordinates read on the hitter's side), not an ending, and
    // the gap after it is still in question.
    if (after !== null) {
      const live = point.shots.filter((shot) => shot.status !== "deleted");
      const at = live.findIndex((shot) => shot.eventId === after);
      if (
        at !== -1 &&
        isMissedResult(effectiveShotResult(live[at])) &&
        live.length - 1 - at <= MAX_DEAD_TAIL
      ) {
        return "done";
      }
    }
  } else {
    if (point.ending === "let_replayed") return "done";
    if (
      points &&
      suggestion.pointId !== undefined &&
      suggestion.beforePointId !== undefined &&
      addedPointBetween(points, suggestion.beforePointId, suggestion.pointId)
    ) {
      return "done";
    }
  }
  return point.dismissed.includes(suggestion.key) ? "dismissed" : "open";
}

/** The one column Dismiss writes: the array read, plus the key. */
export interface DismissWrite {
  dismissed: string[];
}

/**
 * Dismiss a suggestion: an error unless `key` is one of the two shapes the
 * column holds, and unless it is not there yet — a second Dismiss would write
 * the same array and report a change nobody made.
 */
export function planDismiss(
  point: Pick<LabelPoint, "dismissed">,
  key: unknown,
): Planned<DismissWrite> {
  if (!isSuggestionKey(key)) {
    return { error: "That is not a suggestion this point can dismiss." };
  }
  if (point.dismissed.includes(key)) {
    return { error: "This suggestion is already dismissed." };
  }
  return { ok: true, write: { dismissed: [...point.dismissed, key] } };
}

/** The console's row after Dismiss; unchanged when the plan refuses. */
export function applyDismiss(point: LabelPoint, key: string): LabelPoint {
  const plan = planDismiss(point, key);
  if ("error" in plan) return point;
  return { ...point, dismissed: plan.write.dismissed };
}
