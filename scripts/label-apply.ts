/**
 * Apply a completed hand-labelling session to its match: replace the match's
 * published points and shots with what the labeller saw on the video, then
 * recompute everything the athlete sees.
 *
 *   npx tsx scripts/label-apply.ts --session <uuid>                  # dry run
 *   npx tsx scripts/label-apply.ts --session <uuid> --preview        # dry run, still labelling
 *   npx tsx scripts/label-apply.ts --session <uuid> --write          # apply
 *   npx tsx scripts/label-apply.ts --session <uuid> --write --accept-score
 *   npx tsx scripts/label-apply.ts --restore <backup.json>           # undo
 *
 * Dry run by default: it reads only (SELECTs), builds the rows
 * (`src/lib/services/labels/apply.ts`), checks the labelled final score
 * against `matches.score`, and prints an expected-statistics preview. It
 * refuses unless `label_sessions.status = 'complete'`; `--preview` allows a
 * dry run on a session still `labelling`, and can never write.
 *
 * --write, in order:
 *   1. backs up the match's current derived points, their shots and
 *      bookmarks, and its match_stats, to a JSON file OUTSIDE the repo
 *      (~/Desktop/advantage-label-apply-backups/);
 *   2. deletes the match's `derived = true` points (shots cascade) and inserts
 *      the labelled rows, flagged `hand_labelled` — persist-transcript.ts then
 *      refuses to re-derive over them without `allowOverwriteLabels`;
 *   3. re-links bookmarks to the new point nearest in video_time;
 *   4. RPC calculate_match_stats, then backfill_returns_in_and_net_points
 *      (the order deriveAndPublish runs them in), then asks generate-insights
 *      for a new summary;
 *   5. prints match_stats before and after.
 * No "analysis ready" email is sent.
 *
 * --restore <backup.json> puts a backup's rows back the same way (delete the
 * derived points, insert the backup's, bookmarks included) and recomputes.
 *
 * LABELS ARE A REAL ATHLETE'S DATA: the output names the players, and the
 * backups hold the match's rows. Neither belongs in the repo.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import { readAllPages } from "@/lib/data/admin-range-read";
import { readLabelSessionRows } from "@/lib/data/labels-server";
import {
  HAND_LABELLED_FLAG,
  buildAppliedRows,
  expectedStats,
  pointInsertRow,
  vendorShotFacts,
  type AppliedPointRow,
  type SideStats,
} from "@/lib/services/labels/apply";
import { labelScores } from "@/lib/services/labels/score";
import {
  enteredScore,
  formatSets,
  labelSetScores,
  scoreMismatch,
  scoreMismatchSentence,
} from "@/lib/services/labels/set-scores";
import { requestMatchInsights } from "@/lib/services/splitstep/request-insights";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

const BACKUP_DIR = join(homedir(), "Desktop", "advantage-label-apply-backups");
const CHUNK = 200;

type Row = Record<string, unknown>;

interface Backup {
  kind: "label-apply-backup";
  version: 1;
  createdAt: string;
  matchId: string;
  sessionId: string | null;
  points: Row[];
  shots: Row[];
  bookmarks: Row[];
  matchStats: Row[];
}

function argValue(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  return at === -1 ? null : (argv[at + 1] ?? null);
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(
    "usage: npx tsx scripts/label-apply.ts --session <uuid> [--write] [--accept-score] [--preview]\n" +
      "       npx tsx scripts/label-apply.ts --restore <backup.json> [--session <uuid>]",
  );
  process.exit(1);
}

function chunks<T>(rows: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** The match's current derived points, their shots and bookmarks. */
async function readPublished(db: AdminClient, matchId: string) {
  const points = await readAllPages<Row>(
    db
      .from("points")
      .select("*")
      .eq("match_id", matchId)
      .eq("derived", true)
      .order("point_number"),
    "Could not read the match's points",
  );
  const ids = points.map((p) => p.id as string);
  const shots: Row[] = [];
  const bookmarks: Row[] = [];
  for (const part of chunks(ids)) {
    shots.push(
      ...(await readAllPages<Row>(
        db.from("shots").select("*").in("point_id", part).order("id"),
        "Could not read the match's shots",
      )),
    );
    bookmarks.push(
      ...(await readAllPages<Row>(
        db
          .from("point_bookmarks")
          .select("*")
          .in("point_id", part)
          .order("point_id"),
        "Could not read the match's bookmarks",
      )),
    );
  }
  return { points, shots, bookmarks };
}

async function readMatchStats(db: AdminClient, matchId: string) {
  const { data, error } = await db
    .from("match_stats")
    .select("*")
    .eq("match_id", matchId);
  if (error) throw new Error(`Could not read match_stats: ${error.message}`);
  return (data ?? []) as Row[];
}

async function countImported(db: AdminClient, matchId: string) {
  const { count, error } = await db
    .from("points")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId)
    .eq("derived", false);
  if (error)
    throw new Error(`Could not count imported points: ${error.message}`);
  return count ?? 0;
}

// ── Printing ─────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

function printPreview(
  stats: ReturnType<typeof expectedStats>,
  names: { p1: string; p2: string },
) {
  const rows: [string, (s: SideStats) => string][] = [
    ["Points won", (s) => String(s.pointsWon)],
    ["Service points", (s) => String(s.servicePoints)],
    ["Service games", (s) => String(s.serviceGames)],
    ["Aces", (s) => String(s.aces)],
    ["Double faults", (s) => String(s.doubleFaults)],
    ["Service winners", (s) => String(s.serviceWinners)],
    ["Winners", (s) => String(s.winners)],
    ["Unforced errors", (s) => String(s.unforcedErrors)],
    [
      "First serves in",
      (s) =>
        `${s.firstServesIn}/${s.firstServes} (${pct(s.firstServesIn, s.firstServes)})`,
    ],
    ["Break points faced", (s) => String(s.breakPointsFaced)],
    ["Break points converted", (s) => String(s.breakPointsWon)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log(
    `\nExpected statistics (from the built rows; p1 = ${names.p1}, p2 = ${names.p2})`,
  );
  console.log(`  ${"".padEnd(width)}  ${names.p1.padEnd(18)}  ${names.p2}`);
  for (const [label, read] of rows) {
    console.log(
      `  ${label.padEnd(width)}  ${read(stats.p1).padEnd(18)}  ${read(stats.p2)}`,
    );
  }
}

function printResultTypes(points: readonly AppliedPointRow[]) {
  const byType = new Map<string, number>();
  for (const p of points) {
    const key = p.result_type ?? "(none)";
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  console.log("\nresult_type");
  for (const [k, v] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
}

/** The numeric columns that moved, per match_stats row. */
function printStatsDiff(before: Row[], after: Row[]) {
  const keyOf = (row: Row, i: number) =>
    String(row.player_id ?? row.is_player1 ?? row.id ?? i);
  const was = new Map(before.map((row, i) => [keyOf(row, i), row]));
  console.log("\nmatch_stats before → after");
  if (after.length === 0) console.log("  (no rows after)");
  after.forEach((row, i) => {
    const key = keyOf(row, i);
    const old = was.get(key) ?? {};
    const moved = Object.keys(row)
      .filter((col) => !["id", "created_at", "updated_at"].includes(col))
      .filter((col) => JSON.stringify(old[col]) !== JSON.stringify(row[col]))
      .map(
        (col) =>
          `${col}: ${JSON.stringify(old[col] ?? null)} → ${JSON.stringify(row[col])}`,
      );
    console.log(`  row ${key}${moved.length ? "" : ": unchanged"}`);
    for (const line of moved) console.log(`    ${line}`);
  });
}

// ── Writes (only under --write / --restore) ──────────────────────────────────

function writeBackup(backup: Backup): string {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = backup.createdAt.replace(/[:.]/g, "-");
  const file = join(BACKUP_DIR, `${backup.matchId}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));
  return file;
}

async function deleteDerived(db: AdminClient, matchId: string) {
  const { error } = await db
    .from("points")
    .delete()
    .eq("match_id", matchId)
    .eq("derived", true);
  if (error)
    throw new Error(`Could not clear derived points: ${error.message}`);
}

async function insertRows(db: AdminClient, table: string, rows: Row[]) {
  for (const part of chunks(rows)) {
    const { error } = await db.from(table).insert(part);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

/** Put a backup's rows back: points, then shots, then bookmarks. */
async function restoreRows(db: AdminClient, backup: Backup) {
  await deleteDerived(db, backup.matchId);
  await insertRows(db, "points", backup.points);
  await insertRows(db, "shots", backup.shots);
  for (const part of chunks(backup.bookmarks)) {
    const { error } = await db
      .from("point_bookmarks")
      .upsert(part, { onConflict: "user_id,point_id", ignoreDuplicates: true });
    if (error) throw new Error(`bookmarks restore failed: ${error.message}`);
  }
}

async function recompute(db: AdminClient, matchId: string) {
  for (const fn of [
    "calculate_match_stats",
    "backfill_returns_in_and_net_points",
  ]) {
    const { error } = await db.rpc(fn, { p_match_id: matchId });
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    console.log(`ran ${fn}`);
  }
  const insights = await requestMatchInsights({ supabase: db, matchId });
  console.log(
    insights.ok
      ? "generate-insights: new summary requested"
      : "generate-insights FAILED (logged above); the stats are in, the summary is stale",
  );
}

/** Insert the built rows; returns the new points' ids by point_number. */
async function insertApplied(
  db: AdminClient,
  matchId: string,
  points: readonly AppliedPointRow[],
) {
  const idByNumber = new Map<number, string>();
  for (const part of chunks(points)) {
    const { data, error } = await db
      .from("points")
      .insert(part.map((p) => pointInsertRow(matchId, p)))
      .select("id, point_number");
    if (error || !data) {
      throw new Error(`points insert failed: ${error?.message ?? "no rows"}`);
    }
    for (const row of data as { id: string; point_number: number }[]) {
      idByNumber.set(row.point_number, row.id);
    }
  }
  const shots = points.flatMap((p) => {
    const pointId = idByNumber.get(p.point_number);
    if (!pointId) throw new Error(`point ${p.point_number} lost its id`);
    return p.shots.map((s) => ({ point_id: pointId, ...s }));
  });
  await insertRows(db, "shots", shots);
  return { idByNumber, shots: shots.length };
}

/** Each old bookmark onto the new point whose video_time is nearest. */
async function relinkBookmarks(
  db: AdminClient,
  backup: Backup,
  points: readonly AppliedPointRow[],
  idByNumber: ReadonlyMap<number, string>,
) {
  if (backup.bookmarks.length === 0) return;
  const timeOf = new Map(
    backup.points.map((p) => [p.id as string, p.video_time as number | null]),
  );
  const timed = points.filter((p) => p.video_time !== null);
  const rows: Row[] = [];
  for (const bookmark of backup.bookmarks) {
    const t = timeOf.get(bookmark.point_id as string);
    if (t === null || t === undefined || timed.length === 0) continue;
    const nearest = timed.reduce((best, p) =>
      Math.abs((p.video_time as number) - t) <
      Math.abs((best.video_time as number) - t)
        ? p
        : best,
    );
    rows.push({
      ...bookmark,
      point_id: idByNumber.get(nearest.point_number),
    });
  }
  const { error } = await db
    .from("point_bookmarks")
    .upsert(rows, { onConflict: "user_id,point_id", ignoreDuplicates: true });
  if (error) throw new Error(`bookmark re-link failed: ${error.message}`);
  console.log(
    `re-linked ${rows.length} of ${backup.bookmarks.length} bookmark(s) by nearest video_time`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runRestore(
  db: AdminClient,
  file: string,
  sessionId: string | null,
) {
  const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;
  if (backup.kind !== "label-apply-backup" || !UUID_RE.test(backup.matchId)) {
    usage(`${file} is not a label-apply backup`);
  }
  if (sessionId && backup.sessionId && sessionId !== backup.sessionId) {
    usage(`the backup is of session ${backup.sessionId}, not ${sessionId}`);
  }
  console.log(
    `=== RESTORE match ${backup.matchId} from ${file} (${backup.points.length} points, ${backup.shots.length} shots, ${backup.bookmarks.length} bookmarks) ===`,
  );
  const before = await readMatchStats(db, backup.matchId);
  await restoreRows(db, backup);
  console.log("rows restored");
  await recompute(db, backup.matchId);
  printStatsDiff(before, await readMatchStats(db, backup.matchId));
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const preview = argv.includes("--preview");
  const acceptScore = argv.includes("--accept-score");
  const restore = argv.includes("--restore")
    ? argValue(argv, "--restore")
    : null;
  const sessionId = argValue(argv, "--session");

  if (argv.includes("--restore") && !restore) usage("--restore needs a file");
  if (preview && (write || restore)) {
    usage(
      "--preview is a dry run only: it cannot be combined with --write or --restore",
    );
  }
  if (write && restore) usage("--write and --restore are separate runs");
  if (sessionId !== null && !UUID_RE.test(sessionId)) usage("bad --session");

  const db = createAdminClient();
  if (restore) return runRestore(db, restore, sessionId);
  if (!sessionId) usage();

  const loaded = await readLabelSessionRows(db, sessionId, async (row) => {
    const [vendorRows, job, match] = await Promise.all([
      readAllPages<{ id: string; vendor: unknown }>(
        db
          .from("label_shots")
          .select("id, vendor")
          .eq("session_id", row.id)
          .order("id"),
        "Could not read the vendor strokes",
      ),
      row.job_id
        ? db
            .from("processing_jobs")
            .select("start_time_seconds")
            .eq("id", row.job_id)
            .maybeSingle<{ start_time_seconds: number | string | null }>()
        : Promise.resolve({ data: null, error: null }),
      db
        .from("matches")
        .select("format")
        .eq("id", row.match_id)
        .maybeSingle<{ format: { best_of?: number } | null }>(),
    ]);
    if (job.error)
      throw new Error(`Could not read the job: ${job.error.message}`);
    if (match.error) {
      throw new Error(`Could not read the match: ${match.error.message}`);
    }
    return {
      vendor: vendorRows.map((r) => r.vendor),
      startTimeSeconds: job.data
        ? Number(job.data.start_time_seconds ?? 0)
        : null,
      bestOf: match.data?.format?.best_of ?? 3,
    };
  });
  if (!loaded) usage(`no label session ${sessionId}`);
  const { session, beside } = loaded;

  if (
    session.status !== "complete" &&
    !(preview && session.status === "labelling")
  ) {
    console.error(
      `REFUSED: session is '${session.status}', not 'complete'. Mark it complete in the console first` +
        (session.status === "labelling"
          ? " (or pass --preview for a dry run)."
          : "."),
    );
    process.exit(1);
  }

  const vendor = vendorShotFacts(beside.vendor, beside.startTimeSeconds ?? 0);
  const built = buildAppliedRows({
    points: session.points,
    adScoring: session.adScoring,
    bestOf: beside.bestOf,
    vendor,
  });
  const scores = labelScores(session.points, session.adScoring);
  const sets = labelSetScores(session.points, scores.games);
  const mismatch = scoreMismatch(sets, enteredScore(null, session.matchScore));
  const stats = expectedStats(built.points);
  const names = { p1: session.player1Name, p2: session.player2Name };

  console.log(
    write
      ? "=== WRITE ==="
      : preview
        ? "=== PREVIEW — dry run, nothing written ==="
        : "=== DRY RUN — nothing written ===",
  );
  console.log(
    `session ${session.id} (${session.status}) · match ${session.matchId}`,
  );
  console.log(`p1 = ${names.p1} · p2 = ${names.p2}`);
  console.log(
    `scoring: ${session.adScoring ? "ad" : "no-ad"} · best of ${beside.bestOf} · trim offset ${beside.startTimeSeconds ?? "unknown (job gone)"}s`,
  );
  const labelRows = session.points.length;
  const live = session.points.filter((p) => p.status !== "deleted").length;
  console.log(
    `label rows ${labelRows} (live ${live}) → points ${stats.points} · shots ${stats.shots} · games ${stats.games}`,
  );
  console.log(
    `pressure: break ${built.points.filter((p) => p.is_break_point).length} · set ${built.points.filter((p) => p.is_set_point).length} · match ${built.points.filter((p) => p.is_match_point).length}`,
  );
  const builtShots = built.points.flatMap((p) => p.shots);
  console.log(
    `vendor facts: speed on ${builtShots.filter((s) => s.speed_mph !== null).length} shots · bounce time on ${builtShots.filter((s) => s.bounce_video_time !== null).length} of ${builtShots.length}`,
  );
  console.log(`labelled final score: ${formatSets(sets) || "(none)"}`);
  const entered = enteredScore(null, session.matchScore);
  console.log(
    `matches.score: ${entered ? entered.map((s) => `${s[0]}–${s[1]}`).join(", ") : "(none)"}`,
  );
  if (mismatch) {
    console.log(
      `SCORE MISMATCH: ${scoreMismatchSentence(mismatch)}${acceptScore ? " (accepted by --accept-score)" : ""}`,
    );
  } else {
    console.log("score check: labelled sets match matches.score");
  }
  printResultTypes(built.points);
  printPreview(stats, names);

  if (built.problems.length > 0) {
    console.log(
      `\nPROBLEMS (${built.problems.length}) — a write refuses on any:`,
    );
    for (const line of built.problems) console.log(`  ${line}`);
  }
  if (built.warnings.length > 0) {
    console.log(`\nwarnings (${built.warnings.length}):`);
    for (const line of built.warnings) console.log(`  ${line}`);
  }

  const [published, imported, statsBefore] = await Promise.all([
    readPublished(db, session.matchId),
    countImported(db, session.matchId),
    readMatchStats(db, session.matchId),
  ]);
  const labelled = published.points.filter(
    (p) =>
      Array.isArray(p.flags) &&
      (p.flags as string[]).includes(HAND_LABELLED_FLAG),
  ).length;
  const saved = published.points.filter((p) => p.saved === true).length;
  console.log(
    `\npublished now: ${published.points.length} derived points (${labelled} hand_labelled) · ${published.shots.length} shots · ${imported} imported points · ${statsBefore.length} match_stats row(s)`,
  );
  console.log(
    `bookmarks on those points: ${published.bookmarks.length}${published.bookmarks.length ? " (a write re-links each to the nearest new point by video_time)" : ""} · legacy points.saved: ${saved}${saved ? " (NOT carried over)" : ""}`,
  );

  if (!write) {
    console.log(
      "\nNothing was written. Re-run with --write (on a complete session) to apply.",
    );
    return;
  }

  // ── Write ──
  if (built.problems.length > 0) {
    console.error("REFUSED: fix the problems above in the console first.");
    process.exit(1);
  }
  if (mismatch && !acceptScore) {
    console.error(
      "REFUSED: the labelled score does not match matches.score (--accept-score to override).",
    );
    process.exit(1);
  }
  if (imported > 0) {
    console.error(
      `REFUSED: the match holds ${imported} imported point(s); refusing to mix providers.`,
    );
    process.exit(1);
  }
  if (built.points.length === 0) {
    console.error("REFUSED: nothing to write.");
    process.exit(1);
  }

  const backup: Backup = {
    kind: "label-apply-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    matchId: session.matchId,
    sessionId: session.id,
    points: published.points,
    shots: published.shots,
    bookmarks: published.bookmarks,
    matchStats: statsBefore,
  };
  const file = writeBackup(backup);
  console.log(`\nbackup: ${file}`);

  try {
    await deleteDerived(db, session.matchId);
    const { idByNumber, shots } = await insertApplied(
      db,
      session.matchId,
      built.points,
    );
    console.log(`wrote ${built.points.length} points and ${shots} shots`);
    await relinkBookmarks(db, backup, built.points, idByNumber);
  } catch (err) {
    console.error(
      `WRITE FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error("putting the backup back…");
    await restoreRows(db, backup);
    console.error(`restored. Backup kept at ${file}`);
    process.exit(1);
  }

  await recompute(db, session.matchId);
  printStatsDiff(statsBefore, await readMatchStats(db, session.matchId));
  console.log(`\nUndo with: npx tsx scripts/label-apply.ts --restore ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
