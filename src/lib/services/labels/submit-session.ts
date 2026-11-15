/**
 * Submit: how a labeller hands a session over. The gate is `requireLabelActor`
 * as every row write has it: an admin, or the labeller the session is
 * assigned to.
 *
 * A real session is PUBLISHED by its submit (`submitLabelSession`): it goes
 * through `writeLabelSessionComplete` (session-status-session.ts), the one
 * function Mark complete calls, so there is one lease, one publish, one
 * `verify_match` and one request for the AI summary. Submit adds only the
 * snapshot, taken under the lease and before the publish (`beforePublish`),
 * and says whether the close also counts as an admin's check (`checked`): it
 * does when an admin pressed it, and a labeller's publish waits for one.
 *
 * A practice copy (practice-session.ts) is never published. Its submit is
 * `writeLabelSubmit`, two writes in this order. First the snapshot, then the
 * status: `submitted`, `submitted_at` with it (the CHECK
 * `label_sessions_submitted_check` holds the pair together) and `labeller`
 * set to whoever submitted, matched on `status = 'labelling'` so two tabs
 * cannot both submit; the loser is told the session changed and the snapshot
 * it wrote is left in place — the review reads the newest. It never writes
 * `matches`, `points` or `shots` and never calls a function.
 *
 * The snapshot is one `label_submissions` row whose `rows` holds the
 * session's points, each with its strokes, exactly as `readLabelSessionRows`
 * builds them (labels-server.ts) — the baseline a later review is diffed
 * against. It is never overwritten: Reopen leaves it, a second submit adds a
 * second row, and a publish that is refused after it leaves it in place.
 *
 * Refused, before anything is written, on a session that is not open
 * (`checkSessionOpen`: `SUBMITTED` once handed in, `FROZEN` once published,
 * `PUBLISHING` while a lease is held).
 */

import { readLabelSessionRows } from "@/lib/data/labels-server";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  ACTOR_REQUIRED,
  checkSessionOpen,
  defaultLabelWriteDependencies,
  FROZEN,
  PRACTICE_NEVER_PUBLISHED,
  PUBLISHING,
  racedMessage,
  SUBMITTED,
  type LabelWriteDependencies,
} from "./edit-session";
import { targetId } from "./label-actor";
import { normaliseId, type LabelOpResult } from "./operations-session";
import type { LabelSession } from "./session";
import { forLabeller } from "./strip-ids";
import {
  ANOTHER_SESSION_OPEN,
  writeLabelSessionComplete,
  type LabelPublish,
  type LabelSessionStatusResult,
} from "./session-status-session";

const LOG = "[labels:submit]";

/** A labeller's publish failed for a reason that is not a refusal. */
export const SUBMIT_PUBLISH_FAILED =
  "Something went wrong publishing. Your work is saved; try again, or ask an admin.";
/** The same for a practice copy, which is submitted, never published. */
export const SUBMIT_PRACTICE_FAILED =
  "Something went wrong submitting. Your work is saved; try again, or ask an admin.";

/**
 * The refusals a labeller reads as they are: the gate's, a race, and the
 * publish gate's own sentences (each begins "Not published: "). The publish's
 * failures after the gate ("Not published — the write failed …", a failed
 * verify or rebuild) are not among them.
 *
 * Matched by sentence, so `tests/label-submit-refusals.spec.ts` reads every
 * refusal the submit path's modules can return and fails until a new or
 * reworded one is placed on one side of this line or the other.
 */
const BUSINESS = new Set<string>([
  ACTOR_REQUIRED,
  FROZEN,
  SUBMITTED,
  PUBLISHING,
  PRACTICE_NEVER_PUBLISHED,
  ANOTHER_SESSION_OPEN,
  racedMessage("session"),
  racedMessage("row"),
  "Invalid session id.",
  "Session not found.",
]);

export function isBusinessRefusal(sentence: string): boolean {
  return BUSINESS.has(sentence) || sentence.startsWith("Not published: ");
}

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

/**
 * The snapshot both submits write: one `label_submissions` row holding the
 * session's points as they stand, by `actorId`. Its id, or the sentence the
 * submit answers with. The caller has already passed the session's gate.
 */
async function insertLabelSubmission(params: {
  supabase: AdminClient;
  sessionId: string;
  actorId: string;
  submittedAt: string;
  readRows: LabelSubmitRowsReader;
}): Promise<{ id: string } | { error: string }> {
  const { supabase, sessionId, actorId, submittedAt, readRows } = params;
  const read = await readRows(supabase, sessionId);
  if (!read) return { error: "Session not found." };
  const rows: LabelSubmissionRows = { points: read.session.points };

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
  return { id: submission.id };
}

/**
 * A practice copy's submit: snapshot the session's rows, then mark it
 * submitted. Never publishes. Never throws.
 */
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

  const submittedAt = new Date(now()).toISOString();
  const submission = await insertLabelSubmission({
    supabase,
    sessionId,
    actorId,
    submittedAt,
    readRows,
  });
  if ("error" in submission) return submission;

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

/**
 * A refusal as the actor may read it. An admin reads it whole. A labeller
 * reads a business refusal with its ids struck out, and anything else as
 * `fallback`, the raw text logged (`forLabeller`).
 */
function answerFor(
  actor: { kind: string },
  result: LabelSessionStatusResult,
  fallback: string,
  sessionId: string | null,
): LabelSessionStatusResult {
  if (actor.kind === "admin" || !("error" in result)) return result;
  return {
    error: forLabeller(result.error, {
      isBusiness: isBusinessRefusal,
      fallback,
      log: LOG,
      context: { sessionId },
    }),
  };
}

/** What a spec swaps in for the publish, the snapshot's read and the clock. */
export interface LabelSubmitOverrides {
  publish?: LabelPublish;
  readRows?: LabelSubmitRowsReader;
  now?: () => number;
}

/**
 * Submit a session. A practice copy is snapshotted and marked `submitted`
 * (`writeLabelSubmit`); every other session is snapshotted and published
 * (`writeLabelSessionComplete`), by the gate's actor, and counted as checked
 * only when that actor is an admin. Never throws.
 */
export async function submitLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
  overrides: LabelSubmitOverrides = {},
): Promise<LabelSessionStatusResult> {
  const actor = await deps.requireLabelActor({
    sessionId: targetId(sessionId),
  });
  if (!actor) return { error: ACTOR_REQUIRED };
  const { publish, readRows = readRowsForSnapshot, now = Date.now } = overrides;
  try {
    const supabase = deps.createAdminClient();
    const id = normaliseId(sessionId);
    if (!id) return { error: "Invalid session id." };

    const { data: session, error: kindError } = await supabase
      .from("label_sessions")
      .select("kind")
      .eq("id", id)
      .maybeSingle<{ kind?: string | null }>();
    if (kindError) {
      return answerFor(
        actor,
        { error: `Could not read the session: ${kindError.message}` },
        SUBMIT_PUBLISH_FAILED,
        id,
      );
    }
    if (!session) return { error: "Session not found." };

    if (session.kind === "practice") {
      const submitted = await writeLabelSubmit({
        supabase,
        sessionId: id,
        actorId: actor.id,
        readRows,
        now,
      });
      return answerFor(
        actor,
        "error" in submitted
          ? submitted
          : { ok: true, status: submitted.status },
        SUBMIT_PRACTICE_FAILED,
        id,
      );
    }

    const published = await writeLabelSessionComplete({
      supabase,
      sessionId: id,
      actorId: actor.id,
      checked: actor.kind === "admin",
      publish,
      now,
      // Under the lease, so the rows cannot move between the snapshot and
      // the publish that reads them.
      beforePublish: async (db, leased) => {
        try {
          const submission = await insertLabelSubmission({
            supabase: db,
            sessionId: leased,
            actorId: actor.id,
            submittedAt: new Date(now()).toISOString(),
            readRows,
          });
          return "error" in submission ? submission.error : null;
        } catch (err) {
          return `Could not submit the session: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    });
    return answerFor(actor, published, SUBMIT_PUBLISH_FAILED, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} submit threw`, { message });
    return answerFor(
      actor,
      { error: `Could not submit the session: ${message}` },
      SUBMIT_PUBLISH_FAILED,
      normaliseId(sessionId),
    );
  }
}
