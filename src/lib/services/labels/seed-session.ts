/**
 * Start (or reopen) a hand-labelling session for one Advantage Intelligence
 * job.
 *
 * The transcript is rebuilt from the job's stored results file with CURRENT
 * derivation code — never read from `points`/`shots`, which may have been
 * written by an older version — and the session pins both the file
 * (`results_object_key`) and the code (`DERIVATION_VERSION`) it was seeded
 * from, so a later comparison can be reproduced exactly.
 *
 * Writes go to `label_sessions`, `label_points` and `label_shots` and nowhere
 * else. `processing_jobs`, `matches` and the results bucket are only read.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { UUID_RE } from "@/lib/admin/validation";
import { buildTranscriptForJob } from "@/lib/services/splitstep/persist-transcript";
import {
  DERIVATION_VERSION,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import { buildLabelSeed } from "./seed";

const LOG = "[labels:seed]";

/** Rows per insert call; one match is ~100 points and ~550 shots. */
const INSERT_BATCH = 500;

export type SeedLabelSessionResult =
  { sessionId: string; existing: boolean } | { error: string };

/**
 * Seed a session for `jobId` as `labellerId`, or return the job's open one.
 *
 * Never throws. On any failure after the session row exists, the row is
 * deleted (points and shots cascade) so a half-seeded session is never left
 * for the console to open.
 */
export async function seedLabelSessionForJob(params: {
  supabase: AdminClient;
  jobId: string;
  labellerId: string;
}): Promise<SeedLabelSessionResult> {
  const { supabase, jobId, labellerId } = params;

  if (!UUID_RE.test(jobId)) return { error: "Invalid job id." };

  try {
    // Checked before the download: reopening is the common case, and it
    // should not cost a results-file fetch and a full re-derive.
    const open = await findOpenSession(supabase, jobId);
    if ("error" in open) return open;
    if (open.sessionId) return { sessionId: open.sessionId, existing: true };

    const { transcript, reason, job, raw } = await buildTranscriptForJob({
      supabase,
      jobId,
    });
    if (!job) return { error: reason ?? "Job not found." };
    if (!transcript || !transcript.ok) {
      return {
        error: `Transcript could not be built: ${reason ?? "unknown reason"}`,
      };
    }
    if (!job.results_object_key || !Array.isArray(raw)) {
      return { error: "Job has no readable results file." };
    }

    const seed = buildLabelSeed(transcript, raw as RawSplitStepStroke[]);

    const { data: session, error: sessionError } = await supabase
      .from("label_sessions")
      .insert({
        job_id: job.id,
        match_id: job.match_id,
        results_object_key: job.results_object_key,
        derivation_version: DERIVATION_VERSION,
        // Explicit: the column defaults to auth.uid(), which is null under
        // the service role this runs as.
        labeller: labellerId,
        status: "labelling",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single<{ id: string }>();

    if (sessionError || !session) {
      // Lost a race with another seed of the same job: the partial unique
      // index allows one open session per job, so return that one.
      if (sessionError?.code === "23505") {
        const raced = await findOpenSession(supabase, jobId);
        if ("error" in raced) return raced;
        if (raced.sessionId) {
          return { sessionId: raced.sessionId, existing: true };
        }
      }
      return {
        error: `Could not create the session: ${sessionError?.message ?? "no row returned"}`,
      };
    }

    const written = await writeSeedRows(supabase, session.id, seed);
    if (written.error) {
      await supabase.from("label_sessions").delete().eq("id", session.id);
      return { error: written.error };
    }

    console.log(`${LOG} seeded`, {
      jobId,
      sessionId: session.id,
      points: seed.points.length,
      shots: written.shots,
    });
    return { sessionId: session.id, existing: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} threw`, { jobId, message });
    return { error: `Seeding failed: ${message}` };
  }
}

async function findOpenSession(
  supabase: AdminClient,
  jobId: string,
): Promise<{ sessionId: string | null } | { error: string }> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "labelling")
    .maybeSingle<{ id: string }>();
  if (error) {
    return { error: `Could not look up open sessions: ${error.message}` };
  }
  return { sessionId: data?.id ?? null };
}

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    out.push(rows.slice(i, i + INSERT_BATCH));
  }
  return out;
}

/** Points first, so every shot can carry its `label_point_id`. */
async function writeSeedRows(
  supabase: AdminClient,
  sessionId: string,
  seed: ReturnType<typeof buildLabelSeed>,
): Promise<{ error: string | null; shots: number }> {
  const pointRows = seed.points.map(({ shots: _shots, ...point }) => ({
    ...point,
    session_id: sessionId,
  }));

  // Mapped back by point_index, not by position: the returned rows are not
  // promised to keep the order they were sent in.
  const idByIndex = new Map<number, string>();
  for (const batch of chunks(pointRows)) {
    const { data, error } = await supabase
      .from("label_points")
      .insert(batch)
      .select("id, point_index");
    if (error || !data) {
      return {
        error: `Could not write label points: ${error?.message ?? "no rows returned"}`,
        shots: 0,
      };
    }
    for (const row of data as Array<{ id: string; point_index: number }>) {
      idByIndex.set(row.point_index, row.id);
    }
  }

  const shotRows: Array<Record<string, unknown>> = [];
  for (const point of seed.points) {
    const pointId = idByIndex.get(point.point_index);
    if (!pointId) {
      return {
        error: `internal: label point ${point.point_index} lost its id during insert`,
        shots: 0,
      };
    }
    for (const shot of point.shots) {
      shotRows.push({
        ...shot,
        session_id: sessionId,
        label_point_id: pointId,
      });
    }
  }

  for (const batch of chunks(shotRows)) {
    const { error } = await supabase.from("label_shots").insert(batch);
    if (error) {
      return {
        error: `Could not write label shots: ${error.message}`,
        shots: 0,
      };
    }
  }

  return { error: null, shots: shotRows.length };
}

interface Dependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
}
const defaults: Dependencies = { requireAdmin, createAdminClient };

/**
 * The admin-gated entry point behind the `/admin/labels` server action.
 *
 * The session is re-checked here rather than trusted from the page, and the
 * admin's id becomes the labeller. It runs on the service-role client, like
 * the rest of the admin console's writes, because `buildTranscriptForJob`
 * reads the job and its results file through that client.
 */
export async function seedLabelSession(
  jobId: unknown,
  deps: Dependencies = defaults,
): Promise<SeedLabelSessionResult> {
  const actor = await deps.requireAdmin();
  if (!actor) return { error: "Administrator access is required." };
  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return { error: "Invalid job id." };
  }
  return seedLabelSessionForJob({
    supabase: deps.createAdminClient(),
    jobId: jobId.toLowerCase(),
    labellerId: actor.id,
  });
}
