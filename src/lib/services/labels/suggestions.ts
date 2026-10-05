/**
 * A suggestion's life, and the one thing about it that is stored.
 *
 * The marks module proposes (`marks.ts` `LabelSuggestion`): a stroke the
 * vendor probably never detected between two by one player, or a point
 * between two served from one side. Nothing is added for the labeller — the
 * black rail draws the proposal as a dashed row with two answers. "Add shot"
 * is the EXISTING add operation (`planAddedShot`, operations.ts), which
 * already times the new stroke at the pair's midpoint and credits the other
 * player; "Dismiss" appends the suggestion's key to `label_points.dismissed`,
 * the only column this module plans a write for.
 *
 * Whether a suggestion is still open is derived, never stored: it is `done`
 * once the point holds a live added stroke following the pair's first, and
 * `dismissed` once its key is on the point.
 *
 * Pure, and importable from the client bundle: the console runs
 * `applyDismiss` for its optimistic row and `suggestions-session.ts` runs
 * `planDismiss` before its write.
 */

import type { LabelSuggestion } from "./marks";
import type { Planned } from "./operations";
import type { LabelPoint, LabelShot } from "./session";

export type SuggestionState = "open" | "dismissed" | "done";

/** The two keys `label_points.dismissed` may hold. */
export const SUGGESTION_KEY_RE = /^(missing_shot:\d+|missing_point)$/;

export function isSuggestionKey(value: unknown): value is string {
  return typeof value === "string" && SUGGESTION_KEY_RE.test(value);
}

/** What a suggestion's state reads off its point. */
export type SuggestionPoint = Pick<LabelPoint, "dismissed"> & {
  shots: readonly Pick<LabelShot, "status" | "afterEventId">[];
};

const MISSING_SHOT_PREFIX = "missing_shot:";

/** The vendor stroke a `missing_shot` key names — the pair's first. */
function afterEventIdOf(key: string): number | null {
  if (!key.startsWith(MISSING_SHOT_PREFIX)) return null;
  const id = Number(key.slice(MISSING_SHOT_PREFIX.length));
  return Number.isInteger(id) ? id : null;
}

/**
 * Where a suggestion stands on its point.
 *
 * A `missing_shot` is `done` once a LIVE stroke the labeller added follows
 * the pair's first vendor stroke (`afterEventId` — what `planAddedShot`
 * writes for a stroke added after it). Deleting that added stroke opens the
 * suggestion again. Done outranks dismissed: the stroke is there either way.
 * A `missing_point` has no `done` here — adding the point is its own
 * operation — so it is open until dismissed.
 */
export function suggestionState(
  suggestion: Pick<LabelSuggestion, "kind" | "key">,
  point: SuggestionPoint,
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
