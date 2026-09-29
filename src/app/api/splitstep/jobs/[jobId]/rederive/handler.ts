/**
 * The decision half of `/api/splitstep/jobs/[jobId]/rederive` — the "Rebuild
 * statistics" button on a job whose statistics build crashed.
 *
 * A rebuild re-runs `deriveAndPublish()` from the results the vendor already
 * delivered. No vendor call, no allowance spent, no attempt counted, and safe
 * to repeat: `persist-transcript.ts` deletes the match's derived points before
 * inserting.
 *
 * Split from `route.ts` on the `jobs/handler.ts` pattern so
 * `tests/rederive-handler.spec.ts` can run the whole ladder against fakes.
 *
 * ORDER: signed in → load the job → yours (same 404 for "missing" and "not
 * yours", never confirming another user's job) → is it rebuildable
 * (`derivation_failed`, classified `rederive`, results stored) → claim it
 * (`deriving` only where still `derivation_failed`, so two clicks cannot both
 * derive) → derive once, bounded by a deadline.
 */

import { NextResponse } from "next/server";

import { classifyFailure, jobRecoveryFacts } from "@/lib/data/match-analysis";
import { pipelineLog } from "@/lib/services/splitstep/pipeline-log";

const LOG = "[splitstep-rederive-route]";

/**
 * Same headroom the webhook leaves before its own `maxDuration`: enough for
 * the settling write after the bounded review wait.
 */
export const REDERIVE_DEADLINE_HEADROOM_MS = 8_000;

/** The columns of `processing_jobs` this decision reads. */
export interface RederiveJobRow {
  id: string;
  created_by: string | null;
  status: string;
  derivation_version: string | null;
  error_code: string | null;
  error_category: string | null;
  error_step: string | null;
  external_job_id: string | null;
  updated_at: string | null;
  video_object_key: string | null;
  results_object_key: string | null;
}

export type RederiveOutcome = { ok: true } | { ok: false; reason: string };

export interface RederiveDeps {
  /** The signed-in login from `auth.getUser()`, or null. */
  currentUserId(): Promise<string | null>;
  /** The job by id, through a client that can see every row. */
  loadJob(
    jobId: string,
  ): Promise<{ job: RederiveJobRow | null; error: string | null }>;
  /**
   * `status = 'deriving'` where `id = jobId AND status = 'derivation_failed'`.
   * `claimed` is false when zero rows matched — someone else got there first.
   */
  claimJob(jobId: string): Promise<{ claimed: boolean; error: string | null }>;
  /** `deriveAndPublish({ supabase: admin, jobId, deadline })`. */
  derive(jobId: string, deadline: number): Promise<RederiveOutcome>;
  /** Epoch ms; injectable so the spec can pin the deadline. */
  now?(): number;
}

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function handleRederive(
  jobId: string,
  deps: RederiveDeps,
  { maxDurationSeconds }: { maxDurationSeconds: number },
): Promise<NextResponse> {
  // The deadline runs from the start of the invocation, as the webhook's does.
  const startedAt = deps.now?.() ?? Date.now();
  const deadline =
    startedAt + maxDurationSeconds * 1000 - REDERIVE_DEADLINE_HEADROOM_MS;

  const userId = await deps.currentUserId();
  if (!userId) return refuse("Not signed in", 401);

  const { job, error: loadError } = await deps.loadJob(jobId);
  if (loadError) {
    pipelineLog.error(`${LOG} job lookup failed`, { jobId, error: loadError });
    return refuse("Could not load the job", 500);
  }
  if (!job || job.created_by !== userId) return refuse("Job not found", 404);

  if (job.status !== "derivation_failed") {
    return refuse("This match isn't waiting on a statistics rebuild.", 409);
  }

  const recovery = classifyFailure({
    ...jobRecoveryFacts({
      ...job,
      hasVideo: Boolean(job.video_object_key),
      hasResults: Boolean(job.results_object_key),
    }),
    // The chain count only matters for `failed` rows; a rebuild counts nothing.
    attemptsUsed: 1,
  });
  if (recovery !== "rederive") {
    return refuse("The statistics can't be rebuilt for this match.", 409);
  }
  if (!job.results_object_key) {
    return refuse(
      "The analysis results for this match are no longer available to rebuild from.",
      409,
    );
  }

  const claim = await deps.claimJob(jobId);
  if (claim.error) {
    pipelineLog.error(`${LOG} claim failed`, { jobId, error: claim.error });
    return refuse("Could not start the rebuild", 500);
  }
  if (!claim.claimed) {
    return refuse("The statistics are already rebuilding.", 409);
  }

  const outcome = await deps.derive(jobId, deadline);
  if (!outcome.ok) {
    // deriveAndPublish has already settled the row at `derivation_failed`
    // with its own code; the reason is for the log, never the client.
    pipelineLog.error(`${LOG} rebuild failed`, {
      jobId,
      reason: outcome.reason,
    });
    return NextResponse.json(
      {
        error: "The statistics could not be rebuilt.",
        status: "derivation_failed",
      },
      { status: 500 },
    );
  }

  pipelineLog.info(`${LOG} rebuilt`, { jobId });
  return NextResponse.json({ jobId, status: "completed" });
}
