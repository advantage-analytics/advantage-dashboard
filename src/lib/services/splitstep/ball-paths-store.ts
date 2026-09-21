/**
 * Derive a job's ball paths and store them as one JSON object.
 *
 * One function for both callers — the webhook's after() block and
 * scripts/splitstep-ball-paths.ts — the same shape as deriveAndPublish, so
 * there is no second implementation to drift.
 *
 * No migration and no column. The output key is deterministic
 * (`ballPathsObjectKey`), so a reader rebuilds it from the job row; per-frame
 * rows in Postgres would be ~26k a match for the benefit of one screen.
 *
 * The INPUTS are read from the keys RECORDED on the row, never recomputed: a
 * delivery adopted after the fact keeps its `orphaned/…` key. Only the output
 * key is computed.
 *
 * Never throws. It runs last in an after() callback whose 200 has already
 * gone out, where a rejection helps nobody; every outcome comes back as a
 * value for the caller to log. `skipped` is a normal outcome, not an error:
 * `trajectories_url` may legitimately be null and older jobs have no file.
 *
 * Takes the service-role client as a parameter so this module never
 * constructs one — createAdminClient stays with the server-only callers.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { RESULTS_BUCKET } from "./config";
import { ballPathsObjectKey, ballPathsUserSegment } from "./object-keys";
import { deriveBallPaths } from "./derivation/ball-paths";
import { parseStrokes } from "./derivation/parse";

export type BallPathsStoreOutcome =
  | { status: "stored"; objectKey: string; bytes: number; strokes: number }
  | { status: "skipped"; reason: "no_trajectories" | "no_results" }
  | { status: "failed"; error: string };

type JobRow = {
  created_by: string | null;
  match_id: string | null;
  results_object_key: string | null;
  trajectories_object_key: string | null;
  start_time_seconds: number | string | null;
};

export async function deriveAndStoreBallPaths(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
}): Promise<BallPathsStoreOutcome> {
  const { supabase, jobId } = params;

  try {
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select(
        "created_by, match_id, results_object_key, trajectories_object_key, start_time_seconds",
      )
      .eq("id", jobId)
      .single<JobRow>();

    if (jobError || !job) {
      return {
        status: "failed",
        error: `job not found: ${jobError?.message ?? "no row"}`,
      };
    }
    if (!job.trajectories_object_key) {
      return { status: "skipped", reason: "no_trajectories" };
    }
    if (!job.results_object_key) {
      return { status: "skipped", reason: "no_results" };
    }
    if (!job.match_id) {
      // The match id is the third key segment and the only thing the sweeper
      // and the reader can find this file by. Without one there is no key.
      return { status: "failed", error: "job has no match_id to key under" };
    }

    const bucket = supabase.storage.from(RESULTS_BUCKET);
    const [results, trajectories] = await Promise.all([
      bucket.download(job.results_object_key),
      bucket.download(job.trajectories_object_key),
    ]);

    if (results.error || !results.data) {
      return {
        status: "failed",
        error: `could not read results: ${results.error?.message ?? "no data"}`,
      };
    }
    if (trajectories.error || !trajectories.data) {
      return {
        status: "failed",
        error: `could not read trajectories: ${trajectories.error?.message ?? "no data"}`,
      };
    }

    // Same offset, applied the same way, as buildTranscriptForJob: a path's
    // `contactTime` must equal `shots.video_time`, which carries the trim.
    const startTimeSeconds = Number(job.start_time_seconds ?? 0);
    const { strokes } = parseStrokes(JSON.parse(await results.data.text()), {
      startTimeSeconds: Number.isFinite(startTimeSeconds)
        ? startTimeSeconds
        : 0,
    });

    const file = deriveBallPaths(
      JSON.parse(await trajectories.data.text()),
      strokes,
    );
    const body = JSON.stringify(file);

    // A null `created_by` (the uploader left) still has a segment — see
    // ballPathsUserSegment, which the reader shares.
    const objectKey = ballPathsObjectKey({
      userId: ballPathsUserSegment(job.created_by),
      matchId: job.match_id,
      jobId,
    });

    const { error: uploadError } = await bucket.upload(objectKey, body, {
      upsert: true,
      contentType: "application/json",
    });
    if (uploadError) {
      return {
        status: "failed",
        error: `could not store ball paths: ${uploadError.message}`,
      };
    }

    return {
      status: "stored",
      objectKey,
      bytes: Buffer.byteLength(body),
      strokes: file.strokes.length,
    };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
