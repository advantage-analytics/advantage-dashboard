/**
 * Apply a completed hand-labelling session to its match: replace the match's
 * published points and shots with what the labeller saw on the video, then
 * recompute everything the athlete sees. "Mark complete" in the console does
 * the same (src/lib/services/labels/apply-session.ts, shared with this); the
 * script is the dry run, the by-hand re-run and the undo.
 *
 *   npx tsx scripts/label-apply.ts --session <uuid>                  # dry run
 *   npx tsx scripts/label-apply.ts --session <uuid> --preview        # dry run, still labelling
 *   npx tsx scripts/label-apply.ts --session <uuid> --write          # apply
 *   npx tsx scripts/label-apply.ts --session <uuid> --write --accept-score
 *   npx tsx scripts/label-apply.ts --restore <backup.json | storage key>  # undo
 *
 * Dry run by default: it reads only (SELECTs), builds the rows
 * (`src/lib/services/labels/apply.ts`), checks the labelled final score
 * against the entered one, and prints an expected-statistics preview. It
 * refuses unless `label_sessions.status = 'complete'`; `--preview` allows a
 * dry run on a session still `labelling`, and can never write.
 *
 * --write, in order (`publishPlanned`):
 *   1. backs up the match's current derived points, their shots and
 *      bookmarks, and its match_stats, to `match-results`
 *      (`label-backups/{match}/{session}/{stamp}.json`) and to a JSON file
 *      OUTSIDE the repo (~/Desktop/advantage-label-apply-backups/);
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
 * --restore puts a backup's rows back the same way (delete the derived
 * points, insert the backup's, bookmarks included) and recomputes. It takes a
 * local file or a `label-backups/…` storage key; a match's first backup is
 * the vendor's original.
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
import {
  HAND_LABELLED_FLAG,
  letsLeftOutLine,
  type AppliedPointRow,
  type SideStats,
  type expectedStats,
} from "@/lib/services/labels/apply";
import {
  countImported,
  loadApplyContext,
  planApply,
  publishPlanned,
  readMatchStats,
  readPublished,
  readStoredBackup,
  recompute,
  restoreRows,
  type LabelApplyBackup,
} from "@/lib/services/labels/apply-session";
import {
  formatSets,
  scoreMismatchSentence,
} from "@/lib/services/labels/set-scores";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

const BACKUP_DIR = join(homedir(), "Desktop", "advantage-label-apply-backups");

type Row = Record<string, unknown>;

function argValue(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  return at === -1 ? null : (argv[at + 1] ?? null);
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(
    "usage: npx tsx scripts/label-apply.ts --session <uuid> [--write] [--accept-score] [--preview]\n" +
      "       npx tsx scripts/label-apply.ts --restore <backup.json | label-backups/…> [--session <uuid>]",
  );
  process.exit(1);
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
    ["Forced errors", (s) => String(s.forcedErrors)],
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

/** The local copy beside the stored one. */
function writeBackup(backup: LabelApplyBackup): string {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = backup.createdAt.replace(/[:.]/g, "-");
  const file = join(BACKUP_DIR, `${backup.matchId}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));
  return file;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runRestore(
  db: AdminClient,
  source: string,
  sessionId: string | null,
) {
  const backup = source.startsWith("label-backups/")
    ? await readStoredBackup(db, source)
    : (JSON.parse(readFileSync(source, "utf8")) as LabelApplyBackup);
  if (backup.kind !== "label-apply-backup" || !UUID_RE.test(backup.matchId)) {
    usage(`${source} is not a label-apply backup`);
  }
  if (sessionId && backup.sessionId && sessionId !== backup.sessionId) {
    usage(`the backup is of session ${backup.sessionId}, not ${sessionId}`);
  }
  console.log(
    `=== RESTORE match ${backup.matchId} from ${source} (${backup.points.length} points, ${backup.shots.length} shots, ${backup.bookmarks.length} bookmarks) ===`,
  );
  const before = await readMatchStats(db, backup.matchId);
  await restoreRows(db, backup);
  console.log("rows restored");
  const { insightsRequested } = await recompute(db, backup.matchId);
  console.log(
    insightsRequested
      ? "recomputed; new summary requested"
      : "recomputed; the summary request FAILED, it is stale",
  );
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

  const context = await loadApplyContext(db, sessionId);
  if (!context) usage(`no label session ${sessionId}`);
  const { session, beside } = context;

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

  const plan = planApply(context);
  const { built, stats, sets, entered, mismatch } = plan;
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
  const live = session.points.filter((p) => p.status !== "deleted").length;
  console.log(
    `label rows ${session.points.length} (live ${live}) → points ${stats.points} · shots ${stats.shots} · games ${stats.games}`,
  );
  console.log(
    `pressure: break ${built.points.filter((p) => p.is_break_point).length} · set ${built.points.filter((p) => p.is_set_point).length} · match ${built.points.filter((p) => p.is_match_point).length}`,
  );
  const builtShots = built.points.flatMap((p) => p.shots);
  console.log(
    `vendor facts: speed on ${builtShots.filter((s) => s.speed_mph !== null).length} shots · bounce time on ${builtShots.filter((s) => s.bounce_video_time !== null).length} of ${builtShots.length}`,
  );
  console.log(letsLeftOutLine(built.letsLeftOut));
  console.log(`labelled final score: ${formatSets(sets) || "(none)"}`);
  console.log(
    `entered score: ${entered ? entered.map((s) => `${s[0]}–${s[1]}`).join(", ") : "(none)"}`,
  );
  if (mismatch) {
    console.log(
      `SCORE MISMATCH: ${scoreMismatchSentence(mismatch)}${acceptScore ? " (accepted by --accept-score)" : ""}`,
    );
  } else {
    console.log("score check: labelled sets match the entered score");
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

  const [published, imported] = await Promise.all([
    readPublished(db, session.matchId),
    countImported(db, session.matchId),
  ]);
  const labelled = published.points.filter(
    (p) =>
      Array.isArray(p.flags) &&
      (p.flags as string[]).includes(HAND_LABELLED_FLAG),
  ).length;
  const saved = published.points.filter((p) => p.saved === true).length;
  console.log(
    `\npublished now: ${published.points.length} derived points (${labelled} hand_labelled) · ${published.shots.length} shots · ${imported} imported points`,
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

  let localFile: string | null = null;
  const result = await publishPlanned({
    db,
    context,
    plan,
    acceptScore,
    onBackup: (backup) => {
      localFile = writeBackup(backup);
    },
  });
  if (!result.ok) {
    // Refusals begin "Not published:"; a written-but-stats-stale publish says
    // the points are in. Printed as each says, never under one REFUSED.
    console.error(`\n${result.error}`);
    process.exit(1);
  }
  console.log(
    `\nbackup: ${result.backupKey}${localFile ? ` (and ${localFile})` : ""}`,
  );
  console.log(`wrote ${result.points} points and ${result.shots} shots`);
  console.log(
    `re-linked ${result.bookmarksRelinked} of ${published.bookmarks.length} bookmark(s)`,
  );
  console.log(
    result.insightsRequested
      ? "generate-insights: new summary requested"
      : "generate-insights FAILED; the stats are in, the summary is stale",
  );
  printStatsDiff(result.statsBefore, await readMatchStats(db, session.matchId));
  console.log(
    `\nUndo with: npx tsx scripts/label-apply.ts --restore ${result.backupKey}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
