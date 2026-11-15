/**
 * The admin's two answers to a labeller's publish ("Published, to check" in
 * the console, `20261114091835_label_publish_check.sql`): Check passes it,
 * Send back returns it to its labeller with a note.
 *
 * Both are admin-only (`requireAdminActor`, refused with `ADMIN_REQUIRED`)
 * and both are ONE update on `label_sessions`, matched on the state it acts
 * on, so a second tab or a racing Reopen finds nothing to match and is told
 * so. Only `analyst` sessions: a practice copy is graded, never published,
 * and the database keeps every check column off it.
 *
 * Neither touches the match. The labels a labeller published stay published
 * and Verified by Advantage stays on while the session is back with its
 * labeller (the owner's rule) — the opposite of Reopen
 * (session-status-session.ts), which calls `unverify_match`. The next publish
 * replaces the match's points as any publish does and lands in "Published, to
 * check" again, since Send back clears the check. `assigned_to` is not
 * touched: the labeller is whoever the session is assigned to.
 */

import { SEND_BACK_NOTE_MAX } from "@/lib/labels/send-back";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_REQUIRED,
  defaultLabelWriteDependencies,
  racedMessage,
  requireAdminActor,
  type LabelWriteDependencies,
} from "./edit-session";
import { targetId } from "./label-actor";
import { normaliseId } from "./operations-session";
import {
  ANOTHER_SESSION_OPEN,
  type LabelSessionStatusResult,
} from "./session-status-session";

/** What Check and Send back need; specs pass fakes and a fixed clock. */
export interface LabelCheckDependencies extends LabelWriteDependencies {
  now?: () => number;
}

const LOG = "[labels:check]";
const RACED = racedMessage("session");
/** The unique index's refusal: another session of the match is open. */
const UNIQUE_VIOLATION = "23505";

export { SEND_BACK_NOTE_MAX };
/** Check matched nothing: already checked, reopened, or never published. */
export const NOT_WAITING_FOR_CHECK =
  "This session is not waiting for a check. Reload to see where it stands.";
export const SEND_BACK_NOTE_REQUIRED =
  "Write a note for the labeller saying what to fix.";
export const SEND_BACK_NOTE_TOO_LONG = `Keep the note to ${SEND_BACK_NOTE_MAX} characters or fewer.`;
/**
 * Send back on a session nobody is assigned to: there is no labeller to read
 * the note, and a sent-back session is never offered for a claim, so it would
 * sit in In progress with nobody able to take it.
 */
export const SEND_BACK_NOBODY =
  "Nobody is assigned to this match, so there is no labeller to send it back to. Reopen it instead.";
/**
 * Send back on a session its assigned labeller never published (no
 * `label_submissions` row by them for it): an admin published the match
 * themselves, so the note would reach someone with nothing of theirs to fix.
 */
export const SEND_BACK_ADMIN_PUBLISHED =
  "An admin published this match, not its labeller, so there is nothing to send back. Reopen it instead.";

/** The trimmed note, or the sentence that refuses it. */
export function parseSendBackNote(
  note: unknown,
): { note: string } | { error: string } {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return { error: SEND_BACK_NOTE_REQUIRED };
  if (trimmed.length > SEND_BACK_NOTE_MAX) {
    return { error: SEND_BACK_NOTE_TOO_LONG };
  }
  return { note: trimmed };
}

/** The admin gate, the id check and the try/catch both writes share. */
async function adminWrite(
  sessionId: unknown,
  deps: LabelCheckDependencies,
  what: string,
  work: (
    supabase: AdminClient,
    id: string,
    actorId: string,
  ) => Promise<LabelSessionStatusResult>,
  validate?: () => string | null,
): Promise<LabelSessionStatusResult> {
  const actor = await requireAdminActor(deps, {
    sessionId: targetId(sessionId),
  });
  if (!actor) return { error: ADMIN_REQUIRED };
  const id = normaliseId(sessionId);
  if (!id) return { error: "Invalid session id." };
  const refused = validate?.() ?? null;
  if (refused) return { error: refused };
  try {
    return await work(deps.createAdminClient(), id, actor.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} ${what} threw`, { message });
    return { error: `Could not ${what}: ${message}` };
  }
}

/**
 * Check: pass a published session. Matched on a complete analyst session not
 * yet checked; anything else is `NOT_WAITING_FOR_CHECK`. Never throws.
 */
export function checkLabelSession(
  sessionId: unknown,
  deps: LabelCheckDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  const now = deps.now ?? Date.now;
  return adminWrite(
    sessionId,
    deps,
    "check the session",
    async (supabase, id, actorId) => {
      const { data, error } = await supabase
        .from("label_sessions")
        .update({
          checked_at: new Date(now()).toISOString(),
          checked_by: actorId,
        })
        .eq("id", id)
        .eq("status", "complete")
        .eq("kind", "analyst")
        .is("checked_at", null)
        .select("id");
      if (error) {
        return { error: `Could not check the session: ${error.message}` };
      }
      if (!data || data.length === 0) return { error: NOT_WAITING_FOR_CHECK };
      return { ok: true, status: "complete" };
    },
  );
}

/**
 * Send back: a published session (checked or not) back to `labelling` for
 * its labeller, with the admin's note. The check is cleared with the status
 * (`label_sessions_checked_needs_complete`). Refused with
 * `ANOTHER_SESSION_OPEN` when the match already has an open session, and
 * with `SEND_BACK_ADMIN_PUBLISHED` when its labeller never submitted it (an
 * admin published it). Never throws.
 */
export function sendBackLabelSession(
  sessionId: unknown,
  note: unknown,
  deps: LabelCheckDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  const now = deps.now ?? Date.now;
  const parsed = parseSendBackNote(note);
  return adminWrite(
    sessionId,
    deps,
    "send the session back",
    async (supabase, id, actorId) => {
      if ("error" in parsed) return parsed;
      // Only a labeller who published this session can be sent it back. The
      // update is pinned to what this read saw (its labeller and when it was
      // published), so a reassign or a reopen-and-republish landing between
      // the read and the write matches nothing and answers RACED, rather
      // than sending back a publish the check never looked at.
      const { data: session, error: sessionError } = await supabase
        .from("label_sessions")
        .select("status, assigned_to, completed_at")
        .eq("id", id)
        .maybeSingle<{
          status: string;
          assigned_to: string | null;
          completed_at: string | null;
        }>();
      if (sessionError) {
        return {
          error: `Could not send the session back: ${sessionError.message}`,
        };
      }
      // Not published (reopened in another tab, or gone): nothing to send back.
      if (session?.status !== "complete") return { error: RACED };
      if (!session.assigned_to) return { error: SEND_BACK_NOBODY };
      const { data: submitted, error: submittedError } = await supabase
        .from("label_submissions")
        .select("id")
        .eq("session_id", id)
        .eq("submitted_by", session.assigned_to)
        .limit(1);
      if (submittedError) {
        return {
          error: `Could not send the session back: ${submittedError.message}`,
        };
      }
      if (!submitted || submitted.length === 0) {
        return { error: SEND_BACK_ADMIN_PUBLISHED };
      }
      const update = supabase
        .from("label_sessions")
        .update({
          status: "labelling",
          completed_at: null,
          checked_at: null,
          checked_by: null,
          sent_back_at: new Date(now()).toISOString(),
          sent_back_by: actorId,
          sent_back_note: parsed.note,
        })
        .eq("id", id)
        .eq("status", "complete")
        .eq("kind", "analyst")
        .eq("assigned_to", session.assigned_to);
      const { data, error } = await (
        session.completed_at
          ? update.eq("completed_at", session.completed_at)
          : update.is("completed_at", null)
      ).select("id");
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          return { error: ANOTHER_SESSION_OPEN };
        }
        return {
          error: `Could not send the session back: ${error.message}`,
        };
      }
      if (!data || data.length === 0) {
        // Say which: nobody to send it to, or it moved under us.
        const { data: row } = await supabase
          .from("label_sessions")
          .select("status, assigned_to")
          .eq("id", id)
          .maybeSingle<{ status: string; assigned_to: string | null }>();
        return row?.status === "complete" && row.assigned_to === null
          ? { error: SEND_BACK_NOBODY }
          : { error: RACED };
      }
      return { ok: true, status: "labelling" };
    },
    () => ("error" in parsed ? parsed.error : null),
  );
}
