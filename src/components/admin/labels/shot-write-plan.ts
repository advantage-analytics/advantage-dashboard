import {
  applyLabelShotPatch,
  letResultError,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelShot } from "@/lib/services/labels/session";

/**
 * What a shot write comes to before anything is shown or sent: the refusal
 * (a let on a stroke that is not a serve) or the row as the patch leaves it.
 */
export function planShotWrite(
  before: LabelShot,
  patch: LabelShotPatch,
): { error: string } | { row: LabelShot } {
  const error = letResultError(patch, before);
  return error ? { error } : { row: applyLabelShotPatch(before, patch) };
}
