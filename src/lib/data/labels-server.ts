/**
 * Loader for `/admin/labels` — the completed Advantage Intelligence jobs an
 * admin can hand-label, each with its match's players, its point count and
 * any label session already in progress.
 *
 * Service-role throughout: `label_sessions`/`label_points` carry admin-only
 * RLS (an authenticated admin's own session client would also pass it), but
 * `processing_jobs` and `matches` are read the same way every other admin
 * loader reads them — see `admin/layout.tsx`'s `loadRequestsCount`.
 */

import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { PROVIDER_ID } from "@/lib/services/splitstep/config";
import { readAllPages } from "@/lib/data/admin-range-read";

/** One completed job an admin could start or continue labelling. */
export interface LabelJobRow {
  jobId: string;
  matchId: string;
  player1Name: string;
  player2Name: string;
  /** `points` rows for the match — the labelling unit, not `shots`. */
  pointCount: number;
  completedAt: string | null;
  /** Null when nobody has started a session for this job yet. */
  session: {
    id: string;
    status: "labelling" | "complete";
    /** `label_points` with `checked_at` set, excluding tombstones. */
    checked: number;
    /** `label_points` excluding tombstones — the denominator "N of M". */
    total: number;
  } | null;
}

export type ListLabelJobsResult =
  | { ok: true; rows: LabelJobRow[] }
  | { ok: false; reason: "admin-required"; message: string };

interface Dependencies {
  requireAdmin: typeof requireAdmin;
  createAdminClient: () => AdminClient;
}
const defaults: Dependencies = { requireAdmin, createAdminClient };

interface DbJob {
  id: string;
  match_id: string;
  completed_at: string | null;
}
interface DbMatch {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
}
interface DbSession {
  id: string;
  job_id: string;
  status: "labelling" | "complete";
  started_at: string;
}
interface DbLabelPoint {
  session_id: string;
  checked_at: string | null;
}

/**
 * List every completed Advantage Intelligence job, newest-completed first.
 *
 * No server action: this is a page loader, called straight from the Server
 * Component, following `getAdminUploadHistory`'s shape rather than
 * `seedLabelSession`'s (a mutation, which is one).
 */
export async function listLabelJobs(
  deps: Dependencies = defaults,
): Promise<ListLabelJobsResult> {
  const viewer = await deps.requireAdmin();
  if (!viewer) {
    return {
      ok: false,
      reason: "admin-required",
      message: "Administrator access is required.",
    };
  }

  const db = deps.createAdminClient();

  const { data: jobs, error: jobsError } = await db
    .from("processing_jobs")
    .select("id, match_id, completed_at")
    .eq("provider", PROVIDER_ID)
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .returns<DbJob[]>();
  if (jobsError) {
    throw new Error(
      `Could not list Advantage Intelligence jobs: ${jobsError.message}`,
    );
  }
  const jobRows = jobs ?? [];
  if (jobRows.length === 0) return { ok: true, rows: [] };

  const matchIds = [...new Set(jobRows.map((job) => job.match_id))];
  const jobIds = jobRows.map((job) => job.id);

  const [matchesResult, sessionsResult, pointCounts] = await Promise.all([
    db
      .from("matches")
      .select("id, player1_name, player2_name")
      .in("id", matchIds)
      .returns<DbMatch[]>(),
    db
      .from("label_sessions")
      .select("id, job_id, status, started_at")
      .in("job_id", jobIds)
      .order("started_at", { ascending: false })
      .returns<DbSession[]>(),
    countPointsByMatch(db, matchIds),
  ]);
  if (matchesResult.error) {
    throw new Error(`Could not read matches: ${matchesResult.error.message}`);
  }
  if (sessionsResult.error) {
    throw new Error(
      `Could not read label sessions: ${sessionsResult.error.message}`,
    );
  }

  const matchById = new Map(
    (matchesResult.data ?? []).map((match) => [match.id, match]),
  );

  // One session per job: the row already came back newest-`started_at`-first,
  // so the first 'labelling' row wins, and the first row of any status is the
  // fallback ("the job's open (or latest) session").
  const sessionByJob = new Map<string, DbSession>();
  for (const session of sessionsResult.data ?? []) {
    const existing = sessionByJob.get(session.job_id);
    if (!existing) {
      sessionByJob.set(session.job_id, session);
    } else if (
      existing.status !== "labelling" &&
      session.status === "labelling"
    ) {
      sessionByJob.set(session.job_id, session);
    }
  }

  const sessionIds = [...sessionByJob.values()].map((session) => session.id);
  const progressBySession = await countLabelPointProgress(db, sessionIds);

  const rows: LabelJobRow[] = jobRows.map((job) => {
    const match = matchById.get(job.match_id);
    const session = sessionByJob.get(job.id) ?? null;
    const progress = session
      ? (progressBySession.get(session.id) ?? { checked: 0, total: 0 })
      : null;
    return {
      jobId: job.id,
      matchId: job.match_id,
      player1Name: match?.player1_name ?? "Player 1",
      player2Name: match?.player2_name ?? "Player 2",
      pointCount: pointCounts.get(job.match_id) ?? 0,
      completedAt: job.completed_at,
      session: session
        ? {
            id: session.id,
            status: session.status,
            checked: progress?.checked ?? 0,
            total: progress?.total ?? 0,
          }
        : null,
    };
  });

  return { ok: true, rows };
}

/** `points` rows per match — a head-only count query per id, run concurrently. */
async function countPointsByMatch(
  db: AdminClient,
  matchIds: string[],
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    matchIds.map(async (matchId) => {
      const { count, error } = await db
        .from("points")
        .select("id", { count: "exact", head: true })
        .eq("match_id", matchId);
      if (error) {
        throw new Error(
          `Could not count points for ${matchId}: ${error.message}`,
        );
      }
      return [matchId, count ?? 0] as const;
    }),
  );
  return new Map(counts);
}

/**
 * "N of M checked" for every session in `sessionIds`: M excludes deleted
 * tombstones, N is the subset of those with `checked_at` set.
 *
 * Read as rows rather than as per-session count queries — one query, grouped
 * in memory — since a job's session rarely holds more than a few hundred
 * points; `readAllPages` still walks it in case a session runs long.
 */
async function countLabelPointProgress(
  db: AdminClient,
  sessionIds: string[],
): Promise<Map<string, { checked: number; total: number }>> {
  const progress = new Map<string, { checked: number; total: number }>();
  if (sessionIds.length === 0) return progress;

  const rows = await readAllPages<DbLabelPoint>(
    db
      .from("label_points")
      .select("session_id, checked_at")
      .in("session_id", sessionIds)
      .neq("status", "deleted")
      .order("id"),
    "Could not read label point progress",
  );

  for (const row of rows) {
    const entry = progress.get(row.session_id) ?? { checked: 0, total: 0 };
    entry.total += 1;
    if (row.checked_at) entry.checked += 1;
    progress.set(row.session_id, entry);
  }
  return progress;
}
