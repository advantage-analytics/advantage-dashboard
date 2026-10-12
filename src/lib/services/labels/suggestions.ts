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

import type { LabelSuggestion } from "./marks";
import type { Planned } from "./operations";
import { isMissedResult, type LabelPoint, type LabelShot } from "./session";
import { effectiveShotResult, type ResultReadableShot } from "./shot-derived";

export type SuggestionState = "open" | "dismissed" | "done";

/**
 * The keys `label_points.dismissed` may hold: a missing shot (by the pair's
 * first event), a missing point, and "Point ended here" (by the stroke the
 * point ended on, `pointEndedKey`) — never a draft stroke's temporary id,
 * which the stroke loses once its insert lands.
 */
export const SUGGESTION_KEY_RE =
  /^(missing_shot:\d+|missing_point|point_ended:(?!pending-)[0-9A-Za-z-]+)$/;

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
 * or net (`effectiveShotResult`, so placed coordinates win): the point ended
 * on it. Done outranks dismissed: the stroke is there either way.
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
    // The pair's first ball out or in the net: the point ended on it, the
    // second stroke was a swing at a dead ball, and nothing is missing.
    if (
      after !== null &&
      point.shots.some(
        (shot) =>
          shot.status !== "deleted" &&
          shot.eventId === after &&
          isMissedResult(effectiveShotResult(shot)),
      )
    ) {
      return "done";
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
