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
  type LabelEnding,
  type LabelGameType,
  type LabelPoint,
  type LabelPointStatus,
  type LabelServeSide,
  type LabelSession,
  type LabelShot,
  type LabelShotResult,
  type LabelShotStatus,
  type LabelSide,
  type LabelSiteRemoval,
  type LabelSpin,
  type LabelStroke,
  type LabelVideo,
} from "@/lib/services/labels/session";
import {
  parseLabelPointSeed,
  parseLabelShotSeed,
} from "@/lib/services/labels/edit";

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

/* -------------------------------------------------------------------------
 * One session, for the console (T5)
 * ---------------------------------------------------------------------- */

export type GetLabelSessionResult =
  | { ok: true; session: LabelSession; video: LabelVideo | null }
  | { ok: false; reason: "admin-required"; message: string }
  | { ok: false; reason: "not-found" };

interface SessionDependencies extends Dependencies {
  /**
   * The job's playable file, or null. Allowed to fail: a video that cannot be
   * signed leaves the console without a player, never without its table.
   */
  loadVideo: (db: AdminClient, jobId: string) => Promise<LabelVideo | null>;
}
const sessionDefaults: SessionDependencies = {
  ...defaults,
  loadVideo: loadJobVideo,
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
}
/** The one column of the session's job the console needs. */
interface DbJobScoringRow {
  ad_scoring: boolean | null;
}
interface DbPointRow {
  id: string;
  point_index: number;
  vendor_rally_ids: number[];
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  game_type: LabelGameType;
  status: LabelPointStatus;
  status_before_delete: Exclude<LabelPointStatus, "deleted"> | null;
  checked_at: string | null;
  note: string | null;
  dismissed: string[];
  /** jsonb, parsed by `parseLabelPointSeed` before anything trusts it. */
  seed?: unknown;
}
interface DbShotRow {
  id: string;
  label_point_id: string;
  event_id: number | null;
  after_event_id: number | null;
  status: LabelShotStatus;
  status_before_delete: Exclude<LabelShotStatus, "deleted"> | null;
  delete_reason: string | null;
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  spin: LabelSpin | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
  site_removal: LabelSiteRemoval | null;
  site_removal_restored_at: string | null;
  /** jsonb, parsed by `parseLabelShotSeed` before anything trusts it. */
  seed?: unknown;
}

/**
 * One label session with its match's players, every point (tombstones
 * included — the console draws them as markers) and every point's strokes in
 * video order.
 *
 * Same shape as {@link listLabelJobs}: re-checks `requireAdmin` even though
 * `admin/layout.tsx` already gates the route, then reads service-role. A
 * malformed id is `not-found` rather than a PostgREST 22P02 thrown at the
 * page, since a hand-edited URL is the only way to produce one.
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

  const { data: session, error: sessionError } = await db
    .from("label_sessions")
    .select(
      "id, job_id, match_id, status, derivation_version, ad_scoring, marks_enabled",
    )
    .eq("id", sessionId)
    .maybeSingle<DbSessionRow>();
  if (sessionError) {
    throw new Error(`Could not read label session: ${sessionError.message}`);
  }
  if (!session) return { ok: false, reason: "not-found" };

  const [matchResult, jobResult, pointRows, shotRows, video] =
    await Promise.all([
      db
        .from("matches")
        .select("id, player1_name, player2_name")
        .eq("id", session.match_id)
        .maybeSingle<DbMatch>(),
      // The job's scoring is only the fallback for a session that has not
      // set its own; a session whose job is gone has nothing to fall back to.
      session.ad_scoring === null && session.job_id
        ? db
            .from("processing_jobs")
            .select("ad_scoring")
            .eq("id", session.job_id)
            .maybeSingle<DbJobScoringRow>()
        : Promise.resolve({ data: null, error: null }),
      readAllPages<DbPointRow>(
        db
          .from("label_points")
          .select(
            "id, point_index, vendor_rally_ids, set_number, game_number, server, serve_side, winner, ending, ended_by, game_type, status, status_before_delete, checked_at, note, dismissed, seed",
          )
          .eq("session_id", session.id)
          .order("point_index")
          .order("id"),
        "Could not read label points",
      ),
      readAllPages<DbShotRow>(
        db
          .from("label_shots")
          .select(
            "id, label_point_id, event_id, after_event_id, status, status_before_delete, delete_reason, hitter, stroke, result, spin, contact_x, contact_y, landing_x, landing_y, video_time, site_removal, site_removal_restored_at, seed",
          )
          .eq("session_id", session.id)
          .order("id"),
        "Could not read label shots",
      ),
      // A session whose job is gone has no video to sign; it still opens.
      (session.job_id
        ? deps.loadVideo(db, session.job_id)
        : Promise.resolve(null)
      ).catch((cause: unknown) => {
        console.error("[labels] could not load the session's video", {
          sessionId: session.id,
          message: (cause as Error)?.message,
        });
        return null;
      }),
    ]);
  if (matchResult.error) {
    throw new Error(`Could not read match: ${matchResult.error.message}`);
  }
  if (jobResult.error) {
    throw new Error(`Could not read the job: ${jobResult.error.message}`);
  }

  return {
    ok: true,
    session: buildLabelSession(
      session,
      matchResult.data ?? null,
      pointRows,
      shotRows,
      jobResult.data ?? null,
    ),
    video,
  };
}

/**
 * Whether the scoreboard counts advantage: what the labeller set on the
 * session, else what the job was submitted with, else ad scoring — the
 * default of every format the wizard offers, and the one a blank reading of
 * a college match gets wrong least often. Exported for the spec.
 */
export function resolveLabelAdScoring(
  sessionAdScoring: boolean | null,
  jobAdScoring: boolean | null | undefined,
): boolean {
  return sessionAdScoring ?? jobAdScoring ?? true;
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
  pointRows: readonly DbPointRow[],
  shotRows: readonly DbShotRow[],
  job: DbJobScoringRow | null = null,
): LabelSession {
  const shotsByPoint = new Map<string, LabelShot[]>();
  for (const row of shotRows) {
    const list = shotsByPoint.get(row.label_point_id) ?? [];
    list.push({
      id: row.id,
      labelPointId: row.label_point_id,
      eventId: row.event_id,
      afterEventId: row.after_event_id,
      status: row.status,
      statusBeforeDelete: row.status_before_delete ?? null,
      deleteReason: row.delete_reason,
      hitter: row.hitter,
      stroke: row.stroke,
      result: row.result,
      spin: row.spin,
      contactX: row.contact_x,
      contactY: row.contact_y,
      landingX: row.landing_x,
      landingY: row.landing_y,
      videoTime: row.video_time,
      siteRemoval: row.site_removal ?? null,
      siteRemovalRestoredAt: row.site_removal_restored_at ?? null,
      seed: parseLabelShotSeed(row.seed ?? null),
    });
    shotsByPoint.set(row.label_point_id, list);
  }

  const points: LabelPoint[] = [...pointRows]
    .sort((a, b) => a.point_index - b.point_index)
    .map((row) => ({
      id: row.id,
      pointIndex: row.point_index,
      vendorRallyIds: row.vendor_rally_ids ?? [],
      setNumber: row.set_number,
      gameNumber: row.game_number,
      server: row.server,
      serveSide: row.serve_side,
      winner: row.winner,
      ending: row.ending,
      endedBy: row.ended_by,
      gameType: row.game_type,
      status: row.status,
      statusBeforeDelete: row.status_before_delete ?? null,
      checkedAt: row.checked_at,
      note: row.note ?? null,
      dismissed: row.dismissed ?? [],
      seed: parseLabelPointSeed(row.seed ?? null),
      shots: orderLabelShots(shotsByPoint.get(row.id) ?? []),
    }));

  return {
    id: session.id,
    jobId: session.job_id,
    matchId: session.match_id,
    status: session.status,
    derivationVersion: session.derivation_version,
    player1Name: match?.player1_name ?? "Player 1",
    player2Name: match?.player2_name ?? "Player 2",
    adScoring: resolveLabelAdScoring(session.ad_scoring, job?.ad_scoring),
    marksEnabled: session.marks_enabled,
    points,
  };
}

/**
 * How long the console's playback link lasts. The film tab's 30 minutes is
 * backed by a credential refresh the console does not have: this URL is
 * signed once, when the page renders, and a labelling sitting runs for hours
 * — past expiry every seek to an unbuffered range fails and the player goes
 * dead with nothing on screen. Eight hours covers a working day's sitting;
 * the link is read-only, for one blob, and only ever handed to an admin.
 */
const LABEL_PLAYBACK_TTL_SECONDS = 8 * 60 * 60;

/**
 * The labelled job's own file, signed for playback.
 *
 * Not `getMatchVideo`: that loader answers "what may this viewer watch of
 * this match" through the viewer's own RLS (and an admin is rarely a member
 * of the match's program), and it plays the NEWEST job. A label session is
 * pinned to one job, so this asks `choosePlaybackFile` — the same
 * upload-first, vendor-copy-second rule and the same offset — about exactly
 * that job, and signs with the same `mintPlaybackSas`.
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
