/**
 * Derive and store ball paths for SplitStep jobs that have a trajectories file.
 *
 * Calls the same `deriveAndStoreBallPaths()` the webhook calls, so this is a
 * real exercise of the production path rather than a reimplementation of it.
 *
 * Idempotent: the output key is deterministic and the upload upserts, so a
 * re-run overwrites the same object with the same derivation.
 *
 * Run from repo root:
 *   npx tsx scripts/splitstep-ball-paths.ts               # every job with trajectories
 *   npx tsx scripts/splitstep-ball-paths.ts --job <uuid>
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveAndStoreBallPaths } from "@/lib/services/splitstep/ball-paths-store";

// Minimal .env.local loader, matching scripts/splitstep-backfill-grades.ts. A
// dotenv dependency for two variables in a script would be a dependency the app
// never needs at runtime.
try {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, k, v] = match;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "").trim();
  }
} catch {
  // Fine when the variables are already exported in the environment.
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const jobFlag = process.argv.indexOf("--job");
  const onlyJob = jobFlag !== -1 ? process.argv[jobFlag + 1] : null;

  // Refuse rather than widen. `--job` with its uuid missing, or with the next
  // flag sitting where the uuid should be, must not fall through the filter
  // and quietly run against EVERY job. Checked before a client is built, so a
  // refused run touches nothing.
  if (
    jobFlag !== -1 &&
    (onlyJob === undefined ||
      onlyJob === null ||
      onlyJob.startsWith("--") ||
      !UUID.test(onlyJob))
  ) {
    console.error(
      `--job needs a job uuid; got ${onlyJob === undefined ? "nothing" : `"${onlyJob}"`}.`,
    );
    process.exit(1);
  }

  const supabase = createAdminClient();

  // A named job is run even without a trajectories key, so the line it prints
  // says `skipped no_trajectories` instead of the job silently not appearing.
  const base = supabase.from("processing_jobs").select("id");
  const query = onlyJob
    ? base.eq("id", onlyJob)
    : base
        .not("trajectories_object_key", "is", null)
        .order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) {
    console.error("Could not list jobs:", error.message);
    process.exit(1);
  }

  const jobs = data ?? [];
  console.log(
    onlyJob
      ? `${jobs.length} job(s) matching ${onlyJob}`
      : `${jobs.length} job(s) with a stored trajectories file`,
  );

  let stored = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    const outcome = await deriveAndStoreBallPaths({ supabase, jobId: job.id });

    if (outcome.status === "stored") {
      console.log(
        `  ${job.id}  stored  ${outcome.strokes} strokes, ${outcome.bytes} bytes → ${outcome.objectKey}`,
      );
      stored += 1;
    } else if (outcome.status === "skipped") {
      console.log(`  ${job.id}  skipped  ${outcome.reason}`);
      skipped += 1;
    } else {
      console.error(`  ${job.id}  FAILED — ${outcome.error}`);
      failed += 1;
    }
  }

  console.log(`\nstored ${stored}, skipped ${skipped}, failed ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
