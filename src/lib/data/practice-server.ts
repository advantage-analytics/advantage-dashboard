/**
 * Loaders for the two reviewer-hiring admin pages:
 *   - `/admin/labels/[sessionId]/practice` — an answer key's practice copies
 *     (practice-session.ts), each graded against the key
 *     (practice-grading.ts) with the applicant's active minutes;
 *   - `/admin/labels/pay` — video hours per labeller over a date range, from
 *     what they published, for paying reviewers by the hour of match video.
 *
 * Both re-check `requireAdmin` and read service-role, like every admin loader
 * (`admin/layout.tsx` gates the route already). Read-only.
 */

import { readAllPages } from "@/lib/data/admin-range-read";
import { countLabelWorkMinutes } from "@/lib/data/labels-server";
import { isUuid } from "@/lib/admin/validation";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { labellerName } from "@/lib/services/labels/assign-session";
import { idChunks } from "@/lib/services/labels/chunks";
import {
  gradePractice,
  strokeFamily,
  type GradePoint,
  type PracticeGrade,
  type Side,
} from "@/lib/services/labels/practice-grading";
import {
  jobVideoSeconds,
  type JobVideoSpan,
} from "@/lib/services/labels/video-seconds";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

interface Deps {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
}
const defaults: Deps = { requireAdmin, createAdminClient };

type DbUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

function nameOf(user: DbUser | null | undefined): string {
  return user
    ? labellerName(user.first_name, user.last_name, user.email)
    : "Unassigned";
}

/* -------------------------------------------------------------------------
 * Rows as grading reads them
 * ---------------------------------------------------------------------- */

interface DbGradePoint {
  id: string;
  set_number: number | null;
  server: Side | null;
  winner: Side | null;
  ending: string | null;
  ended_by: Side | null;
  error_kind: string | null;
  status: GradePoint["status"];
  seed: GradePoint["seed"];
}

interface DbGradeShot {
  label_point_id: string;
  video_time: number | null;
  stroke: string | null;
  status: string;
  status_before_delete: string | null;
  site_removal: string | null;
  seed: { stroke?: string | null; video_time?: number | null } | null;
}

/** One session's points with their live strokes, for `gradePractice`. */
export async function readGradePoints(
  db: AdminClient,
  sessionId: string,
): Promise<GradePoint[]> {
  const [points, shots] = await Promise.all([
    readAllPages<DbGradePoint>(
      db
        .from("label_points")
        .select(
          "id, set_number, server, winner, ending, ended_by, error_kind, status, seed",
        )
        .eq("session_id", sessionId)
        .order("point_index")
        .order("id"),
      "Could not read label points",
    ),
    readAllPages<DbGradeShot>(
      db
        .from("label_shots")
        .select(
          "label_point_id, video_time, stroke, status, status_before_delete, site_removal, seed",
        )
        .eq("session_id", sessionId)
        .order("id"),
      "Could not read label strokes",
    ),
  ]);

  const live = new Map<string, DbGradeShot[]>();
  const seeded = new Map<string, DbGradeShot[]>();
  for (const shot of shots) {
    if (shot.status !== "deleted") {
      const list = live.get(shot.label_point_id) ?? [];
      list.push(shot);
      live.set(shot.label_point_id, list);
    }
    // What the AI drew as a stroke on this point: anything it seeded that it
    // did not itself remove. Approximate across a split or combine, which move
    // strokes between points.
    const fromAi =
      shot.status !== "added" &&
      shot.status_before_delete !== "added" &&
      shot.site_removal === null;
    if (fromAi) {
      const list = seeded.get(shot.label_point_id) ?? [];
      list.push(shot);
      seeded.set(shot.label_point_id, list);
    }
  }
  const byTime = (a: number | null, b: number | null) =>
    (a ?? Infinity) - (b ?? Infinity);

  return points.map((point) => {
    const ownShots = (live.get(point.id) ?? []).sort((a, b) =>
      byTime(a.video_time, b.video_time),
    );
    const aiShots = (seeded.get(point.id) ?? []).sort((a, b) =>
      byTime(
        a.seed?.video_time ?? a.video_time,
        b.seed?.video_time ?? b.video_time,
      ),
    );
    const aiLast = aiShots.at(-1);
    return {
      id: point.id,
      setNumber: point.set_number,
      server: point.server,
      winner: point.winner,
      ending: point.ending,
      endedBy: point.ended_by,
      errorKind: point.error_kind,
      status: point.status,
      seed: point.seed,
      shots: ownShots.map((s) => ({
        videoTime: s.video_time,
        stroke: s.stroke,
      })),
      seedLastStroke:
        point.status === "added"
          ? undefined
          : aiLast
            ? strokeFamily(aiLast.seed?.stroke ?? aiLast.stroke)
            : null,
    };
  });
}

/** A practice copy's answer key, or null. Admin-only, like the page it serves. */
export async function readPracticeSourceId(
  sessionId: string,
  deps: Deps = defaults,
): Promise<string | null> {
  if (!(await deps.requireAdmin()) || !isUuid(sessionId)) return null;
  const { data } = await deps
    .createAdminClient()
    .from("label_sessions")
    .select("practice_source_session_id")
    .eq("id", sessionId)
    .eq("kind", "practice")
    .maybeSingle<{ practice_source_session_id: string | null }>();
  return data?.practice_source_session_id ?? null;
}

/* -------------------------------------------------------------------------
 * The practice page
 * ---------------------------------------------------------------------- */

export interface PracticeCopyRow {
  id: string;
  status: "labelling" | "submitted" | "complete";
  labeller: { id: string; name: string; email: string } | null;
  setNumber: number | null;
  createdAt: string;
  submittedAt: string | null;
  /** Active minutes from the work beats (non-admin time only). */
  activeMinutes: number;
  /** Null until the copy is submitted. */
  grade: PracticeGrade | null;
}

export type PracticeOverview =
  | {
      ok: true;
      key: {
        id: string;
        status: string;
        kind: string;
        player1Name: string;
        player2Name: string;
        /** Live key points per set, for the set picker. */
        pointsBySet: Record<number, number>;
        /** Key points with forced/unforced judged, per set. */
        judgedBySet: Record<number, number>;
      };
      /** Whether copies can be made from this session at all. */
      canCopy: boolean;
      copies: PracticeCopyRow[];
    }
  | { ok: false; reason: "admin-required" | "not-found" };

interface DbPracticeSession {
  id: string;
  status: PracticeCopyRow["status"];
  practice_set_number: number | null;
  created_at: string;
  submitted_at: string | null;
  assigned_to: string | null;
  assignee: DbUser | null;
}

export async function getPracticeOverview(
  sourceSessionId: string,
  deps: Deps = defaults,
): Promise<PracticeOverview> {
  if (!(await deps.requireAdmin())) {
    return { ok: false, reason: "admin-required" };
  }
  if (!isUuid(sourceSessionId)) return { ok: false, reason: "not-found" };
  const db = deps.createAdminClient();

  const { data: key, error: keyError } = await db
    .from("label_sessions")
    .select("id, status, kind, match_id")
    .eq("id", sourceSessionId)
    .maybeSingle<{
      id: string;
      status: string;
      kind: string;
      match_id: string;
    }>();
  if (keyError)
    throw new Error(`Could not read the session: ${keyError.message}`);
  if (!key || key.kind !== "analyst") return { ok: false, reason: "not-found" };

  const [matchResult, copiesResult, keyPoints] = await Promise.all([
    db
      .from("matches")
      .select("player1_name, player2_name")
      .eq("id", key.match_id)
      .maybeSingle<{
        player1_name: string | null;
        player2_name: string | null;
      }>(),
    db
      .from("label_sessions")
      .select(
        "id, status, practice_set_number, created_at, submitted_at, assigned_to, assignee:users!assigned_to(id, email, first_name, last_name)",
      )
      .eq("practice_source_session_id", key.id)
      .eq("kind", "practice")
      .order("created_at", { ascending: true })
      .returns<DbPracticeSession[]>(),
    readGradePoints(db, key.id),
  ]);
  if (matchResult.error) {
    throw new Error(`Could not read the match: ${matchResult.error.message}`);
  }
  if (copiesResult.error) {
    throw new Error(
      `Could not read practice copies: ${copiesResult.error.message}`,
    );
  }

  const pointsBySet: Record<number, number> = {};
  const judgedBySet: Record<number, number> = {};
  for (const point of keyPoints) {
    if (point.status === "deleted" || point.setNumber === null) continue;
    pointsBySet[point.setNumber] = (pointsBySet[point.setNumber] ?? 0) + 1;
    if (point.errorKind) {
      judgedBySet[point.setNumber] = (judgedBySet[point.setNumber] ?? 0) + 1;
    }
  }

  const sessions = copiesResult.data ?? [];
  const minutes = await countLabelWorkMinutes(
    db,
    sessions.map((s) => ({ id: s.id, labellerId: s.assigned_to })),
  );

  const copies = await Promise.all(
    sessions.map(async (session): Promise<PracticeCopyRow> => {
      let grade: PracticeGrade | null = null;
      if (session.status !== "labelling") {
        const copyPoints = await readGradePoints(db, session.id);
        const keySet =
          session.practice_set_number === null
            ? keyPoints
            : keyPoints.filter(
                (p) => p.setNumber === session.practice_set_number,
              );
        grade = gradePractice(keySet, copyPoints);
      }
      return {
        id: session.id,
        status: session.status,
        labeller: session.assignee
          ? {
              id: session.assignee.id,
              name: nameOf(session.assignee),
              email: session.assignee.email ?? "",
            }
          : null,
        setNumber: session.practice_set_number,
        createdAt: session.created_at,
        submittedAt: session.submitted_at,
        activeMinutes: minutes.get(session.id) ?? 0,
        grade,
      };
    }),
  );

  return {
    ok: true,
    key: {
      id: key.id,
      status: key.status,
      kind: key.kind,
      player1Name: matchResult.data?.player1_name ?? "Player 1",
      player2Name: matchResult.data?.player2_name ?? "Player 2",
      pointsBySet,
      judgedBySet,
    },
    canCopy: key.status === "complete",
    copies,
  };
}

/* -------------------------------------------------------------------------
 * The pay report
 * ---------------------------------------------------------------------- */

/**
 * One unbroken stretch of work on a session: consecutive work minutes with no
 * gap longer than {@link SITTING_GAP_MINUTES}. `start` is the first minute,
 * `end` the minute after the last one, so a single-minute sitting reads
 * 07:04–07:05.
 */
export interface PaySitting {
  start: string;
  end: string;
  /** Active minutes inside the sitting: its `label_work_beats` rows. */
  minutes: number;
}

export interface PaySessionLine {
  sessionId: string;
  labellerId: string;
  labellerName: string;
  /** "Player 1 v Player 2", from the session's match. */
  match: string;
  /** First time the session was published (`label_sessions.published_at`). */
  publishedAt: string;
  /**
   * `checked` once an admin has passed it, else `published` (waiting for the
   * check, or sent back to its labeller).
   */
  state: "published" | "checked";
  videoHours: number;
  /**
   * The paid labeller's own active minutes on the session, or null when none
   * were recorded (labelled before the console recorded work minutes).
   */
  workedMinutes: number | null;
  /** Oldest first; empty when `workedMinutes` is null. */
  sittings: PaySitting[];
}

/** Published and checked are disjoint: a checked session is not also published. */
export interface PayLabellerRow {
  labellerId: string;
  name: string;
  email: string;
  publishedSessions: number;
  publishedHours: number;
  checkedSessions: number;
  checkedHours: number;
  /** Active minutes across the sessions that recorded any. */
  workedMinutes: number;
  /** Paid sessions with no work minutes recorded, so not in `workedMinutes`. */
  untrackedSessions: number;
}

export type PayReport =
  | {
      ok: true;
      from: string;
      to: string;
      rows: PayLabellerRow[];
      lines: PaySessionLine[];
    }
  | { ok: false; reason: "admin-required" };

/**
 * A gap between two work minutes longer than this starts a new sitting. A
 * beat is posted only while someone is at the console (work-beats.ts), so a
 * short gap is a pause inside one sitting, a long one a break between two.
 */
export const SITTING_GAP_MINUTES = 15;

const MINUTE_MS = 60_000;

/** `YYYY-MM-DD` or null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

/** The next calendar day after `day` (`YYYY-MM-DD`), for an exclusive end. */
function dayAfter(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * One labeller's work minutes on one session (ISO strings, any order) folded
 * into sittings, oldest first.
 */
export function groupSittings(minutes: readonly string[]): PaySitting[] {
  const times = [...new Set(minutes)]
    .map((m) => new Date(m).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const sittings: PaySitting[] = [];
  let start = 0;
  let last = 0;
  let count = 0;
  const close = () => {
    if (count === 0) return;
    sittings.push({
      start: new Date(start).toISOString(),
      end: new Date(last + MINUTE_MS).toISOString(),
      minutes: count,
    });
  };
  for (const t of times) {
    if (count > 0 && t - last > SITTING_GAP_MINUTES * MINUTE_MS) {
      close();
      count = 0;
    }
    if (count === 0) start = t;
    last = t;
    count += 1;
  }
  close();
  return sittings;
}

// Lives in a dependency-free module so the label queue can use it client-side.
export { jobVideoSeconds };

type PayJob = JobVideoSpan;

type PayMatch = { player1_name: string | null; player2_name: string | null };

type PublishedSessionRow = {
  id: string;
  published_at: string | null;
  checked_at: string | null;
  job: PayJob | null;
  /** Many-to-one through `match_id`: one row or none. */
  match: PayMatch | null;
};

/** Non-practice sessions first published inside `[fromIso, toIso)`, with the stamps pay reads. */
async function readPublishedSessions(
  db: AdminClient,
  fromIso: string,
  toIso: string,
): Promise<
  {
    id: string;
    publishedAt: string;
    checkedAt: string | null;
    job: PayJob | null;
    match: string;
  }[]
> {
  const rows = await readAllPages<PublishedSessionRow>(
    db
      .from("label_sessions")
      .select(
        "id, published_at, checked_at, job:processing_jobs(start_time_seconds, end_time_seconds, billable_seconds), match:matches(player1_name, player2_name)",
      )
      .neq("kind", "practice")
      .gte("published_at", fromIso)
      .lt("published_at", toIso)
      .order("id")
      .returns<PublishedSessionRow[]>(),
    "Could not read published sessions",
  );
  return rows.flatMap((row) =>
    row.published_at
      ? [
          {
            id: row.id,
            publishedAt: row.published_at,
            checkedAt: row.checked_at,
            job: row.job,
            match: `${row.match?.player1_name ?? "Player 1"} v ${row.match?.player2_name ?? "Player 2"}`,
          },
        ]
      : [],
  );
}

/**
 * What each labeller published between `from` and `to` (UTC days, both
 * inclusive). A session counts once, on the day it was FIRST published
 * (`label_sessions.published_at`, which never moves), credited to whoever
 * made its first `label_submissions` row — so a session sent back and
 * published again is not paid twice. A session an admin published with no
 * submission has nobody to pay and is left out. It is `checked` once an admin
 * has passed it, else `published` (a sent-back one included); the two are
 * disjoint. Hours are the job's match video.
 *
 * Time worked is the paid labeller's own `label_work_beats` minutes on each
 * session, whenever they fell — anyone else's (an admin checking it) is not
 * theirs. Practice sets are not in the report: every one so far was paid
 * outside it.
 */
export async function getLabelPayReport(
  range: { from: string; to: string },
  deps: Deps = defaults,
): Promise<PayReport> {
  if (!(await deps.requireAdmin()))
    return { ok: false, reason: "admin-required" };
  const db = deps.createAdminClient();
  const fromIso = `${range.from}T00:00:00Z`;
  const toIso = `${dayAfter(range.to)}T00:00:00Z`;

  type SubmissionRow = {
    id: string;
    session_id: string;
    submitted_by: string | null;
    submitted_at: string;
  };
  const SUBMISSION_COLUMNS = "id, session_id, submitted_by, submitted_at";
  const published = await readPublishedSessions(db, fromIso, toIso);
  if (published.length === 0) {
    return { ok: true, from: range.from, to: range.to, rows: [], lines: [] };
  }
  // Every submission of those sessions up to the end of the range: a session
  // published in the range was first submitted before its publish. Chunked,
  // since the ids travel in the URL.
  const sessionIds = published.map((session) => session.id);
  const submissions = (
    await Promise.all(
      idChunks(sessionIds).map((ids) =>
        readAllPages<SubmissionRow>(
          db
            .from("label_submissions")
            .select(SUBMISSION_COLUMNS)
            .in("session_id", ids)
            .lt("submitted_at", toIso)
            .order("submitted_at")
            .order("id"),
          "Could not read submissions",
        ),
      ),
    )
  ).flat();
  // Each session's first submission, by time then id — the order the reads
  // ask for, applied here too since the chunks arrive apart.
  const first = new Map<string, SubmissionRow>();
  for (const row of submissions) {
    const held = first.get(row.session_id);
    if (
      !held ||
      row.submitted_at < held.submitted_at ||
      (row.submitted_at === held.submitted_at && row.id < held.id)
    )
      first.set(row.session_id, row);
  }

  const paid = published.flatMap((session) => {
    const who = first.get(session.id)?.submitted_by;
    return who ? [{ ...session, who }] : [];
  });
  if (paid.length === 0) {
    return { ok: true, from: range.from, to: range.to, rows: [], lines: [] };
  }

  type BeatRow = { session_id: string; user_id: string; minute: string };
  const whoBySession = new Map(paid.map((s) => [s.id, s.who]));
  const [beats, users] = await Promise.all([
    Promise.all(
      idChunks([...whoBySession.keys()]).map((ids) =>
        readAllPages<BeatRow>(
          db
            .from("label_work_beats")
            .select("session_id, user_id, minute")
            .in("session_id", ids)
            .order("session_id")
            .order("user_id")
            .order("minute")
            .returns<BeatRow[]>(),
          "Could not read label work minutes",
        ),
      ),
    ).then((chunks) => chunks.flat()),
    readAllPages<DbUser>(
      db
        .from("users")
        .select("id, email, first_name, last_name")
        .in("id", [...new Set(paid.map((s) => s.who))])
        .order("id"),
      "Could not read labellers",
    ),
  ]);
  const minutesBySession = new Map<string, string[]>();
  for (const beat of beats) {
    if (beat.user_id !== whoBySession.get(beat.session_id)) continue;
    const held = minutesBySession.get(beat.session_id);
    if (held) held.push(beat.minute);
    else minutesBySession.set(beat.session_id, [beat.minute]);
  }
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows = new Map<string, PayLabellerRow>();
  const rowFor = (who: string): PayLabellerRow => {
    const held = rows.get(who);
    if (held) return held;
    const user = userById.get(who);
    const row: PayLabellerRow = {
      labellerId: who,
      name: nameOf(user),
      email: user?.email ?? "",
      publishedSessions: 0,
      publishedHours: 0,
      checkedSessions: 0,
      checkedHours: 0,
      workedMinutes: 0,
      untrackedSessions: 0,
    };
    rows.set(who, row);
    return row;
  };

  const lines: PaySessionLine[] = [];
  for (const session of paid) {
    const row = rowFor(session.who);
    const hours = session.job ? jobVideoSeconds(session.job) / 3600 : 0;
    const state = session.checkedAt ? "checked" : "published";
    if (state === "checked") {
      row.checkedSessions += 1;
      row.checkedHours += hours;
    } else {
      row.publishedSessions += 1;
      row.publishedHours += hours;
    }
    const sittings = groupSittings(minutesBySession.get(session.id) ?? []);
    const worked = sittings.reduce((n, s) => n + s.minutes, 0);
    if (worked > 0) row.workedMinutes += worked;
    else row.untrackedSessions += 1;
    lines.push({
      sessionId: session.id,
      labellerId: session.who,
      labellerName: row.name,
      match: session.match,
      publishedAt: session.publishedAt,
      state,
      videoHours: hours,
      workedMinutes: worked > 0 ? worked : null,
      sittings,
    });
  }

  lines.sort(
    (a, b) =>
      a.publishedAt.localeCompare(b.publishedAt) ||
      a.sessionId.localeCompare(b.sessionId),
  );
  return {
    ok: true,
    from: range.from,
    to: range.to,
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    lines,
  };
}
