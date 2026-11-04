/**
 * "Submit for review": how a labeller hands a session over. The one status
 * write a labeller may make — Mark complete and Reopen are an admin's
 * (session-status-session.ts) — so the gate is `requireLabelActor` as every
 * row write has it: an admin, or the labeller the session is assigned to.
 *
 * Two writes, in this order. First a snapshot: one `label_submissions` row
 * whose `rows` holds the session's points, each with its strokes, exactly as
 * `readLabelSessionRows` builds them (labels-server.ts) — the baseline a
 * later review is diffed against, which is why it is taken before the status
 * moves and why it is never overwritten (Reopen leaves it; a second submit
 * adds a second row). Then the status: `submitted`, `submitted_at` with it
 * (the CHECK `label_sessions_submitted_check` holds the pair together) and
 * `labeller` set to whoever submitted, matched on `status = 'labelling'` so
 * two tabs cannot both submit; the loser is told the session changed and the
 * snapshot it wrote is left in place — the review reads the newest.
 *
 * Refused, before anything is written, on a session that is not open
 * (`checkSessionOpen`: `SUBMITTED` once handed in, `FROZEN` once published,
 * `PUBLISHING` while a lease is held). Never writes `matches`, `points` or
 * `shots`: nothing is published until an admin's Mark complete.
 */

import { readLabelSessionRows } from "@/lib/data/labels-server";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  ACTOR_REQUIRED,
  checkSessionOpen,
  defaultLabelWriteDependencies,
  racedMessage,
  type LabelWriteDependencies,
} from "./edit-session";
import { targetId } from "./label-actor";
import { normaliseId, type LabelOpResult } from "./operations-session";
import type { LabelSession } from "./session";

const LOG = "[labels:submit]";

export type LabelSubmitResult = LabelOpResult<{
  status: "submitted";
  /** The `label_submissions` row this call wrote. */
  submissionId: string;
}>;

/**
 * What the snapshot holds: the session's points in order, each carrying its
 * shots, as the console reads them. The session's own fields (score, hands,
 * scoring) are not labels and stay on `label_sessions`.
 */
interface LabelSubmissionRows {
  points: LabelSession["points"];
}

/**
 * The read the snapshot is taken from, injectable so the writer is tested
 * without a database. Null when there is no such session.
 */
type LabelSubmitRowsReader = (
  supabase: AdminClient,
  sessionId: string,
) => Promise<{ session: LabelSession } | null>;

const readRowsForSnapshot: LabelSubmitRowsReader = (supabase, sessionId) =>
  readLabelSessionRows(supabase, sessionId);

const RACED = racedMessage("session");

/** Snapshot the session's rows, then mark it submitted. Never throws. */
export async function writeLabelSubmit(params: {
  supabase: AdminClient;
  sessionId: unknown;
  /** Who submitted: `label_submissions.submitted_by` and `label_sessions.labeller`. */
  actorId: string;
  readRows?: LabelSubmitRowsReader;
  now?: () => number;
}): Promise<LabelSubmitResult> {
  const {
    supabase,
    actorId,
    readRows = readRowsForSnapshot,
    now = Date.now,
  } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const refused = await checkSessionOpen(supabase, sessionId);
  if (refused) return { error: refused };

  const read = await readRows(supabase, sessionId);
  if (!read) return { error: "Session not found." };
  const rows: LabelSubmissionRows = { points: read.session.points };
  const submittedAt = new Date(now()).toISOString();

  const { data: submission, error: insertError } = await supabase
    .from("label_submissions")
    .insert({
      session_id: sessionId,
      submitted_by: actorId,
      submitted_at: submittedAt,
      rows,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !submission) {
    return {
      error: `Could not submit the session: ${insertError?.message ?? "no row returned"}`,
    };
  }

  const { data: moved, error: updateError } = await supabase
    .from("label_sessions")
    .update({
      status: "submitted",
      submitted_at: submittedAt,
      labeller: actorId,
    })
    .eq("id", sessionId)
    .eq("status", "labelling")
    .select("id");
  if (updateError) {
    return { error: `Could not submit the session: ${updateError.message}` };
  }
  if (!moved || moved.length === 0) return { error: RACED };
  return { ok: true, status: "submitted", submissionId: submission.id };
}

export async function submitLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSubmitResult> {
  const actor = await deps.requireLabelActor({
    sessionId: targetId(sessionId),
  });
  if (!actor) return { error: ACTOR_REQUIRED };
  try {
    return await writeLabelSubmit({
      supabase: deps.createAdminClient(),
      sessionId,
      actorId: actor.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} submit threw`, { message });
    return { error: `Could not submit the session: ${message}` };
  }
}
