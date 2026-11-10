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
import type { FlagCounts } from "@/lib/services/labels/job-groups";
import { ADMIN_REQUIRED } from "@/lib/services/labels/edit-session";
import { parseLabelStartScore } from "@/lib/services/labels/session-fields";
import { normalizePlayerHand } from "@/components/dashboard/matches/player-hands";
import {
  PLAYBACK_JOB_COLUMNS,
  PLAYBACK_JOB_COLUMNS_BEFORE_STORE,
  choosePlaybackFile,
  isMissingColumnError,
  type PlaybackJobRow,
} from "@/lib/data/match-video-choice";
import { resolveAzureStorageConfig } from "@/lib/services/splitstep/video-url/azure-sas";
import {
  mintStoredPlayback,
  storedObjectExists,
} from "@/lib/services/video-storage/stores";
import {
  orderLabelShots,
  type LabelPoint,
  type LabelSession,
  type LabelShot,
  type LabelSide,
  type LabelVideo,
  type MatchScore,
} from "@/lib/services/labels/session";
import {
  readJobAdScoring,
  readFormatAdScoring,
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
import { cachedTranscriptForJob } from "@/lib/services/labels/transcript-cache";
import { idChunks } from "@/lib/services/labels/chunks";
import { labellerName } from "@/lib/services/labels/assign-session";

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
    status: "labelling" | "submitted" | "complete";
    /** `label_points` with `checked_at` set, excluding tombstones. */
    checked: number;
    /** `label_points` excluding tombstones — the denominator "N of M". */
    total: number;
    /**
     * What the console last counted open (`open_counts`), amber and grey;
     * null until the session is opened with marks.
     */
    openCounts: FlagCounts | null;
    /** The labeller it is assigned to (`assigned_to`); null when unassigned. */
    assignedTo: { id: string; name: string } | null;
    /** When `assigned_to` was last set. */
    assignedAt: string | null;
    /** When the labeller submitted; set exactly while `status` is submitted. */
    submittedAt: string | null;
    /**
     * Minutes of active work on the session, everyone's: the count of its
     * `label_work_beats` rows (one per user per minute, work-beats-session.ts).
     */
    minutesWorked: number;
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
  /**
   * `matches.format` (jsonb): its `ad_scoring` is the scoring's last
   * fallback (`readFormatAdScoring`, ad-scoring.ts), and `play_on_lets` is read by
   * `readPlayOnLets`.
   */
  format?: unknown;
  /**
   * The entered hands: `player_*` is the account holder's, `opponent_*` the
   * other side's (`enteredSeats` says which seat each is).
   */
  player_hand?: string | null;
  opponent_hand?: string | null;
  player1_id?: string | null;
  player2_id?: string | null;
  opponent_player_id?: string | null;
}
interface DbSession {
  id: string;
  job_id: string;
  status: "labelling" | "submitted" | "complete";
  started_at: string;
  open_counts: unknown;
  assigned_at: string | null;
  submitted_at: string | null;
  /** Who started the session, or the labeller who submitted it. */
  labeller: string | null;
  /** Embedded `users` row through `assigned_to` (many-to-one: one or none). */
  assignee: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

/** `open_counts` as the list reads it; anything malformed reads as none. */
export function readOpenCounts(value: unknown): FlagCounts | null {
  if (!value || typeof value !== "object") return null;
  const { amber, grey } = value as Record<string, unknown>;
  return typeof amber === "number" && typeof grey === "number"
    ? { amber, grey }
    : null;
}
interface DbLabelPoint {
  session_id: string;
  checked_at: string | null;
}

/**
 * List every completed Advantage Intelligence job that has a results file,
 * newest-completed first. A job with none (a copied or sample match, never
 * run by the vendor) cannot be seeded, so it is not offered.
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
    .not("results_object_key", "is", null)
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
      // The assignee rides along as an embed on `assigned_to` (the hint names
      // the column: `labeller` also points at `users`), so the names cost no
      // extra round trip.
      .select(
        "id, job_id, status, started_at, open_counts, assigned_at, submitted_at, labeller, assignee:users!assigned_to(id, email, first_name, last_name)",
      )
      .in("job_id", jobIds)
      // Practice copies are graded on their own page, never the job's session.
      .neq("kind", "practice")
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

  const sessions = [...sessionByJob.values()];
  const sessionIds = sessions.map((session) => session.id);
  const [progressBySession, minutesBySession] = await Promise.all([
    countLabelPointProgress(db, sessionIds),
    countLabelWorkMinutes(
      db,
      sessions.map((session) => ({
        id: session.id,
        labellerId: session.labeller,
      })),
    ),
  ]);

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
            openCounts: readOpenCounts(session.open_counts),
            assignedTo: session.assignee
              ? {
                  id: session.assignee.id,
                  name: labellerName(
                    session.assignee.first_name,
                    session.assignee.last_name,
                    session.assignee.email,
                  ),
                }
              : null,
            assignedAt: session.assigned_at ?? null,
            submittedAt: session.submitted_at ?? null,
            minutesWorked: minutesBySession.get(session.id) ?? 0,
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
export async function countLabelPointProgress(
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

/**
 * Minutes worked per session: the labelling work on it, as beat rows
 * counted. The vendor's labour is every non-admin's beats on the session —
 * all of them, so a session reassigned from one labeller to another keeps
 * both people's time. An admin who opens the session to review it also posts
 * beats; those are their time, not the vendor's, and never count — except on
 * a session no labeller has touched, where the admin who labelled it
 * (`labellerId`) is the one doing the work and their beats are the figure.
 *
 * PostgREST has no GROUP BY, so it is one read of `session_id, user_id` and
 * each beat's `users.is_admin` (one foreign key, so the embed needs no hint)
 * for the listed sessions, counted in memory and walked by `readAllPages` —
 * a beat is at most one row per person per minute, ~60 an hour a session.
 */
export async function countLabelWorkMinutes(
  db: AdminClient,
  sessions: readonly { id: string; labellerId: string | null }[],
): Promise<Map<string, number>> {
  const minutes = new Map<string, number>();
  if (sessions.length === 0) return minutes;
  const labellerBySession = new Map(sessions.map((s) => [s.id, s.labellerId]));

  type BeatRow = {
    session_id: string;
    user_id: string;
    /** Many-to-one through `user_id`: one row or none. */
    user: { is_admin: boolean | null } | null;
  };
  const rows = await readAllPages<BeatRow>(
    db
      .from("label_work_beats")
      .select("session_id, user_id, user:users(is_admin)")
      .in("session_id", [...labellerBySession.keys()])
      .order("session_id")
      .order("user_id")
      .order("minute")
      .returns<BeatRow[]>(),
    "Could not read label work minutes",
  );
  const vendor = new Map<string, number>();
  const ownLabeller = new Map<string, number>();
  const bump = (into: Map<string, number>, id: string) =>
    into.set(id, (into.get(id) ?? 0) + 1);
  for (const row of rows) {
    if (row.user?.is_admin !== true) bump(vendor, row.session_id);
    else if (row.user_id === labellerBySession.get(row.session_id)) {
      bump(ownLabeller, row.session_id);
    }
  }
  for (const id of labellerBySession.keys()) {
    const count = vendor.get(id) ?? ownLabeller.get(id) ?? 0;
    if (count > 0) minutes.set(id, count);
  }
  return minutes;
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
export const sessionDefaults: SessionDependencies = {
  ...defaults,
  loadVideo: loadJobVideo,
  buildMarks: buildJobMarks,
};

interface DbSessionRow {
  id: string;
  /** Null once the job row is gone (the key is ON DELETE SET NULL). */
  job_id: string | null;
  match_id: string;
  status: "labelling" | "submitted" | "complete";
  derivation_version: string;
  /** `analyst`, or a `practice` copy (never published). */
  kind?: "analyst" | "practice";
  /** Practice only: the one set the copy covers, or null. */
  practice_set_number?: number | null;
  /** Null until the labeller sets it — then the job's value stands in. */
  ad_scoring: boolean | null;
  /** False on the ground-truth session; marks are never computed for it. */
  marks_enabled: boolean;
  /** jsonb array of `[p1, p2]` pairs, parsed by `parseFinalScore`; null until set. */
  final_score?: unknown;
  video_ends_early?: boolean | null;
  /** jsonb object parsed by `parseLabelStartScore` (session-fields.ts); null until set. */
  start_score?: unknown;
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
      "id, job_id, match_id, status, derivation_version, kind, practice_set_number, ad_scoring, marks_enabled, final_score, video_ends_early, start_score",
    )
    .eq("id", sessionId)
    .maybeSingle<Omit<DbSessionRow, "kind"> & { kind?: string | null }>();
  if (sessionError) {
    throw new Error(`Could not read label session: ${sessionError.message}`);
  }
  // A player's self review lives in the same table (`kind = 'self'`, no
  // vendor file behind it); the console never opens one. A practice copy
  // opens like an analyst session and is refused at publish.
  if (!session || session.kind === "self") return null;
  const row: DbSessionRow = {
    ...session,
    kind: session.kind === "practice" ? "practice" : "analyst",
  };

  const [extra, matchResult, jobResult, pointRows, shotRows] =
    await Promise.all([
      beside?.(row) as Promise<T>,
      db
        .from("matches")
        .select(
          "id, player1_name, player2_name, score, format, player_hand, opponent_hand, player1_id, player2_id, opponent_player_id",
        )
        .eq("id", row.match_id)
        .maybeSingle<DbMatch>(),
      // The job's scoring is only the fallback for a session that has not
      // set its own; a session whose job is gone has nothing to fall back to.
      readJobAdScoring(db, row),
      readAllPages<LabelPointRow>(
        db
          .from("label_points")
          .select(LABEL_POINT_COLUMNS)
          .eq("session_id", row.id)
          .order("point_index")
          .order("id"),
        "Could not read label points",
      ),
      readAllPages<LabelShotRow>(
        db
          .from("label_shots")
          .select(LABEL_SHOT_COLUMNS)
          .eq("session_id", row.id)
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

  const match = matchResult.data ?? null;
  const built = buildLabelSession(
    row,
    match,
    pointRows,
    shotRows,
    jobResult.data ?? null,
  );
  built.enteredHands = await readEnteredHands(db, match);
  return { session: built, beside: extra };
}

/**
 * Each seat's entered hand: the match row's own (what was true for THIS
 * match), else the seat's profile. A seat id is a login (`users.id`) or a
 * roster profile (`program_players.id`), so both are looked up. Never a
 * throw: a failed lookup leaves the console to infer the hand.
 */
async function readEnteredHands(
  db: AdminClient,
  match: DbMatch | null,
): Promise<NonNullable<LabelSession["enteredHands"]>> {
  const { ids } = enteredSeats(match);
  const profile = new Map<string, string | null>();
  const wanted = [ids.p1, ids.p2].filter((id): id is string => id !== null);
  if (wanted.length > 0) {
    const [users, roster] = await Promise.all([
      db.from("users").select("id, hand").in("id", wanted),
      db.from("program_players").select("id, hand").in("id", wanted),
    ]);
    for (const row of [...(users.data ?? []), ...(roster.data ?? [])]) {
      if (!profile.get(row.id)) profile.set(row.id, row.hand ?? null);
    }
  }
  return enteredHandsFor(match, (id) => profile.get(id) ?? null);
}

/**
 * Which seat the match row's `player_*` / `opponent_*` columns describe, and
 * each seat's id. `player_*` is the account holder's ("you"), as the match
 * page reads it (`transformDbMatchToMatch`), not seat 1's: the wizard seats
 * them first, but a row with only `player2_id` set seats them second (old
 * SwingVision imports), and then the opponent — `opponent_player_id` when
 * the row names one — is seat 1.
 */
/** What `enteredHandsFor` reads of the match row. */
export type EnteredHandsRow = Pick<
  DbMatch,
  | "player_hand"
  | "opponent_hand"
  | "player1_id"
  | "player2_id"
  | "opponent_player_id"
>;

function enteredSeats(match: EnteredHandsRow | null): {
  youAreP2: boolean;
  ids: Record<LabelSide, string | null>;
} {
  const youAreP2 = !match?.player1_id && !!match?.player2_id;
  const opponent = match?.opponent_player_id ?? null;
  return {
    youAreP2,
    ids: youAreP2
      ? { p1: opponent, p2: match?.player2_id ?? null }
      : { p1: match?.player1_id ?? null, p2: match?.player2_id ?? opponent },
  };
}

/**
 * The seats' hands from the row's entered columns, else each seat's profile
 * hand (`profileHand`, by seat id). Pure and exported for the spec.
 */
export function enteredHandsFor(
  match: EnteredHandsRow | null,
  profileHand: (id: string) => string | null,
): NonNullable<LabelSession["enteredHands"]> {
  const { youAreP2, ids } = enteredSeats(match);
  const you = match?.player_hand ?? null;
  const opponent = match?.opponent_hand ?? null;
  const hand = (entered: string | null, id: string | null) =>
    normalizePlayerHand(entered) ??
    normalizePlayerHand(id ? profileHand(id) : null);
  return {
    p1: hand(youAreP2 ? opponent : you, ids.p1),
    p2: hand(youAreP2 ? you : opponent, ids.p2),
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
 * The default `buildMarks`: the job's transcript and rallies — from
 * `label_transcript_cache` when the job's inputs have not changed since the
 * last reconciled build, otherwise downloaded and derived with the current
 * code (transcript-cache.ts) — with the join onto the label rows returned as
 * a function, for the points once they are built. The join is never cached:
 * it runs over the request's live rows on every load. Throws when the
 * transcript could not be built or did not reconcile (`joinMarks` turns that
 * into a logged null). Never reads a stored flags column (marks.ts).
 */
export async function buildJobMarks(
  db: AdminClient,
  jobId: string,
): Promise<MarksJoin> {
  const { transcript, rallies } = await cachedTranscriptForJob(db, jobId);
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
 * cannot use. The wizard's tiebreak arrays (`player1_tiebreaks`,
 * `player2_tiebreaks`: one number or null per set) come through typed when
 * they have that shape and are dropped when they do not; any further key
 * (`winner`) is left where it is.
 */
export function parseMatchScore(value: unknown): MatchScore | null {
  if (!value || typeof value !== "object") return null;
  const { player1, player2, player1_tiebreaks, player2_tiebreaks } =
    value as Record<string, unknown>;
  const isGames = (list: unknown): list is number[] =>
    Array.isArray(list) &&
    list.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!isGames(player1) || !isGames(player2)) return null;
  const isTiebreaks = (list: unknown): list is (number | null)[] =>
    Array.isArray(list) &&
    list.every(
      (n) => n === null || (typeof n === "number" && Number.isFinite(n)),
    );
  const {
    player1_tiebreaks: _p1,
    player2_tiebreaks: _p2,
    ...rest
  } = value as Record<string, unknown>;
  return {
    // The record's other keys (`winner`) ride along, as they always have.
    ...(rest as unknown as Omit<MatchScore, "player1" | "player2">),
    player1,
    player2,
    ...(isTiebreaks(player1_tiebreaks)
      ? { player1_tiebreaks: player1_tiebreaks }
      : {}),
    ...(isTiebreaks(player2_tiebreaks)
      ? { player2_tiebreaks: player2_tiebreaks }
      : {}),
  };
}

/**
 * `matches.format.best_of` as a whole number, else 3 — as
 * persist-transcript.ts and apply-session.ts read it.
 */
export function readBestOf(format: unknown): number {
  if (!format || typeof format !== "object") return 3;
  const value = (format as Record<string, unknown>).best_of;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 3;
}

/**
 * `matches.format.play_on_lets`, as a boolean: true only when the column
 * literally says so. A null format, a missing key, or anything but `true`
 * reads as lets replayed.
 */
export function readPlayOnLets(format: unknown): boolean {
  if (!format || typeof format !== "object") return false;
  return (format as Record<string, unknown>).play_on_lets === true;
}

/**
 * Point rows → the console's points, in `point_index` order, each with its
 * shots folded under it in video order (`orderLabelShots`), never the order
 * PostgREST returned them in. A shot whose point is not in `pointRows` is
 * dropped: the by-id reader asks for shots by owning point, so none is.
 */
export function buildLabelPoints(
  pointRows: readonly LabelPointRow[],
  shotRows: readonly LabelShotRow[],
): LabelPoint[] {
  const shotsByPoint = new Map<string, LabelShot[]>();
  for (const row of shotRows) {
    const list = shotsByPoint.get(row.label_point_id) ?? [];
    list.push(toLabelShot(row));
    shotsByPoint.set(row.label_point_id, list);
  }
  return [...pointRows]
    .sort((a, b) => a.point_index - b.point_index)
    .map((row) =>
      toLabelPoint(row, orderLabelShots(shotsByPoint.get(row.id) ?? [])),
    );
}

/**
 * Some of a session's points, by id, each built whole with its shots — what
 * the console's Undo reads back (undo-session.ts): the rows the rewind
 * touched, not the session. `session_id` is on both reads so an id from
 * another session answers nothing. Nothing asked, nothing read.
 */
export async function readLabelPointsByIds(
  db: AdminClient,
  sessionId: string,
  pointIds: readonly string[],
): Promise<LabelPoint[]> {
  if (pointIds.length === 0) return [];
  // In `idChunks` runs: an `.in()` list travels in the URL, and an undone
  // cascade can name a few hundred points.
  const chunks = idChunks(pointIds);
  const [pointRuns, shotRuns] = await Promise.all([
    Promise.all(
      chunks.map((ids) =>
        readAllPages<LabelPointRow>(
          db
            .from("label_points")
            .select(LABEL_POINT_COLUMNS)
            .eq("session_id", sessionId)
            .in("id", ids)
            .order("point_index")
            .order("id"),
          "Could not read label points",
        ),
      ),
    ),
    Promise.all(
      chunks.map((ids) =>
        readAllPages<LabelShotRow>(
          db
            .from("label_shots")
            .select(LABEL_SHOT_COLUMNS)
            .eq("session_id", sessionId)
            .in("label_point_id", ids)
            .order("id"),
          "Could not read label shots",
        ),
      ),
    ),
  ]);
  return buildLabelPoints(pointRuns.flat(), shotRuns.flat());
}

/**
 * Rows → the console's session. Pure and exported for the spec: shots fold
 * under their point by `buildLabelPoints`.
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
  const points = buildLabelPoints(pointRows, shotRows);

  return {
    id: session.id,
    jobId: session.job_id,
    matchId: session.match_id,
    status: session.status,
    kind: session.kind ?? "analyst",
    practiceSetNumber: session.practice_set_number ?? null,
    derivationVersion: session.derivation_version,
    player1Name: match?.player1_name ?? "Player 1",
    player2Name: match?.player2_name ?? "Player 2",
    adScoring: resolveLabelAdScoring(
      session.ad_scoring,
      job?.ad_scoring,
      readFormatAdScoring(match?.format),
    ),
    marksEnabled: session.marks_enabled,
    playOnLets: readPlayOnLets(match?.format),
    finalScore: parseFinalScore(session.final_score ?? null),
    videoEndsEarly: session.video_ends_early ?? null,
    startScore: parseLabelStartScore(session.start_score ?? null),
    matchScore: parseMatchScore(match?.score ?? null),
    bestOf: readBestOf(match?.format),
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
 * session is pinned to one job, so this asks `choosePlaybackFile` about exactly
 * that job, and signs with `mintPlaybackSas`. The playback copy first — the
 * upload's own timeline and sound, index at the front, ≤1080p H.264 (2026-10-19)
 * — then, for a job without one yet, the vendor copy before our upload: an
 * upload that skipped the browser re-encode can run 8–20 Mbps against a 1–17
 * Mbps link to the container, where the vendor's re-encode runs about 2.
 */
async function loadJobVideo(
  db: AdminClient,
  jobId: string,
): Promise<LabelVideo | null> {
  if (!resolveAzureStorageConfig().ok) return null;

  const read = (columns: string) =>
    db
      .from("processing_jobs")
      .select(columns)
      .eq("id", jobId)
      .maybeSingle<PlaybackJobRow>();
  let { data: job, error } = await read(PLAYBACK_JOB_COLUMNS);
  // A database without `playback_store` yet: every copy is in Azure.
  if (isMissingColumnError(error)) {
    ({ data: job, error } = await read(PLAYBACK_JOB_COLUMNS_BEFORE_STORE));
  }
  if (error) throw new Error(`Could not read the job: ${error.message}`);
  if (!job) return null;

  const choice = await choosePlaybackFile(
    [job],
    storedObjectExists,
    "vendor-copy",
  );
  if (!choice) return null;

  // R2 or Azure, the link is signed once into the page and never refreshed,
  // so the eight hours hold in both: R2's ceiling is seven days.
  const { playbackUrl } = mintStoredPlayback({
    key: choice.blobName,
    store: choice.store,
    ttlSeconds: LABEL_PLAYBACK_TTL_SECONDS,
  });
  return { url: playbackUrl, startTimeSeconds: choice.startTimeSeconds };
}
