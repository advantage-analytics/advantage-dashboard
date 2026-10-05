/**
 * The decision half of `/api/splitstep/jobs/[jobId]/rederive` — the "Rebuild
 * statistics" button on a job whose statistics build crashed, and the prompt
 * the edit dialog raises after the entered score of an analysed match changes
 * (derivation checks the analysis against that score, and settles the final
 * point from it). Which player is which is NOT up for change on such a
 * rebuild: `deriveAndPublish({ rebuild })` pins it to the published rows.
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
 * (`completed`, or `derivation_failed` classified `rederive`; results stored)
 * → claim it (`deriving` only where the status is still the one read, so two
 * clicks cannot both derive) → derive once, bounded by a deadline.
 *
 * Rebuilding a `completed` job re-creates every point, and bookmarks on the
 * old points go with them (`point_bookmarks` cascades). The dialog says so
 * before it calls this; the "ready" email is deduped per job, so it does not
 * go out again.
 */

import { NextResponse } from "next/server";

import { classifyFailure, jobRecoveryFacts } from "@/lib/data/match-analysis";
import { isUuid } from "@/lib/services/match-video/access";
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
  match_id: string;
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

export type RederiveOutcome =
  | { ok: true }
  /** `kept`: refused before anything was written; the match is as it was. */
  | { ok: false; reason: string; kept?: boolean };

/** The statuses a rebuild may start from. */
export type RebuildableStatus = "derivation_failed" | "completed";

export interface RederiveDeps {
  /** The signed-in login from `auth.getUser()`, or null. */
  currentUserId(): Promise<string | null>;
  /** The job by id, through a client that can see every row. */
  loadJob(
    jobId: string,
  ): Promise<{ job: RederiveJobRow | null; error: string | null }>;
  /**
   * `status = 'deriving'` where `id = jobId AND status = from`.
   * `claimed` is false when zero rows matched — someone else got there first.
   */
  claimJob(
    jobId: string,
    from: RebuildableStatus,
  ): Promise<{ claimed: boolean; error: string | null }>;
  /** The id of the newest job for a match, or null when the read failed. */
  newestJobId(matchId: string): Promise<string | null>;
  /**
   * `deriveAndPublish({ supabase: admin, jobId, deadline, rebuild })`, with
   * `rebuild` set when the job is being rebuilt from `completed`.
   */
  derive(
    jobId: string,
    deadline: number,
    from: RebuildableStatus,
  ): Promise<RederiveOutcome>;
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

  // Not a UUID = no such job; same 404 as a missing or foreign one.
  if (!isUuid(jobId)) return refuse("Job not found", 404);

  const { job, error: loadError } = await deps.loadJob(jobId);
  if (loadError) {
    pipelineLog.error(`${LOG} job lookup failed`, { jobId, error: loadError });
    return refuse("Could not load the job", 500);
  }
  if (!job || job.created_by !== userId) return refuse("Job not found", 404);

  if (job.status !== "derivation_failed" && job.status !== "completed") {
    return refuse("This match isn't ready for a statistics rebuild.", 409);
  }
  const from: RebuildableStatus = job.status;

  if (from === "derivation_failed") {
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
  }
  if (!job.results_object_key) {
    return refuse(
      "The analysis results for this match are no longer available to rebuild from.",
      409,
    );
  }

  // A published match is rebuilt from its newest analysis only. An older
  // `completed` job (a resubmit superseded it) would put its results back
  // over the current ones; the dialog never offers one, but a direct POST can.
  if (
    from === "completed" &&
    (await deps.newestJobId(job.match_id)) !== jobId
  ) {
    return refuse("A newer analysis of this match exists.", 409);
  }

  const claim = await deps.claimJob(jobId, from);
  if (claim.error) {
    pipelineLog.error(`${LOG} claim failed`, { jobId, error: claim.error });
    return refuse("Could not start the rebuild", 500);
  }
  if (!claim.claimed) {
    return refuse("The statistics are already rebuilding.", 409);
  }

  const outcome = await deps.derive(jobId, deadline, from);
  if (!outcome.ok && outcome.kept) {
    // Turned down before anything was written; the job is `completed` again.
    pipelineLog.info(`${LOG} rebuild refused, match kept`, {
      jobId,
      reason: outcome.reason,
    });
    return NextResponse.json(
      {
        error:
          "The statistics couldn't be rebuilt against this score, so they were kept as they were.",
        status: "completed",
      },
      { status: 409 },
    );
  }
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
