/**
 * The console header's "Mark complete" and "Reopen": the one column pair a
 * session's lifecycle lives in, `label_sessions.status` and `completed_at`
 * (a CHECK holds them together). Admin-gated like edit-session.ts; not the
 * marks gate — a session labelled blind completes like any other.
 *
 * Complete is the ordinary gate (`checkSessionOpen`), then a lease: ONE update
 * (`claim_label_publish_lease`) stamping `publishing_since` with the
 * database's clock, matched on `status = 'labelling'` and no fresh lease.
 * While it is held the session stays `labelling` but takes no edits
 * (the gate refuses them, and so does the database: a label row's write
 * share-locks its session row, so the lease waits for an edit already under
 * way — `20261010212629_label_publish_guards.sql`), no second Complete and
 * no Reopen (which needs `complete`). Then the publish — the labelled points
 * replace the match's (apply-session.ts), backed up first — and, matched on
 * the lease this call took, either `complete` or the lease released with the
 * reason. A publish killed mid-way leaves the session open with a lease that
 * lapses after `PUBLISH_LEASE_MS`, so Complete again finishes it.
 *
 * A publish also grants Verified by Advantage (docs/plans/advantage-review.md
 * step 1): after the points are in and before the session closes, the match
 * is verified by the admin who pressed it (`verify_match`, service role
 * only — the one door `zz_matches_guard_verification` leaves). A failed
 * verify is a failed Complete: the lease is released and Complete again
 * publishes and verifies again. `scripts/label-apply.ts` publishes by hand
 * and never verifies.
 *
 * Reopen leaves the published points as they are but removes Verified by
 * Advantage (`unverify_match`), after the status flips; a failed unverify
 * puts the session back to complete, so the console and the badge never
 * disagree. Completing again publishes and verifies again. Reopen reads the
 * status and writes the reverse, matched on `status = 'complete'`; the partial unique index that allows one open
 * session per job (`label_sessions_one_open_per_job`) refuses it while
 * another session of the match is open.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  PUBLISH_LEASE_MS,
  PUBLISHING,
  racedMessage,
  type LabelWriteDependencies,
} from "./edit-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import type { LabelSession } from "./session";

/** What a publish wrote, for the console's confirmation line. */
export interface LabelPublishSummary {
  points: number;
  shots: number;
  insightsRequested: boolean;
  /** What the publish went past: a point left out, or written partly. */
  leftOut?: string[];
}

export type LabelSessionStatusResult = LabelOpResult<{
  status: LabelSession["status"];
  published?: LabelPublishSummary;
}>;

/** The publish step, injectable so the writer is tested without a database. */
export type LabelPublish = (
  supabase: AdminClient,
  sessionId: string,
) => Promise<
  ({ ok: true } & LabelPublishSummary) | { ok: false; error: string }
>;

/**
 * Publish whatever is still open (decided 2026-10-18): a labelled score that
 * differs from the match record's, and points that cannot be written whole,
 * no longer stop it. The Mark complete confirm lists each one first
 * (`completeWarnings`) and the publish answers with what it left out.
 * From 2026-10-10 to then the console refused a mismatched score — a set
 * labelled 5–5 against a 6–4 record had reached every stat — so the confirm
 * is where that now has to be read.
 */
const publishCheckingScore: LabelPublish = async (supabase, sessionId) => {
  // Loaded on use: it reads through labels-server.ts.
  const { publishLabelSession } = await import("./apply-session");
  return publishLabelSession({ db: supabase, sessionId, acceptScore: true });
};

const RACED = racedMessage("session");
/** The unique index's refusal, as `seed-session.ts` reads it. */
const UNIQUE_VIOLATION = "23505";
export const ANOTHER_SESSION_OPEN =
  "Another labelling session is open for this match. Complete or remove it before reopening this one.";
const ALREADY_OPEN = "This session is already open for labelling.";

/** Publish a labelling session to its match, verify it, then close it. Never throws. */
export async function writeLabelSessionComplete(params: {
  supabase: AdminClient;
  sessionId: unknown;
  /** The admin who pressed Mark complete: `matches.verified_by`. */
  actorId: string;
  publish?: LabelPublish;
  now?: () => number;
}): Promise<LabelSessionStatusResult> {
  const {
    supabase,
    actorId,
    publish = publishCheckingScore,
    now = Date.now,
  } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const refused = await checkSessionOpen(supabase, sessionId);
  if (refused) return { error: refused };

  // The lease: taken only on an open session with no fresh lease on it, and
  // stamped by the database's clock — the one its guard checks it with.
  const { data: claimedAt, error } = await supabase.rpc(
    "claim_label_publish_lease",
    { p_session_id: sessionId },
  );
  if (error) {
    return { error: `Could not complete the session: ${error.message}` };
  }
  if (typeof claimedAt !== "string") return { error: PUBLISHING };

  let failure: string;
  try {
    const result = await publish(supabase, sessionId);
    const verified = result.ok
      ? await verifyMatchOf(supabase, sessionId, actorId)
      : null;
    if (!result.ok) {
      failure = result.error;
    } else if (!verified || "error" in verified) {
      failure = verified?.error ?? "Could not verify the match.";
    } else {
      const { data: closed, error: closeError } = await supabase
        .from("label_sessions")
        .update({
          status: "complete",
          completed_at: new Date(now()).toISOString(),
          publishing_since: null,
        })
        .eq("id", sessionId)
        .eq("publishing_since", claimedAt)
        .select("id");
      if (closeError) {
        // Verified by Advantage comes back off, so the match never shows it
        // beside a session that is still open. A race (below) is left
        // alone: the Complete that took the lease verifies for itself.
        const { error: unverifyError } = await supabase.rpc("unverify_match", {
          p_match_id: verified.matchId,
        });
        return {
          error: `The labels are published, but the session could not be marked complete: ${closeError.message}${unverifyError ? ` Verified by Advantage could not be removed either (${unverifyError.message}).` : ""}`,
        };
      }
      if (!closed || closed.length === 0) return { error: RACED };
      return {
        ok: true,
        status: "complete",
        published: {
          points: result.points,
          shots: result.shots,
          insightsRequested: result.insightsRequested,
          leftOut: result.leftOut ?? [],
        },
      };
    }
  } catch (err) {
    failure = `Could not publish the labels: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Not published, or not fully: release the lease so it can be retried.
  // Matched on this call's lease, so a later Complete's is never released.
  const { error: releaseError } = await supabase
    .from("label_sessions")
    .update({ publishing_since: null })
    .eq("id", sessionId)
    .eq("publishing_since", claimedAt);
  if (releaseError) {
    return {
      error: `${failure} The session stays held for up to ${PUBLISH_LEASE_MS / 60_000} minutes before it takes edits again (${releaseError.message}).`,
    };
  }
  return { error: failure };
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
    .select("status, match_id, completed_at")
    .eq("id", sessionId)
    .maybeSingle<{
      status: string;
      match_id: string;
      completed_at: string | null;
    }>();
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

  const { error: unverifyError } = await supabase.rpc("unverify_match", {
    p_match_id: session.match_id,
  });
  if (unverifyError) {
    // Back to complete, matched on the reopen this call made, so the match
    // never shows Verified by Advantage beside an open session.
    const { error: undoError } = await supabase
      .from("label_sessions")
      .update({ status: "complete", completed_at: session.completed_at })
      .eq("id", sessionId)
      .eq("status", "labelling");
    return {
      error: undoError
        ? `The session is open again, but Verified by Advantage could not be removed (${unverifyError.message}), and the session could not be put back (${undoError.message}).`
        : `Could not remove Verified by Advantage, so the session stays complete: ${unverifyError.message}`,
    };
  }
  return { ok: true, status: "labelling" };
}

/**
 * Verify the session's match as `actorId` (`verify_match`): the match it
 * verified, or the sentence Complete answers with.
 */
async function verifyMatchOf(
  supabase: AdminClient,
  sessionId: string,
  actorId: string,
): Promise<{ matchId: string } | { error: string }> {
  const { data: row, error: readError } = await supabase
    .from("label_sessions")
    .select("match_id")
    .eq("id", sessionId)
    .maybeSingle<{ match_id: string }>();
  if (readError || !row) {
    return {
      error: `The labels are published, but the match could not be marked Verified by Advantage: ${readError?.message ?? "session not found"}. Mark complete again to retry.`,
    };
  }
  const { error } = await supabase.rpc("verify_match", {
    p_match_id: row.match_id,
    p_actor: actorId,
  });
  if (error) {
    return {
      error: `The labels are published, but the match could not be marked Verified by Advantage: ${error.message}. Mark complete again to retry.`,
    };
  }
  return { matchId: row.match_id };
}

export function completeLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return gated(
    deps,
    (supabase, actor) =>
      writeLabelSessionComplete({ supabase, sessionId, actorId: actor.id }),
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
