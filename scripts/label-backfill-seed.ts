/**
 * Backfill `seed` on a label session's vendor rows that have none.
 *
 *   npx tsx scripts/label-backfill-seed.ts --session <uuid>            # dry run, writes nothing
 *   npx tsx scripts/label-backfill-seed.ts --session <uuid> --write    # write the seeds
 *
 * The migration that added `label_points.seed` / `label_shots.seed`
 * (supabase/migrations/20260928190425_label_rows_seed.sql) could only
 * backfill a row still at its seeded status — its values were its seed. An
 * EDITED row had already overwritten them, so its seed has to be rebuilt the
 * way it was made: the session's job, re-derived with `buildTranscriptForJob`
 * and mapped with `buildLabelSeed` — exactly seed-session.ts's path.
 *
 * Only vendor rows are touched: shots with an `event_id`, points with
 * `vendor_rally_ids` that were not added by the labeller. Shots match on
 * `event_id`; points on `vendor_rally_ids`, cross-checked against
 * `point_index`. Only `seed` is written, and only where it is still null —
 * never a value, never a status. A row whose values now equal the rebuilt
 * seed stays `edited` until its next edit or a Reset; the dry run says which.
 *
 * Refuses to write when the rebuilt seed may not be the one the session was
 * seeded from: when the session's pinned `derivation_version` differs from
 * today's DERIVATION_VERSION, or the job's results file is not the one the
 * session pinned. It still prints what it would write.
 *
 * Dry run is the default. Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import { readAllPages } from "@/lib/data/admin-range-read";
import { buildTranscriptForJob } from "@/lib/services/splitstep/persist-transcript";
import {
  DERIVATION_VERSION,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import {
  buildLabelSeed,
  type LabelPointSeedValues,
  type LabelShotSeedValues,
} from "@/lib/services/labels/seed";
import {
  LABEL_POINT_SEED_FIELDS,
  LABEL_SHOT_VALUE_FIELDS,
  pointMatchesSeed,
  sameShotValue,
  shotMatchesSeed,
  type LabelPointFields,
  type LabelShotValues,
} from "@/lib/services/labels/edit";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

type Supabase = ReturnType<typeof createAdminClient>;

interface SessionRow {
  id: string;
  job_id: string | null;
  status: string;
  derivation_version: string;
  results_object_key: string | null;
}

type PointRow = LabelPointFields & {
  id: string;
  point_index: number;
  vendor_rally_ids: number[] | null;
  status: string;
  status_before_delete: string | null;
};

type ShotRow = LabelShotValues & {
  id: string;
  event_id: number;
  status: string;
  label_point_id: string;
};

function diff<K extends string>(
  fields: readonly K[],
  current: Record<K, unknown>,
  seed: Record<K, unknown>,
  same: (field: K, a: unknown, b: unknown) => boolean = (_f, a, b) => a === b,
): string {
  const changed = fields.filter((f) => !same(f, current[f], seed[f]));
  if (changed.length === 0) return "no field differs";
  return changed
    .map(
      (f) =>
        `${f} ${JSON.stringify(current[f])} (seed ${JSON.stringify(seed[f])})`,
    )
    .join(", ");
}

async function main() {
  const argv = process.argv;
  const write = argv.includes("--write");
  const at = argv.indexOf("--session");
  const sessionId = at === -1 ? null : argv[at + 1];

  if (!sessionId || !UUID_RE.test(sessionId)) {
    console.error("usage: label-backfill-seed.ts --session <uuid> [--write]");
    process.exit(1);
  }

  const supabase: Supabase = createAdminClient();

  const { data: session, error: sessionError } = await supabase
    .from("label_sessions")
    .select("id, job_id, status, derivation_version, results_object_key")
    .eq("id", sessionId.toLowerCase())
    .maybeSingle<SessionRow>();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) {
    console.error(`REFUSED: no label session ${sessionId}`);
    process.exit(1);
  }

  if (!session.job_id) {
    console.error(
      `REFUSED: session ${session.id} has no job left to rebuild its seed from`,
    );
    process.exit(1);
  }

  const warnings: string[] = [];
  if (session.derivation_version !== DERIVATION_VERSION) {
    warnings.push(
      `session was seeded with derivation ${session.derivation_version}, this code is ${DERIVATION_VERSION} — the rebuilt seed may not be the one it was seeded with`,
    );
  }

  const built = await buildTranscriptForJob({
    supabase,
    jobId: session.job_id,
  });
  if (!built.job) {
    console.error(`REFUSED: ${built.reason ?? "job not found"}`);
    process.exit(1);
  }
  if (!built.transcript || !built.transcript.ok) {
    console.error(
      `REFUSED: transcript could not be built: ${built.reason ?? "unknown reason"}`,
    );
    process.exit(1);
  }
  if (!Array.isArray(built.raw)) {
    console.error("REFUSED: the job has no readable results file");
    process.exit(1);
  }
  if (built.job.results_object_key !== session.results_object_key) {
    warnings.push(
      `the job's results file (${built.job.results_object_key}) is not the one the session pinned (${session.results_object_key})`,
    );
  }

  const seed = buildLabelSeed(
    built.transcript,
    built.raw as RawSplitStepStroke[],
  );
  const pointSeedByRally = new Map<
    number,
    { pointIndex: number; seed: LabelPointSeedValues }
  >();
  const shotSeedByEvent = new Map<number, LabelShotSeedValues>();
  for (const point of seed.points) {
    for (const rally of point.vendor_rally_ids) {
      pointSeedByRally.set(rally, {
        pointIndex: point.point_index,
        seed: point.seed,
      });
    }
    for (const shot of point.shots)
      shotSeedByEvent.set(shot.event_id, shot.seed);
  }

  const points = await readAllPages<PointRow>(
    supabase
      .from("label_points")
      .select(
        `id, point_index, vendor_rally_ids, status, status_before_delete, ${LABEL_POINT_SEED_FIELDS.join(", ")}`,
      )
      .eq("session_id", session.id)
      .is("seed", null)
      .order("point_index")
      .returns<PointRow[]>(),
    "Could not read label points",
  );
  const shots = await readAllPages<ShotRow>(
    supabase
      .from("label_shots")
      .select(
        `id, event_id, status, label_point_id, ${LABEL_SHOT_VALUE_FIELDS.join(", ")}`,
      )
      .eq("session_id", session.id)
      .is("seed", null)
      .not("event_id", "is", null)
      .order("event_id")
      .returns<ShotRow[]>(),
    "Could not read label shots",
  );

  // Added points (live or tombstoned) never had a seed to rebuild.
  const vendorPoints = points.filter(
    (p) =>
      (p.vendor_rally_ids ?? []).length > 0 &&
      p.status !== "added" &&
      p.status_before_delete !== "added",
  );

  const pointWrites: { id: string; seed: LabelPointSeedValues }[] = [];
  const shotWrites: { id: string; seed: LabelShotSeedValues }[] = [];
  const unmatched: string[] = [];

  console.log(
    write && warnings.length === 0
      ? "=== WRITING ==="
      : "=== DRY RUN — nothing written ===",
  );
  console.log(
    `session ${session.id} (${session.status}) · job ${session.job_id} · derivation ${session.derivation_version} (code ${DERIVATION_VERSION})`,
  );
  console.log(
    `rebuilt seed: ${seed.points.length} points, ${shotSeedByEvent.size} shots`,
  );
  console.log(
    `rows with seed null: ${points.length} points (${vendorPoints.length} from the vendor), ${shots.length} vendor shots`,
  );

  console.log("\npoints");
  for (const row of vendorPoints) {
    const rallies = row.vendor_rally_ids ?? [];
    const matches = rallies.map((r) => pointSeedByRally.get(r));
    const first = matches[0];
    if (!first || matches.some((m) => m !== first)) {
      unmatched.push(`point ${row.id} (rallies ${rallies.join(",")})`);
      console.log(
        `  ✗ #${row.point_index + 1} ${row.id} rallies ${rallies.join(",")} — no single seeded point`,
      );
      continue;
    }
    if (first.pointIndex !== row.point_index) {
      unmatched.push(
        `point ${row.id} (index ${row.point_index} vs ${first.pointIndex})`,
      );
      console.log(
        `  ✗ #${row.point_index + 1} ${row.id} — rally matches seeded point_index ${first.pointIndex}, not ${row.point_index}`,
      );
      continue;
    }
    const back = pointMatchesSeed(row, first.seed);
    console.log(
      `  #${row.point_index + 1} ${row.id} ${row.status} · ${back ? "values equal the seed" : diff(LABEL_POINT_SEED_FIELDS, row, first.seed)}`,
    );
    console.log(`      seed ${JSON.stringify(first.seed)}`);
    pointWrites.push({ id: row.id, seed: first.seed });
  }
  if (vendorPoints.length === 0) console.log("  (none)");

  console.log("\nshots");
  for (const row of shots) {
    const shotSeed = shotSeedByEvent.get(row.event_id);
    if (!shotSeed) {
      unmatched.push(`shot ${row.id} (event ${row.event_id})`);
      console.log(
        `  ✗ event ${row.event_id} ${row.id} — no seeded shot with that event_id`,
      );
      continue;
    }
    const back = shotMatchesSeed(row, shotSeed);
    console.log(
      `  event ${row.event_id} ${row.id} ${row.status} · ${back ? "values equal the seed (within tolerance)" : diff(LABEL_SHOT_VALUE_FIELDS, row, shotSeed, (f, a, b) => sameShotValue(f, a as never, b as never))}`,
    );
    console.log(`      seed ${JSON.stringify(shotSeed)}`);
    shotWrites.push({ id: row.id, seed: shotSeed });
  }
  if (shots.length === 0) console.log("  (none)");

  if (unmatched.length > 0) {
    console.log(
      `\n${unmatched.length} row(s) could not be matched and are skipped:`,
    );
    for (const u of unmatched) console.log(`  ${u}`);
  }
  for (const w of warnings) console.log(`\nWARNING: ${w}`);

  console.log(
    `\nwould write seed on ${pointWrites.length} point(s) and ${shotWrites.length} shot(s)`,
  );

  if (!write) {
    console.log("Nothing was written. Re-run with --write to write the seeds.");
    return;
  }
  if (warnings.length > 0) {
    console.log("NOT WRITTEN: resolve the warning(s) above first.");
    process.exit(1);
  }

  let written = 0;
  for (const { table, rows } of [
    { table: "label_points" as const, rows: pointWrites },
    { table: "label_shots" as const, rows: shotWrites },
  ]) {
    for (const row of rows) {
      // Only where it is still null: never overwrite a seed.
      const { data, error } = await supabase
        .from(table)
        .update({ seed: row.seed })
        .eq("id", row.id)
        .is("seed", null)
        .select("id");
      if (error) throw new Error(`${table} ${row.id}: ${error.message}`);
      written += data?.length ?? 0;
    }
  }
  console.log(`Wrote seed on ${written} row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
