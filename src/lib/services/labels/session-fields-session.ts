/**
 * The "Score doesn't add up" banner's two writes: "Fix the entered score"
 * stores the labelled sets as `label_sessions.final_score`; "Video ends early"
 * stores `label_sessions.video_ends_early = true`. Admin-gated like
 * edit-session.ts, with the marks gate (`checkSessionOpen` with `blind`); the
 * patch is validated first (`parseLabelSessionPatch`).
 *
 * Its one write is an UPDATE of `label_sessions` with the parsed patch, matched
 * on the id and on `status = 'labelling'`, so a session completed in another
 * tab meanwhile is not written under it. `matches` is never written.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  gated,
  normaliseId,
  racedMessage,
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
const RACED = racedMessage("session");

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

  const refused = await checkSessionOpen(supabase, sessionId, { blind: BLIND });
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
