/**
 * Publish a hand-labelling session to its match: replace the match's derived
 * points and shots with the labelled ones (`buildAppliedRows`, apply.ts),
 * then recompute everything the athlete sees. "Mark complete" runs it
 * (session-status-session.ts); scripts/label-apply.ts runs the same steps by
 * hand, with a dry run and `--restore`.
 *
 * Nothing is lost by publishing:
 *   - the label rows keep their seed, so Reopen, edit, Reset and complete
 *     again all work and simply publish again;
 *   - every publish first backs up the version it replaces — points, shots,
 *     bookmarks and match_stats — to `match-results` under
 *     `label-backups/{matchId}/{sessionId}/{stamp}.json`, so the first backup
 *     of a match is the vendor's original and `--restore <key>` puts any one
 *     back;
 *   - the vendor's strokes file stays in storage, so a forced re-derive
 *     (`splitstep-derive.ts --force-over-labels`) rebuilds the original too.
 *
 * Refuses, before writing anything, on: imported points on the match (never
 * mix providers), nothing to write, or a labelled score that differs from the
 * entered one unless `acceptScore` — the console's Mark complete passes it
 * (session-status-session.ts); `scripts/label-apply.ts` asks for
 * `--accept-score`. A build problem no longer refuses: the point or stroke it
 * names is written as far as it can be, or left out, and the answer lists it
 * (`leftOut`).
 */

import { readAllPages } from "@/lib/data/admin-range-read";
import { readLabelSessionRows } from "@/lib/data/labels-server";
import type { AdminClient } from "@/lib/supabase/admin";
import { RESULTS_BUCKET } from "@/lib/services/splitstep/config";
import { labelBackupObjectKey } from "@/lib/services/splitstep/object-keys";
import { requestMatchInsights } from "@/lib/services/splitstep/request-insights";
import {
  buildAppliedRows,
  expectedStats,
  pointInsertRow,
  vendorShotFacts,
  type AppliedPointRow,
} from "./apply";
import { chunksOf } from "./chunks";
import { labelScores } from "./score";
import {
  enteredScore,
  labelSetScores,
  scoreMismatch,
  scoreMismatchSentence,
} from "./set-scores";

type Row = Record<string, unknown>;
const CHUNK = 200;

export interface LabelApplyBackup {
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

const chunks = <T>(rows: readonly T[]): T[][] => chunksOf(rows, CHUNK);

// ── Reads ────────────────────────────────────────────────────────────────────

/** The session with what building its rows needs beside it, or null. */
export async function loadApplyContext(db: AdminClient, sessionId: string) {
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
    if (job.error) {
      throw new Error(`Could not read the job: ${job.error.message}`);
    }
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
  return loaded;
}

export type ApplyContext = NonNullable<
  Awaited<ReturnType<typeof loadApplyContext>>
>;

/** The rows a publish writes, and the checks it refuses on. Pure. */
export function planApply({ session, beside }: ApplyContext) {
  const built = buildAppliedRows({
    points: session.points,
    adScoring: session.adScoring,
    bestOf: beside.bestOf,
    vendor: vendorShotFacts(beside.vendor, beside.startTimeSeconds ?? 0),
    start: session.startScore,
  });
  const scores = labelScores(
    session.points,
    session.adScoring,
    session.startScore,
  );
  const sets = labelSetScores(session.points, scores.games, session.startScore);
  const entered = enteredScore(session.finalScore, session.matchScore);
  // A video that ends before the match can't add up to the entered score.
  const mismatch =
    session.videoEndsEarly === true ? null : scoreMismatch(sets, entered);
  return {
    built,
    sets,
    entered,
    mismatch,
    stats: expectedStats(built.points),
  };
}

/** The match's current derived points, their shots and bookmarks. */
export async function readPublished(db: AdminClient, matchId: string) {
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

export async function readMatchStats(db: AdminClient, matchId: string) {
  const { data, error } = await db
    .from("match_stats")
    .select("*")
    .eq("match_id", matchId);
  if (error) throw new Error(`Could not read match_stats: ${error.message}`);
  return (data ?? []) as Row[];
}

export async function countImported(db: AdminClient, matchId: string) {
  const { count, error } = await db
    .from("points")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId)
    .eq("derived", false);
  if (error) {
    throw new Error(`Could not count imported points: ${error.message}`);
  }
  return count ?? 0;
}

// ── Backups ──────────────────────────────────────────────────────────────────

/** Where a backup is stored (`labelBackupObjectKey`, object-keys.ts). */
export function backupObjectKey(backup: LabelApplyBackup): string {
  return labelBackupObjectKey(backup);
}

export async function storeBackup(
  db: AdminClient,
  backup: LabelApplyBackup,
): Promise<string> {
  const key = backupObjectKey(backup);
  const { error } = await db.storage
    .from(RESULTS_BUCKET)
    .upload(key, JSON.stringify(backup), {
      contentType: "application/json",
      upsert: false,
    });
  if (error) throw new Error(`Could not store the backup: ${error.message}`);
  return key;
}

/**
 * Note a backup's key on its job (`processing_jobs.label_backup_keys`), where
 * the match purge reads it: the purge removes a fixed list, never a listing.
 * Noted BEFORE the upload, so no stored backup goes unnamed; a key whose
 * upload then fails names nothing, and removing it is a no-op. One
 * statement (`append_label_backup_key`), so two publishes on the job at once
 * never drop each other's key.
 */
async function recordBackupKey(db: AdminClient, jobId: string, key: string) {
  const { data, error } = await db.rpc("append_label_backup_key", {
    p_job_id: jobId,
    p_key: key,
  });
  if (error) throw new Error(`Could not note the backup: ${error.message}`);
  if (data !== true) throw new Error("Could not note the backup: no job");
}

export async function readStoredBackup(
  db: AdminClient,
  key: string,
): Promise<LabelApplyBackup> {
  const { data, error } = await db.storage.from(RESULTS_BUCKET).download(key);
  if (error || !data) {
    throw new Error(`Could not read ${key}: ${error?.message ?? "no data"}`);
  }
  return JSON.parse(await data.text()) as LabelApplyBackup;
}

// ── Writes ───────────────────────────────────────────────────────────────────

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
export async function restoreRows(db: AdminClient, backup: LabelApplyBackup) {
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

/**
 * match_stats and the returns backfill, in the order deriveAndPublish runs
 * them, then a new AI summary. Throws on a failed RPC; a failed summary
 * request is reported, not thrown — the statistics are already in.
 */
export async function recompute(
  db: AdminClient,
  matchId: string,
): Promise<{ insightsRequested: boolean }> {
  for (const fn of [
    "calculate_match_stats",
    "backfill_returns_in_and_net_points",
  ]) {
    const { error } = await db.rpc(fn, { p_match_id: matchId });
    if (error) throw new Error(`${fn} failed: ${error.message}`);
  }
  const insights = await requestMatchInsights({ supabase: db, matchId });
  return { insightsRequested: insights.ok };
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
  backup: LabelApplyBackup,
  points: readonly AppliedPointRow[],
  idByNumber: ReadonlyMap<number, string>,
): Promise<number> {
  if (backup.bookmarks.length === 0) return 0;
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
    rows.push({ ...bookmark, point_id: idByNumber.get(nearest.point_number) });
  }
  const { error } = await db
    .from("point_bookmarks")
    .upsert(rows, { onConflict: "user_id,point_id", ignoreDuplicates: true });
  if (error) throw new Error(`bookmark re-link failed: ${error.message}`);
  return rows.length;
}

export type PublishResult =
  | {
      ok: true;
      points: number;
      shots: number;
      /** Build problems published past: a point left out, or written partly. */
      leftOut: string[];
      bookmarksRelinked: number;
      backupKey: string;
      insightsRequested: boolean;
      statsBefore: Row[];
    }
  | { ok: false; error: string };

/**
 * Publish an already-loaded and planned session. The backup is stored before
 * anything is deleted; a failed write puts it back. Throws only if putting it
 * back fails too.
 */
export async function publishPlanned(params: {
  db: AdminClient;
  context: ApplyContext;
  plan: ReturnType<typeof planApply>;
  acceptScore: boolean;
  /** A local copy too (the script keeps one on disk). */
  onBackup?: (backup: LabelApplyBackup) => void;
}): Promise<PublishResult> {
  const { db, context, plan, acceptScore } = params;
  const { session } = context;
  const matchId = session.matchId;

  if (plan.mismatch && !acceptScore) {
    return {
      ok: false,
      error: `Not published: ${scoreMismatchSentence(plan.mismatch)}. Fix the set, mark the video as ending early, or correct the match record.`,
    };
  }
  if (plan.built.points.length === 0) {
    return { ok: false, error: "Not published: there are no points to write." };
  }
  const jobId = session.jobId;
  if (!jobId) {
    return {
      ok: false,
      error:
        "Not published: the match's video job is gone, so the backup would have nowhere to be recorded.",
    };
  }
  const [published, imported, statsBefore] = await Promise.all([
    readPublished(db, matchId),
    countImported(db, matchId),
    readMatchStats(db, matchId),
  ]);
  if (imported > 0) {
    return {
      ok: false,
      error: `Not published: the match holds ${imported} imported point${imported === 1 ? "" : "s"}, and providers are never mixed.`,
    };
  }

  const backup: LabelApplyBackup = {
    kind: "label-apply-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    matchId,
    sessionId: session.id,
    points: published.points,
    shots: published.shots,
    bookmarks: published.bookmarks,
    matchStats: statsBefore,
  };
  await recordBackupKey(db, jobId, backupObjectKey(backup));
  const backupKey = await storeBackup(db, backup);
  params.onBackup?.(backup);

  let written: { idByNumber: Map<number, string>; shots: number };
  let bookmarksRelinked: number;
  try {
    await deleteDerived(db, matchId);
    written = await insertApplied(db, matchId, plan.built.points);
    bookmarksRelinked = await relinkBookmarks(
      db,
      backup,
      plan.built.points,
      written.idByNumber,
    );
  } catch (err) {
    await restoreRows(db, backup);
    return {
      ok: false,
      error: `Not published — the write failed and the previous version was put back: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // The rows are in; a failed recompute leaves match_stats behind them. Said
  // as that, never as "not published" — the athlete already has the points.
  let insightsRequested: boolean;
  try {
    ({ insightsRequested } = await recompute(db, matchId));
  } catch (err) {
    return {
      ok: false,
      error: `The labelled points are published, but the statistics could not be rebuilt (${err instanceof Error ? err.message : String(err)}). Mark complete again to retry; the previous version is backed up at ${backupKey}.`,
    };
  }
  return {
    ok: true,
    points: plan.built.points.length,
    shots: written.shots,
    leftOut: plan.built.problems,
    bookmarksRelinked,
    backupKey,
    insightsRequested,
    statsBefore,
  };
}

/**
 * Load, plan and publish one session. A session labelled with marks off is
 * published whatever its score: it draws no score flag and cannot be told the
 * video ends early (session-fields-session.ts), so a refusal there would have
 * no answer the console can give.
 */
export async function publishLabelSession(params: {
  db: AdminClient;
  sessionId: string;
  acceptScore: boolean;
}): Promise<PublishResult> {
  const context = await loadApplyContext(params.db, params.sessionId);
  if (!context) return { ok: false, error: "Session not found." };
  return publishPlanned({
    db: params.db,
    context,
    plan: planApply(context),
    acceptScore: params.acceptScore || !context.session.marksEnabled,
  });
}
