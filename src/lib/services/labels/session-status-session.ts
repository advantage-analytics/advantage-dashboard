/**
 * The console header's "Mark complete" and "Reopen": the one column pair a
 * session's lifecycle lives in, `label_sessions.status` and `completed_at`
 * (a CHECK holds them together). Admin-only, unlike the row writes: both entry
 * points refuse any actor whose `kind` is not `admin` (`requireAdminActor`)
 * with `ADMIN_REQUIRED`. Not the marks gate — a session labelled blind
 * completes like any other.
 *
 * A labeller publishes too, but through their own door: Submit
 * (submit-session.ts) calls `writeLabelSessionComplete` here, with its
 * snapshot as `beforePublish` and without `checked`. So the lease, the
 * publish, the verify and the close below are the one path either way; what
 * differs is the close's `checked_at` / `checked_by`, written only when the
 * publish is an admin's (`20261114091835_label_publish_check.sql`).
 *
 * Complete is the ordinary gate (`checkSessionOpen`), then a lease: ONE update
 * (`claim_label_publish_lease`) stamping `publishing_since` with the
 * database's clock, matched on `status in ('labelling', 'submitted')` and no
 * fresh lease. A `submitted` session (submit-session.ts) is the one the gate
 * lets through here and nowhere else (`allowSubmitted`): the admin has
 * reviewed it read-only and Mark complete publishes it as it stands. The close
 * clears `submitted_at` with the status (the CHECK
 * `label_sessions_submitted_check` holds the pair together); the
 * `label_submissions` row keeps the time it was handed in.
 * While it is held the session stays as it was but takes no edits
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
 * publishes and verifies again. The publish itself takes an earlier Verified
 * by Advantage off (a Reopen keeps it) just before it deletes the old points
 * (`publishPlanned`, apply-session.ts), so whatever stops it after that — a
 * failed rebuild, a failed verify, a crash or a timeout — leaves the match
 * unverified, never verified over points nobody checked; only `verify_match`
 * puts the badge back. `scripts/label-apply.ts` publishes by hand
 * and never verifies. The AI summary is asked for after that verify, failed or
 * not: generate-insights reads whether errors were judged off `verified`, so
 * asked any sooner it could save an "errors" summary on a judged match.
 *
 * Reopen leaves the match alone: the published points stay, and so does
 * Verified by Advantage (the owner's rule, 2026-11-16 — as Send back in
 * check-session.ts). Edits in the reopened session reach the athlete only
 * when Complete publishes them, so until then the badge still describes
 * exactly what the athlete reads; taking it off would also show "Verification
 * pending … from the automatic analysis", which is false of hand labels, and
 * lift the lock that refuses a re-analysis of a verified match. Completing
 * again publishes and re-stamps `verified_at` (`verify_match`). The admin's
 * check (`checked_at`, `checked_by`) is cleared with the status, since a
 * CHECK allows it on a complete session only. Reopen is one update matched on
 * `status = 'complete'`; the partial unique index that allows one open
 * session per job (`label_sessions_one_open_per_job`) refuses it while
 * another session of the match is open.
 *
 * Reopen from `submitted` is the smaller move: back to `labelling` with
 * `submitted_at` cleared, matched on `status = 'submitted'`, so the assigned
 * labeller may edit again. The unique index cannot refuse it (the session
 * already held the job). The submission row stays, for the diff a later
 * review draws.
 */

import { requestMatchInsights } from "@/lib/services/splitstep/request-insights";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_REQUIRED,
  checkSessionOpen,
  defaultLabelWriteDependencies,
  PUBLISH_LEASE_MS,
  PUBLISHING,
  racedMessage,
  requireAdminActor,
  type LabelWriteDependencies,
} from "./edit-session";
import { targetId } from "./label-actor";
import { normaliseId, type LabelOpResult } from "./operations-session";
import type { LabelSession } from "./session";

/** What a publish wrote, for the console's confirmation line. */
export interface LabelPublishSummary {
  points: number;
  shots: number;
  insightsRequested: boolean;
  /** What the publish went past: a point left out, or written partly. */
  leftOut?: string[];
  /**
   * Every error was marked forced or unforced (apply-session.ts
   * `planApply`). Passed to `verify_match` as `p_errors_judged`; absent reads
   * as false, which leaves `matches.errors_judged_at` as the publish set it.
   */
  errorsJudged?: boolean;
}

export type LabelSessionStatusResult = LabelOpResult<{
  status: LabelSession["status"];
  published?: LabelPublishSummary;
}>;

/**
 * The publish step, injectable so the writer is tested without a database. It
 * does not ask for the AI summary (`deferInsights`): the writer does, after
 * `verify_match`, and reports that answer as `insightsRequested`.
 */
export type LabelPublish = (
  supabase: AdminClient,
  sessionId: string,
) => Promise<
  | ({ ok: true } & Omit<LabelPublishSummary, "insightsRequested">)
  | { ok: false; error: string }
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

/**
 * A step run under the publish lease, before the publish (the submit's
 * snapshot): null to go on, or the sentence that stops it.
 */
export type LabelBeforePublish = (
  supabase: AdminClient,
  sessionId: string,
) => Promise<string | null>;

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
  /**
   * Who published: `matches.verified_by`. The admin who pressed Mark
   * complete, or whoever submitted (submit-session.ts).
   */
  actorId: string;
  /**
   * The publish is also the admin's check: the close stamps `checked_at` and
   * `checked_by`. Unset for a labeller's publish, which an admin checks later
   * (`20261114091835_label_publish_check.sql`).
   */
  checked?: boolean;
  /**
   * Runs under the lease, before the publish: the submit's snapshot. A
   * sentence back refuses the publish; the lease is released and the sentence
   * is the answer.
   */
  beforePublish?: LabelBeforePublish;
  publish?: LabelPublish;
  now?: () => number;
}): Promise<LabelSessionStatusResult> {
  const {
    supabase,
    actorId,
    checked = false,
    beforePublish,
    publish = publishCheckingScore,
    now = Date.now,
  } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  // A submitted session passes here and nowhere else. Two doors reach this
  // writer: an admin's Mark complete, through `adminGated`, and Submit
  // (submit-session.ts), gated by `requireLabelActor` — an admin, or the
  // labeller the session is assigned to. So `allowSubmitted` lets a submitted
  // session through for either; a labeller's own publish normally starts
  // from `labelling`.
  const refused = await checkSessionOpen(supabase, sessionId, {
    allowSubmitted: true,
    forPublish: true,
  });
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
    const blocked = (await beforePublish?.(supabase, sessionId)) ?? null;
    const result =
      blocked === null
        ? await publish(supabase, sessionId)
        : ({ ok: false, error: blocked } as const);
    const verified = result.ok
      ? await verifyMatchOf(
          supabase,
          sessionId,
          actorId,
          result.errorsJudged === true,
        )
      : null;
    // The statistics are in either way, and the verify's outcome is settled.
    // Not when the session row could not be read: there is no match to name,
    // and Complete again asks for it.
    const insights =
      result.ok && verified?.matchId
        ? await requestMatchInsights({
            supabase,
            matchId: verified.matchId,
          })
        : null;
    if (!result.ok) {
      failure = result.error;
    } else if (!verified || "error" in verified) {
      failure = verified?.error ?? "Could not verify the match.";
    } else {
      const closedAt = new Date(now()).toISOString();
      const { data: closed, error: closeError } = await supabase
        .from("label_sessions")
        .update({
          status: "complete",
          completed_at: closedAt,
          // Null with the status: `label_sessions_submitted_check` wants the
          // pair to agree. A no-op on a session that was never submitted.
          submitted_at: null,
          publishing_since: null,
          // An admin's publish is its own check; a labeller's waits for one.
          ...(checked ? { checked_at: closedAt, checked_by: actorId } : {}),
        })
        .eq("id", sessionId)
        .eq("publishing_since", claimedAt)
        .select("id");
      if (closeError) {
        // Verified by Advantage stays: the labels are published and verified,
        // and a session left open beside them is what a Reopen leaves too.
        // Complete again (once the lease lapses) publishes and closes it.
        return {
          error: `The labels are published, but the session could not be marked complete: ${closeError.message}`,
        };
      }
      if (!closed || closed.length === 0) return { error: RACED };
      return {
        ok: true,
        status: "complete",
        published: {
          points: result.points,
          shots: result.shots,
          insightsRequested: insights?.ok === true,
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

/**
 * Open a complete or submitted session for labelling again. Never throws.
 * Only the session moves: the match keeps its published points and Verified
 * by Advantage until Complete publishes again.
 */
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
  if (session.status === "submitted") {
    // No second open session to collide with: one UPDATE, matched on the
    // status it was read in.
    const { data, error } = await supabase
      .from("label_sessions")
      .update({ status: "labelling", submitted_at: null })
      .eq("id", sessionId)
      .eq("status", "submitted")
      .select("id");
    if (error) {
      return { error: `Could not reopen the session: ${error.message}` };
    }
    if (!data || data.length === 0) return { error: RACED };
    return { ok: true, status: "labelling" };
  }
  if (session.status !== "complete") return { error: ALREADY_OPEN };

  // The check goes with the status: `label_sessions_checked_needs_complete`
  // allows `checked_at` on a complete session only.
  const { data, error } = await supabase
    .from("label_sessions")
    .update({
      status: "labelling",
      completed_at: null,
      checked_at: null,
      checked_by: null,
    })
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

/**
 * Verify the session's match as `actorId` (`verify_match`): the match it
 * verified, or the sentence Complete answers with. `errorsJudged` is the
 * publish's word that every error was marked: `verify_match` then stamps
 * `matches.errors_judged_at` and re-runs `calculate_match_stats`; the publish
 * has already set the marker and counted `forced_errors`, so this is the same
 * answer again. It runs after the publish's own recompute on purpose — a
 * publish whose statistics could not be rebuilt is never verified. A refused
 * verify still names the match, for the AI summary the caller then asks for.
 */
async function verifyMatchOf(
  supabase: AdminClient,
  sessionId: string,
  actorId: string,
  errorsJudged: boolean,
): Promise<{ matchId: string } | { matchId?: string; error: string }> {
  const { data: row, error: readError } = await supabase
    .from("label_sessions")
    .select("match_id")
    .eq("id", sessionId)
    .maybeSingle<{ match_id: string }>();
  if (readError || !row) {
    return {
      error: `The labels are published, but the match could not be marked Verified by Advantage: ${readError?.message ?? "session not found"}. Publish again to retry.`,
    };
  }
  const { error } = await supabase.rpc("verify_match", {
    p_match_id: row.match_id,
    p_actor: actorId,
    p_errors_judged: errorsJudged,
  });
  if (error) {
    return {
      matchId: row.match_id,
      error: `The labels are published, but the match could not be marked Verified by Advantage: ${error.message}. Publish again to retry.`,
    };
  }
  return { matchId: row.match_id };
}

/**
 * `gated` for the two admin-only writes: `requireAdminActor` in place of the
 * actor gate, the same try/catch around the work.
 */
async function adminGated<T extends object>(
  deps: LabelWriteDependencies,
  sessionId: unknown,
  work: (supabase: AdminClient, actorId: string) => Promise<LabelOpResult<T>>,
  what: string,
): Promise<LabelOpResult<T>> {
  const actor = await requireAdminActor(deps, {
    sessionId: targetId(sessionId),
  });
  if (!actor) return { error: ADMIN_REQUIRED };
  try {
    return await work(deps.createAdminClient(), actor.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[labels:status] ${what} threw`, { message });
    return { error: `Could not ${what}: ${message}` };
  }
}

export function completeLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return adminGated(
    deps,
    sessionId,
    (supabase, actorId) =>
      writeLabelSessionComplete({
        supabase,
        sessionId,
        actorId,
        checked: true,
      }),
    "complete the session",
  );
}

export function reopenLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return adminGated(
    deps,
    sessionId,
    (supabase) => writeLabelSessionReopen({ supabase, sessionId }),
    "reopen the session",
  );
}
