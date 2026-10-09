/**
 * Loader for `/admin/labels`: the completed Advantage Intelligence jobs an
 * admin can hand-label, each with its match's players, its point count and any
 * label session already in progress. Service-role throughout, as every other
 * admin loader reads `processing_jobs` and `matches`.
 */

import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { PROVIDER_ID } from "@/lib/services/splitstep/config";
import { readAllPages } from "@/lib/data/admin-range-read";
import { isUuid } from "@/lib/admin/validation";
import { ADMIN_REQUIRED } from "@/lib/services/labels/edit-session";
import {
  choosePlaybackFile,
  type PlaybackJobRow,
} from "@/lib/data/match-video-choice";
import {
  mintPlaybackSas,
  resolveAzureStorageConfig,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";
import {
  orderLabelShots,
  type LabelPoint,
  type LabelSession,
  type LabelShot,
  type LabelVideo,
  type MatchScore,
} from "@/lib/services/labels/session";
import {
  readJobAdScoring,
  resolveLabelAdScoring,
  type JobScoringRow,
} from "@/lib/services/labels/ad-scoring";
import {
  LABEL_POINT_COLUMNS,
  LABEL_SHOT_COLUMNS,
  toLabelPoint,
  toLabelShot,
  type LabelPointRow,
  type LabelShotRow,
} from "@/lib/services/labels/rows";
import {
  buildLabelMarks,
  type LabelMarks,
  type MarkablePoint,
} from "@/lib/services/labels/marks";
import { buildTranscriptForJob } from "@/lib/services/splitstep/persist-transcript";

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
  /** `matches.score` (jsonb), parsed by `parseMatchScore`. */
  score?: unknown;
  /** `matches.format` (jsonb): its `ad_scoring` is the scoring's last fallback. */
  format?: { ad_scoring?: boolean | null } | null;
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

/** List every completed Advantage Intelligence job, newest-completed first. */
export async function listLabelJobs(
  deps: Dependencies = defaults,
): Promise<ListLabelJobsResult> {
  const viewer = await deps.requireAdmin();
  if (!viewer) {
    return {
      ok: false,
      reason: "admin-required",
      message: ADMIN_REQUIRED,
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
 * "N of M checked" for every session in `sessionIds`: M excludes tombstones, N
 * is the subset with `checked_at` set. One query grouped in memory, walked by
 * `readAllPages` in case a session runs long.
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

/* -------------------------------------------------------------------------
 * One session, for the console
 * ---------------------------------------------------------------------- */

export type GetLabelSessionResult =
  | {
      ok: true;
      session: LabelSession;
      video: LabelVideo | null;
      /**
       * The derivation's marks on this session's rows, built from the job's raw
       * results file with the CURRENT derivation code. Null when the session
       * has `marks_enabled` off, when its job is gone, or when the file could
       * not be downloaded or derived.
       */
      marks: LabelMarks | null;
    }
  | { ok: false; reason: "admin-required"; message: string }
  | { ok: false; reason: "not-found" };

export interface SessionDependencies extends Dependencies {
  /** The job's playable file, or null. Allowed to fail. */
  loadVideo: (db: AdminClient, jobId: string) => Promise<LabelVideo | null>;
  /**
   * The marks' source: the job's raw results file, downloaded and derived, as a
   * join onto the session's rows once they are built. Allowed to fail: a throw
   * is logged and the console opens without marks. Called only when the session
   * has `marks_enabled` and a job.
   */
  buildMarks: (db: AdminClient, jobId: string) => Promise<MarksJoin>;
}

/** The pure half of the marks: the derivation joined onto the built points. */
export type MarksJoin = (
  points: readonly MarkablePoint[],
  options?: { hidden?: boolean },
) => LabelMarks;
const sessionDefaults: SessionDependencies = {
  ...defaults,
  loadVideo: loadJobVideo,
  buildMarks: buildJobMarks,
};

interface DbSessionRow {
  id: string;
  /** Null once the job row is gone (the key is ON DELETE SET NULL). */
  job_id: string | null;
  match_id: string;
  status: "labelling" | "complete";
  derivation_version: string;
  /** Null until the labeller sets it — then the job's value stands in. */
  ad_scoring: boolean | null;
  /** False on the ground-truth session; marks are never computed for it. */
  marks_enabled: boolean;
  /** jsonb array of `[p1, p2]` pairs, parsed by `parseFinalScore`; null until set. */
  final_score?: unknown;
  video_ends_early?: boolean | null;
}

/**
 * One label session with its match's players, every point (tombstones included)
 * and every point's strokes in video order. Re-checks `requireAdmin`, then
 * reads service-role. A malformed id is `not-found` rather than a PostgREST
 * 22P02 thrown at the page.
 */
export async function getLabelSession(
  sessionId: string,
  deps: SessionDependencies = sessionDefaults,
): Promise<GetLabelSessionResult> {
  const viewer = await deps.requireAdmin();
  if (!viewer) {
    return {
      ok: false,
      reason: "admin-required",
      message: ADMIN_REQUIRED,
    };
  }
  if (!isUuid(sessionId)) return { ok: false, reason: "not-found" };

  const db = deps.createAdminClient();
  // The marks' transcript and the video need only the job id, so both run
  // beside the row reads; the marks' join waits for the built points. A failure
  // is held here and logged by `joinMarks`, never thrown.
  const read = await readLabelSessionRows(db, sessionId, (row) =>
    Promise.all([
      row.marks_enabled && row.job_id
        ? deps.buildMarks(db, row.job_id).then(
            (join) => ({ join }),
            (cause: unknown) => ({ cause }),
          )
        : null,
      // A session whose job is gone has no video to sign; it still opens.
      (row.job_id
        ? deps.loadVideo(db, row.job_id)
        : Promise.resolve(null)
      ).catch((cause: unknown) => {
        console.error("[labels] could not load the session's video", {
          sessionId: row.id,
          message: (cause as Error)?.message,
        });
        return null;
      }),
    ]),
  );
  if (!read) return { ok: false, reason: "not-found" };
  const [marksFetch, video] = read.beside;

  return {
    ok: true,
    session: read.session,
    video,
    marks: marksFetch ? joinMarks(marksFetch, read.session) : null,
  };
}

/**
 * One session's rows, read and built — the SELECTs `getLabelSession` and
 * `scripts/label-scorecard.ts` share, with no admin check of their own: the
 * caller's `db` is the authority. Null when there is no such session.
 * `beside` runs next to the row reads once the session row is in.
 */
export async function readLabelSessionRows<T = undefined>(
  db: AdminClient,
  sessionId: string,
  beside?: (row: DbSessionRow) => Promise<T>,
): Promise<{ session: LabelSession; beside: T } | null> {
  const { data: session, error: sessionError } = await db
    .from("label_sessions")
    .select(
      "id, job_id, match_id, status, derivation_version, ad_scoring, marks_enabled, final_score, video_ends_early",
    )
    .eq("id", sessionId)
    .maybeSingle<DbSessionRow>();
  if (sessionError) {
    throw new Error(`Could not read label session: ${sessionError.message}`);
  }
  if (!session) return null;

  const [extra, matchResult, jobResult, pointRows, shotRows] =
    await Promise.all([
      beside?.(session) as Promise<T>,
      db
        .from("matches")
        .select("id, player1_name, player2_name, score, format")
        .eq("id", session.match_id)
        .maybeSingle<DbMatch>(),
      // The job's scoring is only the fallback for a session that has not
      // set its own; a session whose job is gone has nothing to fall back to.
      readJobAdScoring(db, session),
      readAllPages<LabelPointRow>(
        db
          .from("label_points")
          .select(LABEL_POINT_COLUMNS)
          .eq("session_id", session.id)
          .order("point_index")
          .order("id"),
        "Could not read label points",
      ),
      readAllPages<LabelShotRow>(
        db
          .from("label_shots")
          .select(LABEL_SHOT_COLUMNS)
          .eq("session_id", session.id)
          .order("id"),
        "Could not read label shots",
      ),
    ]);
  if (matchResult.error) {
    throw new Error(`Could not read match: ${matchResult.error.message}`);
  }
  if (jobResult.error) {
    throw new Error(`Could not read the job: ${jobResult.error.message}`);
  }

  return {
    session: buildLabelSession(
      session,
      matchResult.data ?? null,
      pointRows,
      shotRows,
      jobResult.data ?? null,
    ),
    beside: extra,
  };
}

/**
 * The session's marks, or null — never a throw. A fetch that failed, or a
 * join that does, is logged and leaves the session intact: the console is
 * usable without them.
 */
function joinMarks(
  settled: { join: MarksJoin } | { cause: unknown },
  session: LabelSession,
): LabelMarks | null {
  try {
    if ("cause" in settled) throw settled.cause;
    return settled.join(session.points);
  } catch (cause: unknown) {
    console.error("[labels] marks unavailable", {
      sessionId: session.id,
      jobId: session.jobId,
      message: (cause as Error)?.message,
    });
    return null;
  }
}

/**
 * The default `buildMarks`: download the job's results file and derive it with
 * the current code; the join onto the label rows comes back as a function, for
 * the points once they are built. Throws when the transcript could not be built
 * or did not reconcile (`joinMarks` turns that into a logged null). Never reads
 * a stored flags column (marks.ts).
 */
export async function buildJobMarks(
  db: AdminClient,
  jobId: string,
): Promise<MarksJoin> {
  const { transcript, rallies, reason } = await buildTranscriptForJob({
    supabase: db,
    jobId,
  });
  if (!transcript || !transcript.ok || !rallies) {
    throw new Error(reason ?? "transcript could not be built");
  }
  return (points, options) =>
    buildLabelMarks(transcript, rallies, points, options);
}

/**
 * `label_sessions.final_score` as the console reads it: an array of `[p1, p2]`
 * games pairs, one per set. Anything else — the column is jsonb and its CHECK
 * only asks for an array — reads as null rather than as a score. Exported for
 * the spec.
 */
export function parseFinalScore(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const sets: number[][] = [];
  for (const entry of value) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !entry.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return null;
    }
    sets.push([entry[0], entry[1]]);
  }
  return sets;
}

/**
 * `matches.score` as the derivation reads it (`{ player1: number[]; player2:
 * number[] }`), or null for a record without one or with a shape the console
 * cannot use. Any further keys (`winner`, tiebreaks) are left where they are.
 */
export function parseMatchScore(value: unknown): MatchScore | null {
  if (!value || typeof value !== "object") return null;
  const { player1, player2 } = value as Record<string, unknown>;
  const isGames = (list: unknown): list is number[] =>
    Array.isArray(list) &&
    list.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!isGames(player1) || !isGames(player2)) return null;
  return { ...(value as MatchScore), player1, player2 };
}

/**
 * Rows → the console's session. Pure and exported for the spec: shots fold
 * under their point and are put in video order by `orderLabelShots`, never
 * by the order PostgREST returned them in.
 *
 * `job` is the session's `processing_jobs` row (its `ad_scoring`), or null
 * when the job is gone or was not read because the session has its own.
 */
export function buildLabelSession(
  session: DbSessionRow,
  match: DbMatch | null,
  pointRows: readonly LabelPointRow[],
  shotRows: readonly LabelShotRow[],
  job: JobScoringRow | null = null,
): LabelSession {
  const shotsByPoint = new Map<string, LabelShot[]>();
  for (const row of shotRows) {
    const list = shotsByPoint.get(row.label_point_id) ?? [];
    list.push(toLabelShot(row));
    shotsByPoint.set(row.label_point_id, list);
  }

  const points: LabelPoint[] = [...pointRows]
    .sort((a, b) => a.point_index - b.point_index)
    .map((row) =>
      toLabelPoint(row, orderLabelShots(shotsByPoint.get(row.id) ?? [])),
    );

  return {
    id: session.id,
    jobId: session.job_id,
    matchId: session.match_id,
    status: session.status,
    derivationVersion: session.derivation_version,
    player1Name: match?.player1_name ?? "Player 1",
    player2Name: match?.player2_name ?? "Player 2",
    adScoring: resolveLabelAdScoring(
      session.ad_scoring,
      job?.ad_scoring,
      match?.format?.ad_scoring,
    ),
    marksEnabled: session.marks_enabled,
    finalScore: parseFinalScore(session.final_score ?? null),
    videoEndsEarly: session.video_ends_early ?? null,
    matchScore: parseMatchScore(match?.score ?? null),
    points,
  };
}

/**
 * How long the console's playback link lasts. The URL is signed once, when the
 * page renders, with no credential refresh, and a labelling sitting runs for
 * hours: past expiry every seek to an unbuffered range fails. Eight hours
 * covers a working day; the link is read-only, for one blob, and only ever
 * handed to an admin.
 */
const LABEL_PLAYBACK_TTL_SECONDS = 8 * 60 * 60;

/**
 * The labelled job's own file, signed for playback. Not `getMatchVideo`: that
 * loader goes through the viewer's own RLS and plays the NEWEST job. A label
 * session is pinned to one job, so this asks `choosePlaybackFile` (the same
 * upload-first, vendor-copy-second rule and the same offset) about exactly that
 * job, and signs with `mintPlaybackSas`.
 */
async function loadJobVideo(
  db: AdminClient,
  jobId: string,
): Promise<LabelVideo | null> {
  if (!resolveAzureStorageConfig().ok) return null;

  const { data: job, error } = await db
    .from("processing_jobs")
    .select("video_object_key, trimmed_object_key, start_time_seconds")
    .eq("id", jobId)
    .maybeSingle<PlaybackJobRow>();
  if (error) throw new Error(`Could not read the job: ${error.message}`);
  if (!job) return null;

  const container = videoContainerClient();
  const choice = await choosePlaybackFile([job], (blobName) =>
    container
      .getBlockBlobClient(blobName)
      .exists()
      .catch(() => false),
  );
  if (!choice) return null;

  const { playbackUrl } = mintPlaybackSas({
    blobName: choice.blobName,
    ttlSeconds: LABEL_PLAYBACK_TTL_SECONDS,
  });
  return { url: playbackUrl, startTimeSeconds: choice.startTimeSeconds };
}
