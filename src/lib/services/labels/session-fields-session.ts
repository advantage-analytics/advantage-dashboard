/**
 * The "Score doesn't add up" banner's two writes, admin-gated (board 08m,
 * `BANNER`): "Fix the entered score" stores the labelled sets as
 * `label_sessions.final_score`; "Video ends early" stores
 * `label_sessions.video_ends_early = true`.
 *
 * Same shape as suggestions-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a `complete`
 * session and one whose `marks_enabled` is false (`checkSessionOpenWithMarks`,
 * the gate every marks write shares — the ground-truth match is never written
 * from here) and validates the patch with the pure rule
 * (`parseLabelSessionPatch`) before touching anything.
 *
 * Its ONE write is an UPDATE of `label_sessions` with the parsed patch and
 * nothing else, matched on the id AND on `status = 'labelling'`, so a session
 * completed in another tab meanwhile is not written under it. No other
 * table — `matches` is read elsewhere and written nowhere in labels code —
 * no other column, no row removed. `tests/label-operations.spec.ts` scans
 * this file for a removal call.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  checkSessionOpenWithMarks,
  gated,
  normaliseId,
  type LabelOpResult,
} from "./operations-session";
import {
  parseLabelSessionPatch,
  type LabelSessionFieldsPatch,
} from "./session-fields";

export type LabelSessionFieldsResult = LabelOpResult<{
  /** What was written, as the table spells it. */
  fields: LabelSessionFieldsPatch;
}>;

const BLIND =
  "This session is labelled without the site's marks, so its score is not held against the entered one.";
const RACED = "This session changed in another tab. Reload to see it.";

/** Validate, check the session, write the one row. Never throws. */
export async function writeLabelSessionFields(params: {
  supabase: AdminClient;
  sessionId: unknown;
  patch: unknown;
}): Promise<LabelSessionFieldsResult> {
  const { supabase } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const parsed = parseLabelSessionPatch(params.patch);
  if ("error" in parsed) return parsed;

  const refused = await checkSessionOpenWithMarks(supabase, sessionId, BLIND);
  if (refused) return { error: refused };

  const { data, error } = await supabase
    .from("label_sessions")
    .update(parsed.patch)
    .eq("id", sessionId)
    .eq("status", "labelling")
    .select("id");
  if (error) return { error: `Could not save the score: ${error.message}` };
  if (!data || data.length === 0) return { error: RACED };
  return { ok: true, fields: parsed.patch };
}

/** The admin-gated entry point behind `updateLabelSessionFieldsAction`. */
export function updateLabelSessionFields(
  sessionId: unknown,
  patch: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionFieldsResult> {
  return gated(
    deps,
    (supabase) => writeLabelSessionFields({ supabase, sessionId, patch }),
    "save the score",
  );
}
