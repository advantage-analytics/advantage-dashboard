/**
 * The court panel's review answers, made: each `ReviewWrite` of an answer
 * (review-step.ts) through the console's own handler for it, in order. The
 * panel only draws the answers; the console hands it `onAnswer`, which runs
 * this with its handlers. Pure apart from the calls, so a spec can hold the
 * mapping.
 */

import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import type {
  ReviewAnswer,
  ReviewSlot,
  ReviewWrite,
} from "@/lib/services/labels/review-step";

/** The console's writes, by the handler each `ReviewWrite` names. */
export interface ReviewWriteHandlers {
  /** `onPatchShot` — the rail's shot edit. */
  patchShot: (shotId: string, patch: LabelShotPatch) => unknown;
  /** `onPatchPoint`. */
  patchPoint: (pointId: string, patch: LabelPointPatch) => unknown;
  /** `operations.onSplitPoint`. */
  splitPoint: (pointId: string, shotId: string) => unknown;
  /** `onRemoveShotsAfter`. */
  removeShotsAfter: (pointId: string, shotId: string) => unknown;
  /** `operations.onDismissSuggestion` — one call a key. */
  dismissSuggestion: (pointId: string, key: string) => unknown;
  /** `operations.onSetChecked`. */
  setChecked: (pointId: string, checked: boolean) => unknown;
  /**
   * The console's add-shot path, which selects the saved stroke for
   * placement; `follow` is written to it once it has saved.
   */
  addShot: (
    pointId: string,
    afterShotId: string | null,
    follow?: LabelShotPatch,
  ) => unknown;
}

/**
 * What a slot says of the stroke it adds beyond what the add plans: its
 * hitter and its stroke, where the slot names them (a second serve, by the
 * server). Undefined with nothing to say.
 */
export function slotFollowPatch(slot: ReviewSlot): LabelShotPatch | undefined {
  const patch: LabelShotPatch = {};
  if (slot.hitter !== null) patch.hitter = slot.hitter;
  if (slot.kind !== null) patch.stroke = slot.kind;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/** One write, through its handler. */
export function runReviewWrite(
  write: ReviewWrite,
  pointId: string,
  handlers: ReviewWriteHandlers,
): unknown {
  switch (write.write) {
    case "shot":
      return handlers.patchShot(write.shotId, write.patch);
    case "point":
      return handlers.patchPoint(pointId, write.patch);
    case "split":
      return handlers.splitPoint(pointId, write.shotId);
    case "removeAfter":
      return handlers.removeShotsAfter(pointId, write.shotId);
    case "dismiss":
      for (const key of write.keys) handlers.dismissSuggestion(pointId, key);
      return undefined;
    case "check":
      return handlers.setChecked(pointId, true);
    case "addShot":
      return handlers.addShot(
        pointId,
        write.slot.afterShotId,
        slotFollowPatch(write.slot),
      );
  }
}

/**
 * An answer's writes, in order, each waiting on the one before when that
 * one is a save in flight — a shot's result lands before the ending it
 * leads to.
 */
export async function runReviewAnswer(
  answer: Pick<ReviewAnswer, "writes">,
  pointId: string,
  handlers: ReviewWriteHandlers,
): Promise<void> {
  for (const write of answer.writes) {
    await runReviewWrite(write, pointId, handlers);
  }
}
