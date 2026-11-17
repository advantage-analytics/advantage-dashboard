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
 * is — no player, program, owner or match id. Another labeller's session
 * shows who holds it, by their first name and avatar only (the owner's
 * call), and never its session id. The to-do `jobId` is the key a claim takes; it
 * grants nothing, because the claim reads this queue again on the server.
 * An admin's send-back note is their own words to one labeller: it is copied
 * onto that labeller's own row and onto no other.
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
  canAddToTodo,
  claimableJobIds,
  enterLabelQueue,
  labelDueAt,
  sortByDue,
  urgencyLevel,
  type LabelQueueJob,
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
  /** Verified by Advantage; a verified match is never offered for To do. */
  verified?: boolean | null;
  programs: QueueProgramRow | QueueProgramRow[] | null;
}

/** A non-practice `label_sessions` row as the queue reads it. */
export interface QueueSessionRow {
  id: string;
  job_id: string;
  status: string;
  started_at: string;
  open_counts: unknown;
  start_open_counts: unknown;
  assigned_to: string | null;
  assigned_at: string | null;
  claimed_at: string | null;
  submitted_at: string | null;
  /** The last publish; null until the session reaches `complete`. */
  completed_at?: string | null;
  /** The admin's check (`20261114091835_label_publish_check`). */
  checked_at: string | null;
  sent_back_at: string | null;
  sent_back_note: string | null;
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
  /** When an admin added each job to To do (`label_todo`), by job id. */
  todo?: ReadonlyMap<string, string>;
  /** A stored avatar path as a url; the storage client's in production. */
  photoUrl: (avatarPath: string | null) => string | null;
}

/** An admin's send-back: when, and what they asked the labeller to fix. */
export interface LabelSentBack {
  /** ISO moment. */
  at: string;
  note: string;
}

/**
 * The label session on a queue entry. `complete` only while it waits for the
 * admin's check: a checked one has left the queue.
 */
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
  /** The last publish (`label_sessions.completed_at`); null until published. */
  publishedAt: string | null;
  /**
   * Set on an open (`labelling`) session an admin sent back. Admin-only
   * until a projection hands it to the labeller it was sent to.
   */
  sentBack: LabelSentBack | null;
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
  /** When an admin added it to To do; null on work carried over without. */
  addedAt: string | null;
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

function sentBackOf(session: QueueSessionRow): LabelSentBack | null {
  if (session.status !== "labelling" || !session.sent_back_at) return null;
  return { at: session.sent_back_at, note: session.sent_back_note ?? "" };
}

function firstName(assignee: NonNullable<QueueSessionRow["assignee"]>): string {
  return (
    assignee.first_name?.trim() ||
    labellerName(null, assignee.last_name, assignee.email).split(" ")[0]
  );
}

function groupSessionsByJob(
  sessions: readonly QueueSessionRow[],
): Map<string, QueueSessionRow[]> {
  const byJob = new Map<string, QueueSessionRow[]>();
  for (const session of sessions) {
    const list = byJob.get(session.job_id);
    if (list) list.push(session);
    else byJob.set(session.job_id, [session]);
  }
  return byJob;
}

/** The job as `queue.ts`'s rules read it (`enterLabelQueue`, `canAddToTodo`). */
function toQueueJob(
  job: QueueJobRow,
  match: QueueMatchRow | undefined,
  session: QueueSessionRow | null | undefined,
  source: Pick<LabelQueueSource, "ownerEmails" | "todo">,
): LabelQueueJob {
  return {
    id: job.id,
    completedAt: job.completed_at,
    start_time_seconds: job.start_time_seconds,
    end_time_seconds: job.end_time_seconds,
    billable_seconds: job.billable_seconds,
    ownerEmail: match?.created_by
      ? (source.ownerEmails.get(match.created_by) ?? null)
      : null,
    addedAt: source.todo?.get(job.id) ?? null,
    session: session
      ? {
          status: session.status,
          assignedTo: session.assigned_to,
          checkedAt: session.checked_at,
          sentBackAt: session.sent_back_at,
        }
      : null,
  };
}

function programNameOf(match: QueueMatchRow | undefined): string {
  const program = Array.isArray(match?.programs)
    ? (match.programs[0] ?? null)
    : (match?.programs ?? null);
  return program?.school_name
    ? programDisplayName(program.school_name, program.team)
    : "Personal";
}

/**
 * The queue: the newest completed job per match, kept when `enterLabelQueue`
 * says so, earliest due first (`sortByDue`). Pure.
 */
export function buildLabelQueue(source: LabelQueueSource): LabelQueueEntry[] {
  const matchById = new Map(source.matches.map((match) => [match.id, match]));
  const sessionsByJob = groupSessionsByJob(source.sessions);

  const entries: LabelQueueEntry[] = [];
  for (const job of newestCompletedJobPerMatch(source.jobs)) {
    const match = matchById.get(job.match_id);
    const session = sessionForJob(sessionsByJob.get(job.id) ?? []);
    const queueJob = toQueueJob(job, match, session, source);
    const addedAt = queueJob.addedAt ?? null;
    const enters = enterLabelQueue(queueJob);
    if (!enters || !job.completed_at) continue;

    const assignee = session?.assignee ?? null;
    entries.push({
      id: job.id,
      matchId: job.match_id,
      completedAt: job.completed_at,
      dueAt: labelDueAt(addedAt ?? job.completed_at).toISOString(),
      addedAt,
      videoSeconds: jobVideoSeconds(job),
      urgency: urgencyLevel(job.priority),
      player1Name: match?.player1_name ?? "Player 1",
      player2Name: match?.player2_name ?? "Player 2",
      programName: programNameOf(match),
      session: session
        ? {
            id: session.id,
            status: session.status,
            assignedTo: session.assigned_to,
            checkedAt: session.checked_at,
            sentBackAt: session.sent_back_at,
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
            publishedAt:
              session.status === "complete"
                ? (session.completed_at ?? null)
                : null,
            sentBack: sentBackOf(session),
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

type Lane = "todo" | "inProgress" | "published" | "submitted";

/**
 * "Published" is a `complete` session waiting for the admin's check (the
 * queue holds no checked one); "Submitted" a `submitted` session handed in
 * before submit published; "In progress" any `labelling` one somebody holds,
 * claimed or admin-assigned, or one sent back; everything else is to do.
 */
function laneOf(entry: LabelQueueEntry): Lane {
  const session = entry.session;
  if (session?.status === "complete") return "published";
  if (session?.status === "submitted") return "submitted";
  if (
    session?.status === "labelling" &&
    (session.assignedTo || session.sentBack)
  ) {
    return "inProgress";
  }
  return "todo";
}

/**
 * The entries in the order the boards list them: every lane keeps the
 * queue's earliest-due order except the published one, which lists the
 * oldest publish first (ties by job id) — the admin checks in turn.
 */
function boardOrder(entries: readonly LabelQueueEntry[]): LabelQueueEntry[] {
  const publishedMs = (entry: LabelQueueEntry) => {
    const at = entry.session?.publishedAt;
    const ms = at ? Date.parse(at) : NaN;
    return Number.isFinite(ms) ? ms : Infinity;
  };
  const published = entries
    .filter((entry) => laneOf(entry) === "published")
    .sort((a, b) => {
      const pa = publishedMs(a);
      const pb = publishedMs(b);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  return [
    ...entries.filter((entry) => laneOf(entry) !== "published"),
    ...published,
  ];
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
  /** When it was published (ISO); set only in the published lane. */
  publishedAt: string | null;
  /**
   * The admin's send-back, with their note. Set only on the viewer's own
   * (`mine`) row: the note is addressed to that labeller and nobody else.
   */
  sentBack: LabelSentBack | null;
}

export interface LabellerBoard {
  todo: LabellerTodoRow[];
  inProgress: LabellerSessionRow[];
  /** Published, waiting for the admin's check; oldest publish first. */
  published: LabellerSessionRow[];
  /** Handed in before submit published (old `submitted` sessions). */
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
    published: [],
    submitted: [],
    holding,
  };
  for (const entry of boardOrder(entries)) {
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
      publishedAt: session.publishedAt,
      sentBack:
        mine && session.sentBack
          ? { at: session.sentBack.at, note: session.sentBack.note }
          : null,
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
  /**
   * In To do because an admin added it, and nobody holds it: Remove may take
   * it out. False on every other lane's row.
   */
  removable: boolean;
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
  /** When it was published (ISO); set only in the to-check lane. */
  publishedAt: string | null;
  /** Set on an in-progress row an admin sent back, with their note. */
  sentBack: LabelSentBack | null;
  /** The assignee's newest work beat on it (a minute, ISO); null with none. */
  lastBeatAt: string | null;
  /** Minutes of labelling work on the session (`countLabelWorkMinutes`). */
  minutesWorked: number;
  flags: BoardFlags;
}

export interface AdminLabelBoard {
  todo: AdminLabelBoardRow[];
  inProgress: AdminLabelBoardRow[];
  /** Published by a labeller, waiting for Check; oldest publish first. */
  toCheck: AdminLabelBoardRow[];
  /** Handed in before submit published (old `submitted` sessions). */
  submitted: AdminLabelBoardRow[];
}

const ADMIN_LANE: Record<Lane, keyof AdminLabelBoard> = {
  todo: "todo",
  inProgress: "inProgress",
  published: "toCheck",
  submitted: "submitted",
};

/** The admin's projection: the same lanes, every row named. */
export function toAdminLabelBoard(
  entries: readonly LabelQueueEntry[],
): AdminLabelBoard {
  const claimable = new Set(claimableJobIds(entries));
  const board: AdminLabelBoard = {
    todo: [],
    inProgress: [],
    toCheck: [],
    submitted: [],
  };
  for (const entry of boardOrder(entries)) {
    const session = entry.session;
    const lane = laneOf(entry);
    board[ADMIN_LANE[lane]].push({
      jobId: entry.id,
      matchId: entry.matchId,
      player1Name: entry.player1Name,
      player2Name: entry.player2Name,
      programName: entry.programName,
      videoSeconds: entry.videoSeconds,
      urgency: entry.urgency,
      dueAt: entry.dueAt,
      claimable: claimable.has(entry.id),
      removable: lane === "todo" && entry.addedAt !== null,
      sessionId: session?.id ?? null,
      labellerId: session?.assignee?.id ?? null,
      labellerName: session?.assignee?.fullName ?? null,
      labellerPhotoUrl: session?.assignee?.photoUrl ?? null,
      assignedAt: session?.assignedAt ?? null,
      claimedAt: session?.claimedAt ?? null,
      submittedAt: session?.submittedAt ?? null,
      publishedAt: session?.publishedAt ?? null,
      sentBack: session?.sentBack ?? null,
      lastBeatAt: session?.lastBeatAt ?? null,
      minutesWorked: session?.minutesWorked ?? 0,
      flags: session?.flags ?? null,
    });
  }
  return board;
}

/* -------------------------------------------------------------------------
 * Not in To do
 * ---------------------------------------------------------------------- */

/** An analysed match an admin may add to To do (`canAddToTodo`). */
export interface TodoCandidate {
  jobId: string;
  matchId: string;
  /** When its results landed (ISO); the list is newest first. */
  completedAt: string;
  videoSeconds: number;
  player1Name: string;
  player2Name: string;
  /** The program's name, or "Personal" — the list's workspace filter. */
  programName: string;
}

/**
 * Every analysed match nobody is labelling and nobody chose yet: the newest
 * completed job per match that `canAddToTodo` lets in, on a match not
 * already verified, newest results first (ties by job id). Pure.
 */
export function buildTodoCandidates(
  source: Omit<LabelQueueSource, "photoUrl">,
): TodoCandidate[] {
  const matchById = new Map(source.matches.map((match) => [match.id, match]));
  const sessionsByJob = groupSessionsByJob(source.sessions);
  const rows: TodoCandidate[] = [];
  for (const job of newestCompletedJobPerMatch(source.jobs)) {
    const match = matchById.get(job.match_id);
    if (!match || match.verified || !job.completed_at) continue;
    const session = sessionForJob(sessionsByJob.get(job.id) ?? []);
    if (!canAddToTodo(toQueueJob(job, match, session, source))) continue;
    rows.push({
      jobId: job.id,
      matchId: job.match_id,
      completedAt: job.completed_at,
      videoSeconds: jobVideoSeconds(job),
      player1Name: match.player1_name ?? "Player 1",
      player2Name: match.player2_name ?? "Player 2",
      programName: programNameOf(match),
    });
  }
  return rows.sort((a, b) => {
    const diff = Date.parse(b.completedAt) - Date.parse(a.completedAt);
    if (diff !== 0) return diff;
    return a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0;
  });
}

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

const SESSION_COLUMNS =
  "id, job_id, status, started_at, completed_at, open_counts, start_open_counts, assigned_to, assigned_at, claimed_at, submitted_at, checked_at, sent_back_at, sent_back_note, labeller, assignee:users!assigned_to(id, email, first_name, last_name, avatar_path)";

async function readQueueSessions(
  db: AdminClient,
  jobIds: readonly string[],
): Promise<QueueSessionRow[]> {
  const chunks = await Promise.all(
    idChunks(jobIds).map(async (ids) => {
      const { data, error } = await db
        .from("label_sessions")
        .select(SESSION_COLUMNS)
        .in("job_id", ids)
        // Practice copies are graded on their own page; they never enter a lane.
        .neq("kind", "practice")
        .returns<QueueSessionRow[]>();
      if (error) {
        throw new Error(`Could not read label sessions: ${error.message}`);
      }
      return data ?? [];
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
          "id, player1_name, player2_name, created_by, verified, programs!matches_program_id_fkey(school_name, team)",
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

/** `label_todo` as the queue reads it: when each job was added, by job id. */
async function readTodo(db: AdminClient): Promise<Map<string, string>> {
  const rows = await readAllPages<{ job_id: string; added_at: string }>(
    db
      .from("label_todo")
      .select("job_id, added_at")
      .order("job_id")
      .returns<{ job_id: string; added_at: string }[]>(),
    "Could not read the labellers' To do",
  );
  return new Map(rows.map((row) => [row.job_id, row.added_at]));
}

/**
 * Everything both the queue and the Not in To do list are built from: every
 * completed Advantage Intelligence job with a results file (the newest per
 * match), its match, its sessions, the owners' emails and what an admin
 * added to To do. There is no date floor: To do is whatever was added, and
 * every older match is a row an admin can add.
 */
export async function readLabelSource(
  db: AdminClient,
): Promise<Omit<LabelQueueSource, "photoUrl">> {
  const [allJobs, todo] = await Promise.all([
    readAllPages<QueueJobRow>(
      db
        .from("processing_jobs")
        .select(
          "id, match_id, completed_at, priority, start_time_seconds, end_time_seconds, billable_seconds",
        )
        .eq("provider", PROVIDER_ID)
        .eq("status", "completed")
        .not("results_object_key", "is", null)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .order("id")
        .returns<QueueJobRow[]>(),
      "Could not read the label queue's jobs",
    ),
    readTodo(db),
  ]);
  const jobs = newestCompletedJobPerMatch(allJobs);
  if (jobs.length === 0) {
    return { jobs, matches: [], sessions: [], ownerEmails: new Map(), todo };
  }
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
  return { jobs, matches, sessions, ownerEmails, todo };
}

/**
 * Read the queue: what an admin added to To do, plus work already past it,
 * filtered and sorted by `queue.ts`'s rules.
 *
 * Takes the service-role client rather than making one: call it only after
 * `requireLabelViewerOrNotFound` or `requireAdminOrNotFound`, and never send
 * its entries to a labeller — project them with `toLabellerBoard` first.
 */
export async function readLabelQueue(
  db: AdminClient,
  /** Already read by the caller (`loadAdminLabels`), so it is read once. */
  read?: Omit<LabelQueueSource, "photoUrl">,
): Promise<LabelQueueEntry[]> {
  const source = read ?? (await readLabelSource(db));
  if (source.jobs.length === 0) return [];

  const entries = buildLabelQueue({
    ...source,
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
 * The board at `/label`: what waits, what is being worked (sent-back rows
 * among it), what was published and waits for the admin's check, and what
 * was handed in before submit published. Nothing on it says whose match a
 * row is.
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

/**
 * The board at `/admin/labels`: the same lanes, with whose match each is —
 * the published lane named `toCheck`, since checking it is the admin's job.
 */
export async function loadAdminLabelBoard(
  deps: AdminLabelBoardDependencies = adminDefaults,
): Promise<AdminLabelBoard> {
  await deps.requireAdmin();
  const db = deps.createAdminClient();
  return toAdminLabelBoard(await deps.readQueue(db));
}

export interface AdminLabelsDependencies {
  requireAdmin: () => Promise<{ id: string }>;
  createAdminClient: () => AdminClient;
  readSource: (db: AdminClient) => Promise<Omit<LabelQueueSource, "photoUrl">>;
  readQueue: (
    db: AdminClient,
    source: Omit<LabelQueueSource, "photoUrl">,
  ) => Promise<LabelQueueEntry[]>;
}
const labelsDefaults: AdminLabelsDependencies = {
  requireAdmin: () => requireAdminOrNotFound(),
  createAdminClient,
  readSource: readLabelSource,
  readQueue: readLabelQueue,
};

/**
 * Everything `/admin/labels` shows from the queue, from one read: the board
 * (`toAdminLabelBoard`) and Not in To do — every analysed match an admin may
 * add to the labellers' To do, newest first. Admin-only — both name players.
 */
export async function loadAdminLabels(
  deps: AdminLabelsDependencies = labelsDefaults,
): Promise<{ board: AdminLabelBoard; candidates: TodoCandidate[] }> {
  await deps.requireAdmin();
  const db = deps.createAdminClient();
  const source = await deps.readSource(db);
  const entries = await deps.readQueue(db, source);
  return {
    board: toAdminLabelBoard(entries),
    candidates: buildTodoCandidates(source),
  };
}
