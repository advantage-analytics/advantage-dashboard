/**
 * The console header's "Mark complete" and "Reopen": the one column pair a
 * session's lifecycle lives in, `label_sessions.status` and `completed_at`
 * (a CHECK holds them together). Admin-gated like edit-session.ts; not the
 * marks gate — a session labelled blind completes like any other.
 *
 * Complete is the ordinary gate (`checkSessionOpen`) and ONE update matched
 * on the id and on `status = 'labelling'`, so a session another tab already
 * completed is not written twice. Reopen reads the status and writes the
 * reverse, matched on `status = 'complete'`; the partial unique index that
 * allows one open session per job (`label_sessions_one_open_per_job`)
 * refuses it while another session of the match is open. Nothing else is
 * ever written.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  racedMessage,
  type LabelWriteDependencies,
} from "./edit-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import type { LabelSession } from "./session";

export type LabelSessionStatusResult = LabelOpResult<{
  status: LabelSession["status"];
}>;

const RACED = racedMessage("session");
/** The unique index's refusal, as `seed-session.ts` reads it. */
const UNIQUE_VIOLATION = "23505";
export const ANOTHER_SESSION_OPEN =
  "Another labelling session is open for this match. Complete or remove it before reopening this one.";
const ALREADY_OPEN = "This session is already open for labelling.";

/** Close a labelling session. Never throws. */
export async function writeLabelSessionComplete(params: {
  supabase: AdminClient;
  sessionId: unknown;
}): Promise<LabelSessionStatusResult> {
  const { supabase } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const refused = await checkSessionOpen(supabase, sessionId);
  if (refused) return { error: refused };

  const { data, error } = await supabase
    .from("label_sessions")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "labelling")
    .select("id");
  if (error) {
    return { error: `Could not complete the session: ${error.message}` };
  }
  if (!data || data.length === 0) return { error: RACED };
  return { ok: true, status: "complete" };
}

/** Open a complete session for labelling again. Never throws. */
export async function writeLabelSessionReopen(params: {
  supabase: AdminClient;
  sessionId: unknown;
}): Promise<LabelSessionStatusResult> {
  const { supabase } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const { data: session, error: readError } = await supabase
    .from("label_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle<{ status: string }>();
  if (readError) {
    return { error: `Could not read the session: ${readError.message}` };
  }
  if (!session) return { error: "Session not found." };
  if (session.status !== "complete") return { error: ALREADY_OPEN };

  const { data, error } = await supabase
    .from("label_sessions")
    .update({ status: "labelling", completed_at: null })
    .eq("id", sessionId)
    .eq("status", "complete")
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: ANOTHER_SESSION_OPEN };
    return { error: `Could not reopen the session: ${error.message}` };
  }
  if (!data || data.length === 0) return { error: RACED };
  return { ok: true, status: "labelling" };
}

export function completeLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelSessionComplete({ supabase, sessionId }),
    "complete the session",
  );
}

export function reopenLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelSessionReopen({ supabase, sessionId }),
    "reopen the session",
  );
}
