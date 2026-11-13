/**
 * An admin's retry of someone else's FAILED analysis.
 *
 * The athlete's own route (`/api/splitstep/jobs/[jobId]/resubmit`) cannot
 * serve an admin: it answers 404 unless the caller created the job, resolves
 * billing from the caller's workspaces, and reads the roster as the caller.
 * `/api/admin/splitstep/reprocess` is not this either — it resends COMPLETED
 * analyses and is free. This is the paid retry of a failure, asked for by an
 * admin and charged where the match's own retry would be.
 *
 * In order, and nothing before the first step reads a job or builds the
 * service-role client:
 *   1. `users.is_admin`, re-checked here on every call. Signed out and
 *      not-an-admin are both refused before any read.
 *   2. The target: a job id, or a match id resolved to the match's NEWEST job
 *      — the one the match's failure card is about.
 *   3. A match Verified by Advantage keeps its points, as on the athlete's
 *      route, with the same sentence.
 *   4. `resubmitJob({ auto: false, adminRetry })` — never `reprocess`. That
 *      function owns everything else and its own sentences: the failed-state
 *      check, the attempt ceiling, the duplicate, blob and metadata checks,
 *      and the quota reservation against the MATCH's workspace
 *      (`resolveAutoRetryWorkspace()`), never one of the admin's.
 *
 * Every attempt is logged with the admin's id, whatever its outcome.
 *
 * Dependencies are injected so `tests/admin-resubmit.spec.ts` runs the whole
 * ladder with no session, no database and no vendor. The server action
 * (`src/app/admin/matches/resubmit-action.ts`) supplies the real ones.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/admin/validation";

import type {
  ResubmitIo,
  ResubmitRefusalReason,
  ResubmitResult,
} from "./resubmit-job";

const LOG = "[admin-resubmit]";

/** The athlete's route says this for the same refusal; keep the two the same. */
export const VERIFIED_MATCH_REFUSAL =
  "This match is Verified by Advantage, so it can't be analysed again.";

export type AdminResubmitRefusalCode =
  | ResubmitRefusalReason
  /** No session. */
  | "unauthorized"
  /** Signed in, not an admin. */
  | "forbidden"
  | "invalid_request"
  | "read_failed"
  | "verified";

export type AdminResubmitResult =
  | { ok: true; jobId: string; externalJobId: string }
  | { ok: false; error: string; code: AdminResubmitRefusalCode };

/** Exactly one of the two. A match id names the match's newest job. */
export type AdminResubmitInput = { jobId: string } | { matchId: string };

export interface AdminResubmitDeps {
  /** `checkAdmin()` — the session's `users.is_admin`, read per call. */
  checkAdmin(): Promise<
    { ok: true; id: string } | { ok: false; status: 401 | 403 }
  >;
  /** The service-role client. Only ever called after `checkAdmin()` passed. */
  createAdminClient(): SupabaseClient;
  /** `resubmitJob` — the one call that can spend or reach the vendor. */
  resubmit(input: {
    supabase: SupabaseClient;
    jobId: string;
    auto: false;
    adminRetry: { requestedBy: string };
    io?: Partial<ResubmitIo>;
  }): Promise<ResubmitResult>;
  /** Test seams handed through to `resubmitJob`. Production omits this. */
  io?: Partial<ResubmitIo>;
  /** Defaults to `console`. */
  log?: Pick<Console, "log" | "warn" | "error">;
}

function refuse(
  error: string,
  code: AdminResubmitRefusalCode,
): Extract<AdminResubmitResult, { ok: false }> {
  return { ok: false, error, code };
}

export async function adminResubmitFailedAnalysis(
  input: AdminResubmitInput,
  deps: AdminResubmitDeps,
): Promise<AdminResubmitResult> {
  const log = deps.log ?? console;

  // 1. Admin, checked here — before the target is even looked at.
  const check = await deps.checkAdmin();
  if (!check.ok) {
    log.warn(`${LOG} refused — not an admin`, { status: check.status });
    return check.status === 401
      ? refuse("Sign in as an admin.", "unauthorized")
      : refuse("Admins only.", "forbidden");
  }
  const adminId = check.id;

  // 2. The target. Arguments of a server action are whatever the client sent.
  const raw: Record<string, unknown> =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const jobIdInput = raw.jobId;
  const matchIdInput = raw.matchId;
  const byJob = jobIdInput !== undefined;
  if (
    byJob === (matchIdInput !== undefined) ||
    !isUuid(byJob ? jobIdInput : matchIdInput)
  ) {
    log.warn(`${LOG} refused — invalid target`, { adminId });
    return refuse("Give one job id or one match id.", "invalid_request");
  }
  const target = byJob
    ? { jobId: jobIdInput as string }
    : { matchId: matchIdInput as string };

  log.log(`${LOG} attempt`, { adminId, ...target });
  const refused = (
    error: string,
    code: AdminResubmitRefusalCode,
    detail: Record<string, unknown> = {},
  ) => {
    log.warn(`${LOG} refused — ${code}`, { adminId, ...target, ...detail });
    return refuse(error, code);
  };

  const supabase = deps.createAdminClient();

  const jobQuery = supabase.from("processing_jobs").select("id, match_id");
  const { data: jobRow, error: jobError } = await (
    "jobId" in target
      ? jobQuery.eq("id", target.jobId)
      : jobQuery
          .eq("match_id", target.matchId)
          // Newest job wins — the order the webhook's match fallback and the
          // match's own failure card use.
          .order("created_at", { ascending: false })
          .limit(1)
  ).maybeSingle();

  if (jobError) {
    return refused("Could not load the job. Try again.", "read_failed", {
      error: jobError.message,
    });
  }
  if (!jobRow) {
    return "jobId" in target
      ? refused("Job not found.", "not_found")
      : refused("This match has no analysis to retry.", "not_found");
  }
  const job = jobRow as { id: string; match_id: string };

  // 3. Verified by Advantage (decision D1, docs/plans/advantage-review.md): a
  //    new analysis would replace hand-checked points on the service role.
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("verified")
    .eq("id", job.match_id)
    .maybeSingle();

  if (matchError) {
    return refused("Could not load the match. Try again.", "read_failed", {
      jobId: job.id,
      error: matchError.message,
    });
  }
  if (!matchRow) {
    return refused("Job not found.", "not_found", { jobId: job.id });
  }
  if ((matchRow as { verified: boolean | null }).verified) {
    return refused(VERIFIED_MATCH_REFUSAL, "verified", { jobId: job.id });
  }

  // 4. Everything else is resubmitJob()'s, sentences included.
  const result = await deps.resubmit({
    supabase,
    jobId: job.id,
    auto: false,
    adminRetry: { requestedBy: adminId },
    ...(deps.io ? { io: deps.io } : {}),
  });

  if (!result.ok) {
    return refused(result.message, result.reason, {
      jobId: job.id,
      matchId: job.match_id,
    });
  }

  log.log(`${LOG} sent`, {
    adminId,
    matchId: job.match_id,
    parentJobId: job.id,
    childJobId: result.jobId,
    externalJobId: result.externalJobId,
  });
  return { ok: true, jobId: result.jobId, externalJobId: result.externalJobId };
}
