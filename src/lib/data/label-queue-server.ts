/**
 * The labeller queue, read once and shown two ways: the labeller's board at
 * `/label` and the admin's at `/admin/labels`. The rules — what enters, when
 * it is due, the order, which rows may be claimed — are `queue.ts`'s; this
 * file reads the rows and projects them.
 *
 * Service-role, because a labeller holds no RLS grant on `processing_jobs`,
 * `matches` or `label_sessions`. Each loader runs its gate before it builds a
 * client, and `readLabelQueue` takes a client rather than making one, so the
 * read cannot be reached without a caller that already passed a gate.
 *
 * The boundary `label-assignments-server.ts` holds is kept here: the queue is
 * read with names on it, and `toLabellerBoard` copies out, field by field,
 * only what a labeller may see. A labeller's row never says whose match it
 * is — no player, program, owner or match id — and names another labeller's
 * session by nothing at all. The to-do `jobId` is the key a claim takes; it
 * grants nothing, because the claim reads this queue again on the server.
 */

import { readAllPages } from "@/lib/data/admin-range-read";
import { avatarUrlFor } from "@/lib/data/admin-pilots-server";
import {
  countLabelWorkMinutes,
  readLastLabelBeats,
  readOpenCounts,
} from "@/lib/data/labels-server";
import { programDisplayName } from "@/lib/data/programs-server";
import { labellerName } from "@/lib/services/labels/assign-session";
import { idChunks } from "@/lib/services/labels/chunks";
import {
  LABEL_QUEUE_FROM,
  claimableJobIds,
  enterLabelQueue,
  labelDueAt,
  sortByDue,
  urgencyLevel,
  type QueueSession,
  type UrgencyLevel,
} from "@/lib/services/labels/queue";
import {
  jobVideoSeconds,
  type JobVideoSpan,
} from "@/lib/services/labels/video-seconds";
import {
  requireAdminOrNotFound,
  requireLabelViewerOrNotFound,
  type LabelActor,
} from "@/lib/services/programs/admin-guard";
import { PROVIDER_ID } from "@/lib/services/splitstep/config";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

/* -------------------------------------------------------------------------
 * Flags
 * ---------------------------------------------------------------------- */

/**
 * A row's progress, counted in flags. `resolved` of `total` once the session
 * recorded the count it started with; only what is `left` on a session opened
 * before that was recorded; null before the console has counted at all.
 */
export type BoardFlags =
  { resolved: number; total: number } | { left: number } | null;

/**
 * `label_sessions.start_open_counts` and `open_counts` as a board reads them.
 * Amber and grey count together: a flag is a flag. `resolved` is floored at
 * zero, since work can raise new flags past the starting count.
 */
export function boardFlags(
  startOpenCounts: unknown,
  openCounts: unknown,
): BoardFlags {
  const start = readOpenCounts(startOpenCounts);
  const open = readOpenCounts(openCounts);
  if (start) {
    const total = start.amber + start.grey;
    // No current count beside a start cannot happen (the start is copied from
    // the first one); read it as nothing resolved rather than everything.
    const left = open ? open.amber + open.grey : total;
    return { resolved: Math.max(0, total - left), total };
  }
  return open ? { left: open.amber + open.grey } : null;
}

/* -------------------------------------------------------------------------
 * The queue
 * ---------------------------------------------------------------------- */

/** A `processing_jobs` row as the queue reads it. */
export interface QueueJobRow extends JobVideoSpan {
  id: string;
  match_id: string;
  completed_at: string | null;
  priority: string | null;
}

interface QueueProgramRow {
  school_name: string | null;
  team: string | null;
}

/** A `matches` row as the queue reads it, its program embedded. */
export interface QueueMatchRow {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
  /** The match's owner (`users.id`). */
  created_by: string | null;
  programs: QueueProgramRow | QueueProgramRow[] | null;
}

/** A non-practice `label_sessions` row as the queue reads it. */
export interface QueueSessionRow {
  id: string;
  job_id: string;
  status: string;
  started_at: string;
  open_counts: unknown;
  /** Absent until `20261114022117_label_queue_claims` is applied. */
  start_open_counts?: unknown;
  assigned_to: string | null;
  assigned_at: string | null;
  /** Absent until `20261114022117_label_queue_claims` is applied. */
  claimed_at?: string | null;
  submitted_at: string | null;
  /** Who started the session, or the labeller who submitted it. */
  labeller: string | null;
  /** Embedded `users` row through `assigned_to` (one or none). */
  assignee: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_path: string | null;
  } | null;
}

/** Everything `buildLabelQueue` needs, already read. */
export interface LabelQueueSource {
  jobs: readonly QueueJobRow[];
  matches: readonly QueueMatchRow[];
  sessions: readonly QueueSessionRow[];
  /** Login email by `users.id`, for the match owners. */
  ownerEmails: ReadonlyMap<string, string | null>;
  /** A stored avatar path as a url; the storage client's in production. */
  photoUrl: (avatarPath: string | null) => string | null;
}

/** The label session on a queue entry. Never `complete`: those have left. */
export interface LabelQueueEntrySession extends QueueSession {
  id: string;
  /** Who holds it, with the names both boards print. */
  assignee: {
    id: string;
    firstName: string;
    fullName: string;
    photoUrl: string | null;
  } | null;
  assignedAt: string | null;
  /** When a labeller took it themself; null on one an admin assigned. */
  claimedAt: string | null;
  submittedAt: string | null;
  flags: BoardFlags;
  /** `label_sessions.labeller`, for `countLabelWorkMinutes`. */
  labellerId: string | null;
  /** The holder's newest work beat on it; filled in by `readLabelQueue`. */
  lastBeatAt: string | null;
  /** Minutes of labelling work on it; filled in by `readLabelQueue`. */
  minutesWorked: number;
}

/**
 * One match waiting in the queue, with everything either board shows. This is
 * the admin's view of it: it names the players. Server-side only — a
 * labeller is sent `toLabellerBoard`'s rows, never one of these.
 */
export interface LabelQueueEntry {
  /** The job id — `sortByDue` and `claimableJobIds` read it as `id`. */
  id: string;
  matchId: string;
  completedAt: string;
  /** ISO moment the label is due (`labelDueAt`). */
  dueAt: string;
  videoSeconds: number;
  urgency: UrgencyLevel;
  player1Name: string;
  player2Name: string;
  /** The program's name, or "Personal". */
  programName: string;
  session: LabelQueueEntrySession | null;
}

const completedMs = (job: Pick<QueueJobRow, "completed_at">) =>
  job.completed_at ? Date.parse(job.completed_at) : NaN;

/**
 * The newest completed job of each match — a re-run replaces the run before
 * it, so only the latest results are worth labelling. Ties go to the higher
 * id, so the pick does not depend on the order the rows came back in.
 */
export function newestCompletedJobPerMatch<
  T extends Pick<QueueJobRow, "id" | "match_id" | "completed_at">,
>(jobs: readonly T[]): T[] {
  const newest = new Map<string, T>();
  for (const job of jobs) {
    const at = completedMs(job);
    if (!Number.isFinite(at)) continue;
    const held = newest.get(job.match_id);
    const heldAt = held ? completedMs(held) : -Infinity;
    if (!held || at > heldAt || (at === heldAt && job.id > held.id)) {
      newest.set(job.match_id, job);
    }
  }
  return [...newest.values()];
}

/**
 * The one session a job is read by. A `complete` one wins outright — the
 * match is published and leaves the queue, whatever else sits beside it.
 * Otherwise the open (`labelling`) one, else the latest started.
 */
function sessionForJob(
  sessions: readonly QueueSessionRow[],
): QueueSessionRow | null {
  const latestFirst = [...sessions].sort((a, b) =>
    a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
  );
  return (
    latestFirst.find((session) => session.status === "complete") ??
    latestFirst.find((session) => session.status === "labelling") ??
    latestFirst[0] ??
    null
  );
}

function firstName(assignee: NonNullable<QueueSessionRow["assignee"]>): string {
  return (
    assignee.first_name?.trim() ||
    labellerName(null, assignee.last_name, assignee.email).split(" ")[0]
  );
}

/**
 * The queue: the newest completed job per match, kept when `enterLabelQueue`
 * says so, earliest due first (`sortByDue`). Pure.
 */
export function buildLabelQueue(source: LabelQueueSource): LabelQueueEntry[] {
  const matchById = new Map(source.matches.map((match) => [match.id, match]));
  const sessionsByJob = new Map<string, QueueSessionRow[]>();
  for (const session of source.sessions) {
    const list = sessionsByJob.get(session.job_id);
    if (list) list.push(session);
    else sessionsByJob.set(session.job_id, [session]);
  }

  const entries: LabelQueueEntry[] = [];
  for (const job of newestCompletedJobPerMatch(source.jobs)) {
    const match = matchById.get(job.match_id);
    const session = sessionForJob(sessionsByJob.get(job.id) ?? []);
    const enters = enterLabelQueue({
      id: job.id,
      completedAt: job.completed_at,
      start_time_seconds: job.start_time_seconds,
      end_time_seconds: job.end_time_seconds,
      billable_seconds: job.billable_seconds,
      ownerEmail: match?.created_by
        ? (source.ownerEmails.get(match.created_by) ?? null)
        : null,
      session: session
        ? { status: session.status, assignedTo: session.assigned_to }
        : null,
    });
    if (!enters || !job.completed_at) continue;

    const program = Array.isArray(match?.programs)
      ? (match.programs[0] ?? null)
      : (match?.programs ?? null);
    const assignee = session?.assignee ?? null;
    entries.push({
      id: job.id,
      matchId: job.match_id,
      completedAt: job.completed_at,
      dueAt: labelDueAt(job.completed_at).toISOString(),
      videoSeconds: jobVideoSeconds(job),
      urgency: urgencyLevel(job.priority),
      player1Name: match?.player1_name ?? "Player 1",
      player2Name: match?.player2_name ?? "Player 2",
      programName: program?.school_name
        ? programDisplayName(program.school_name, program.team)
        : "Personal",
      session: session
        ? {
            id: session.id,
            status: session.status,
            assignedTo: session.assigned_to,
            assignee: assignee
              ? {
                  id: assignee.id,
                  firstName: firstName(assignee),
                  fullName: labellerName(
                    assignee.first_name,
                    assignee.last_name,
                    assignee.email,
                  ),
                  photoUrl: source.photoUrl(assignee.avatar_path),
                }
              : null,
            assignedAt: session.assigned_at ?? null,
            claimedAt: session.claimed_at ?? null,
            submittedAt: session.submitted_at ?? null,
            flags: boardFlags(session.start_open_counts, session.open_counts),
            labellerId: session.labeller,
            lastBeatAt: null,
            minutesWorked: 0,
          }
        : null,
    });
  }
  return sortByDue(entries);
}

/* -------------------------------------------------------------------------
 * Lanes
 * ---------------------------------------------------------------------- */

type Lane = "todo" | "inProgress" | "submitted";

/**
 * "Submitted" is a `submitted` session; "In progress" any `labelling` one
 * somebody holds, claimed or admin-assigned; everything else is still to do.
 */
function laneOf(entry: LabelQueueEntry): Lane {
  if (entry.session?.status === "submitted") return "submitted";
  if (entry.session?.status === "labelling" && entry.session.assignedTo) {
    return "inProgress";
  }
  return "todo";
}

/** A waiting match, as a labeller sees it: how long, how urgent, due when. */
export interface LabellerTodoRow {
  /** The claim key. Names a job, never a match, a player or an owner. */
  jobId: string;
  videoSeconds: number;
  urgency: UrgencyLevel;
  /** ISO moment. */
  dueAt: string;
  /** Among the first `LABEL_CLAIM_CHOICES` open rows, so it may be taken. */
  claimable: boolean;
  flags: BoardFlags;
}

/** A match somebody holds or has handed in, as a labeller sees it. */
export interface LabellerSessionRow {
  /** Set only on the viewer's own session — the one they may open. */
  sessionId?: string;
  /** Assigned to the viewer. */
  mine: boolean;
  /** The labeller holding it; null when nobody is assigned. */
  labellerFirstName: string | null;
  labellerPhotoUrl: string | null;
  flags: BoardFlags;
  videoSeconds: number;
  urgency: UrgencyLevel;
  /** ISO moment. */
  dueAt: string;
  /** When it was handed in; null in the in-progress lane. */
  submittedAt: string | null;
}

export interface LabellerBoard {
  todo: LabellerTodoRow[];
  inProgress: LabellerSessionRow[];
  submitted: LabellerSessionRow[];
  /** The viewer already holds an open analyst session, so cannot claim. */
  holding: boolean;
}

/**
 * The labeller's projection. Every row is built field by field from the
 * entry — never spread — so a name added to `LabelQueueEntry` later cannot
 * ride along.
 */
export function toLabellerBoard(
  entries: readonly LabelQueueEntry[],
  viewerId: string,
  holding: boolean,
): LabellerBoard {
  const claimable = new Set(claimableJobIds(entries));
  const board: LabellerBoard = {
    todo: [],
    inProgress: [],
    submitted: [],
    holding,
  };
  for (const entry of entries) {
    const lane = laneOf(entry);
    const session = entry.session;
    if (lane === "todo" || !session) {
      board.todo.push({
        jobId: entry.id,
        videoSeconds: entry.videoSeconds,
        urgency: entry.urgency,
        dueAt: entry.dueAt,
        claimable: claimable.has(entry.id),
        flags: session?.flags ?? null,
      });
      continue;
    }
    const mine = session.assignedTo === viewerId;
    board[lane].push({
      ...(mine ? { sessionId: session.id } : {}),
      mine,
      labellerFirstName: session.assignee?.firstName ?? null,
      labellerPhotoUrl: session.assignee?.photoUrl ?? null,
      flags: session.flags,
      videoSeconds: entry.videoSeconds,
      urgency: entry.urgency,
      dueAt: entry.dueAt,
      submittedAt: session.submittedAt,
    });
  }
  return board;
}

/** One match on the admin's board: the labeller's facts plus whose it is. */
export interface AdminLabelBoardRow {
  jobId: string;
  matchId: string;
  player1Name: string;
  player2Name: string;
  /** The program's name, or "Personal". */
  programName: string;
  videoSeconds: number;
  urgency: UrgencyLevel;
  /** ISO moment. */
  dueAt: string;
  /** Among the rows a labeller may take right now. */
  claimable: boolean;
  /** Null when nobody has started a session for the job. */
  sessionId: string | null;
  /** The assigned labeller (`users.id`), for the admin's Assign menu. */
  labellerId: string | null;
  /** The assigned labeller's full name; null when unassigned. */
  labellerName: string | null;
  labellerPhotoUrl: string | null;
  assignedAt: string | null;
  /** When the labeller took it themself; null when an admin assigned it. */
  claimedAt: string | null;
  submittedAt: string | null;
  /** The assignee's newest work beat on it (a minute, ISO); null with none. */
  lastBeatAt: string | null;
  /** Minutes of labelling work on the session (`countLabelWorkMinutes`). */
  minutesWorked: number;
  flags: BoardFlags;
}

export interface AdminLabelBoard {
  todo: AdminLabelBoardRow[];
  inProgress: AdminLabelBoardRow[];
  submitted: AdminLabelBoardRow[];
}

/** The admin's projection: the same three lanes, every row named. */
export function toAdminLabelBoard(
  entries: readonly LabelQueueEntry[],
): AdminLabelBoard {
  const claimable = new Set(claimableJobIds(entries));
  const board: AdminLabelBoard = { todo: [], inProgress: [], submitted: [] };
  for (const entry of entries) {
    const session = entry.session;
    board[laneOf(entry)].push({
      jobId: entry.id,
      matchId: entry.matchId,
      player1Name: entry.player1Name,
      player2Name: entry.player2Name,
      programName: entry.programName,
      videoSeconds: entry.videoSeconds,
      urgency: entry.urgency,
      dueAt: entry.dueAt,
      claimable: claimable.has(entry.id),
      sessionId: session?.id ?? null,
      labellerId: session?.assignee?.id ?? null,
      labellerName: session?.assignee?.fullName ?? null,
      labellerPhotoUrl: session?.assignee?.photoUrl ?? null,
      assignedAt: session?.assignedAt ?? null,
      claimedAt: session?.claimedAt ?? null,
      submittedAt: session?.submittedAt ?? null,
      lastBeatAt: session?.lastBeatAt ?? null,
      minutesWorked: session?.minutesWorked ?? 0,
      flags: session?.flags ?? null,
    });
  }
  return board;
}

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

const SESSION_COLUMNS =
  "id, job_id, status, started_at, open_counts, assigned_to, assigned_at, submitted_at, labeller, assignee:users!assigned_to(id, email, first_name, last_name, avatar_path)";
/** Added by `20261114022117_label_queue_claims`. */
const CLAIM_COLUMNS = "claimed_at, start_open_counts";
/** Postgres `undefined_column`: the claims migration is not applied yet. */
const UNDEFINED_COLUMN = "42703";

async function readQueueSessions(
  db: AdminClient,
  jobIds: readonly string[],
): Promise<QueueSessionRow[]> {
  const read = (columns: string, ids: string[]) =>
    db
      .from("label_sessions")
      .select(columns)
      .in("job_id", ids)
      // Practice copies are graded on their own page; they never enter a lane.
      .neq("kind", "practice")
      .returns<QueueSessionRow[]>();

  const chunks = await Promise.all(
    idChunks(jobIds).map(async (ids) => {
      let result = await read(`${SESSION_COLUMNS}, ${CLAIM_COLUMNS}`, ids);
      // Before the migration the two columns do not exist; the rows then read
      // as never claimed with no starting count, which is what they are.
      if (result.error?.code === UNDEFINED_COLUMN) {
        result = await read(SESSION_COLUMNS, ids);
      }
      if (result.error) {
        throw new Error(
          `Could not read label sessions: ${result.error.message}`,
        );
      }
      return result.data ?? [];
    }),
  );
  return chunks.flat();
}

async function readQueueMatches(
  db: AdminClient,
  matchIds: readonly string[],
): Promise<QueueMatchRow[]> {
  const chunks = await Promise.all(
    idChunks(matchIds).map(async (ids) => {
      const { data, error } = await db
        .from("matches")
        .select(
          "id, player1_name, player2_name, created_by, programs!matches_program_id_fkey(school_name, team)",
        )
        .in("id", ids)
        .returns<QueueMatchRow[]>();
      if (error) throw new Error(`Could not read matches: ${error.message}`);
      return data ?? [];
    }),
  );
  return chunks.flat();
}

async function readOwnerEmails(
  db: AdminClient,
  ownerIds: readonly string[],
): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>();
  await Promise.all(
    idChunks(ownerIds).map(async (ids) => {
      const { data, error } = await db
        .from("users")
        .select("id, email")
        .in("id", ids)
        .returns<{ id: string; email: string | null }[]>();
      if (error) {
        throw new Error(`Could not read match owners: ${error.message}`);
      }
      for (const user of data ?? []) emails.set(user.id, user.email);
    }),
  );
  return emails;
}

/**
 * Read the queue: completed Advantage Intelligence jobs that have a results
 * file, the newest per match, filtered and sorted by `queue.ts`'s rules.
 *
 * Takes the service-role client rather than making one: call it only after
 * `requireLabelViewerOrNotFound` or `requireAdminOrNotFound`, and never send
 * its entries to a labeller — project them with `toLabellerBoard` first.
 */
export async function readLabelQueue(
  db: AdminClient,
): Promise<LabelQueueEntry[]> {
  // The cut-off is `enterLabelQueue`'s; repeating it here only spares reading
  // every job the product ever ran. A match's newest job is at or past the
  // cut-off exactly when it is in this set, so the per-match pick is the same.
  const jobs = newestCompletedJobPerMatch(
    await readAllPages<QueueJobRow>(
      db
        .from("processing_jobs")
        .select(
          "id, match_id, completed_at, priority, start_time_seconds, end_time_seconds, billable_seconds",
        )
        .eq("provider", PROVIDER_ID)
        .eq("status", "completed")
        .not("results_object_key", "is", null)
        .gte("completed_at", LABEL_QUEUE_FROM)
        .order("completed_at", { ascending: false })
        .order("id")
        .returns<QueueJobRow[]>(),
      "Could not read the label queue's jobs",
    ),
  );
  if (jobs.length === 0) return [];

  const [matches, sessions] = await Promise.all([
    readQueueMatches(db, [...new Set(jobs.map((job) => job.match_id))]),
    readQueueSessions(
      db,
      jobs.map((job) => job.id),
    ),
  ]);
  const ownerEmails = await readOwnerEmails(db, [
    ...new Set(
      matches.flatMap((match) => (match.created_by ? [match.created_by] : [])),
    ),
  ]);

  const entries = buildLabelQueue({
    jobs,
    matches,
    sessions,
    ownerEmails,
    photoUrl: (path) => avatarUrlFor(db, path),
  });

  const held = entries.flatMap((entry) =>
    entry.session ? [entry.session] : [],
  );
  const [lastBeats, minutes] = await Promise.all([
    readLastLabelBeats(
      db,
      held.flatMap((session) =>
        session.assignedTo
          ? [{ id: session.id, userId: session.assignedTo }]
          : [],
      ),
    ),
    countLabelWorkMinutes(
      db,
      held.map((session) => ({
        id: session.id,
        labellerId: session.labellerId,
      })),
    ),
  ]);
  for (const session of held) {
    session.lastBeatAt = lastBeats.get(session.id) ?? null;
    session.minutesWorked = minutes.get(session.id) ?? 0;
  }
  return entries;
}

/**
 * Whether `userId` holds an open analyst session — the same question
 * `claim_label_session` asks, over every session and not only the queue's,
 * so the board and the claim agree on a match assigned from outside it.
 */
export async function readHoldingLabelSession(
  db: AdminClient,
  userId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("label_sessions")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .eq("status", "labelling")
    .eq("kind", "analyst");
  if (error) {
    throw new Error(`Could not read the held label session: ${error.message}`);
  }
  return (count ?? 0) > 0;
}

/* -------------------------------------------------------------------------
 * Loaders
 * ---------------------------------------------------------------------- */

interface QueueReads {
  createAdminClient: () => AdminClient;
  readQueue: (db: AdminClient) => Promise<LabelQueueEntry[]>;
}

export interface LabellerBoardDependencies extends QueueReads {
  /** The viewer, from the server-side session (the `/label` gate). */
  requireViewer: () => Promise<LabelActor>;
  readHolding: (db: AdminClient, userId: string) => Promise<boolean>;
}
const labellerDefaults: LabellerBoardDependencies = {
  requireViewer: () => requireLabelViewerOrNotFound(),
  createAdminClient,
  readQueue: readLabelQueue,
  readHolding: readHoldingLabelSession,
};

/**
 * The board at `/label`: what waits, what is being worked, what was handed
 * in. Nothing on it says whose match a row is.
 */
export async function loadLabellerBoard(
  deps: LabellerBoardDependencies = labellerDefaults,
): Promise<LabellerBoard> {
  const viewer = await deps.requireViewer();
  const db = deps.createAdminClient();
  const [entries, holding] = await Promise.all([
    deps.readQueue(db),
    deps.readHolding(db, viewer.id),
  ]);
  return toLabellerBoard(entries, viewer.id, holding);
}

export interface AdminLabelBoardDependencies extends QueueReads {
  requireAdmin: () => Promise<{ id: string }>;
}
const adminDefaults: AdminLabelBoardDependencies = {
  requireAdmin: () => requireAdminOrNotFound(),
  createAdminClient,
  readQueue: readLabelQueue,
};

/** The board at `/admin/labels`: the same lanes, with whose match each is. */
export async function loadAdminLabelBoard(
  deps: AdminLabelBoardDependencies = adminDefaults,
): Promise<AdminLabelBoard> {
  await deps.requireAdmin();
  const db = deps.createAdminClient();
  return toAdminLabelBoard(await deps.readQueue(db));
}
