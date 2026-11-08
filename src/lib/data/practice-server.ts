/**
 * Loaders for the two reviewer-hiring admin pages:
 *   - `/admin/labels/[sessionId]/practice` — an answer key's practice copies
 *     (practice-session.ts), each graded against the key
 *     (practice-grading.ts) with the applicant's active minutes;
 *   - `/admin/labels/pay` — video hours per labeller over a date range, from
 *     what they submitted, for paying reviewers by the hour of match video.
 *
 * Both re-check `requireAdmin` and read service-role, like every admin loader
 * (`admin/layout.tsx` gates the route already). Read-only.
 */

import { readAllPages } from "@/lib/data/admin-range-read";
import { countLabelWorkMinutes } from "@/lib/data/labels-server";
import { isUuid } from "@/lib/admin/validation";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { labellerName } from "@/lib/services/labels/assign-session";
import {
  gradePractice,
  strokeFamily,
  type GradePoint,
  type PracticeGrade,
  type Side,
} from "@/lib/services/labels/practice-grading";
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

export interface PaySessionLine {
  sessionId: string;
  labellerId: string;
  labellerName: string;
  /** First time it was handed in. */
  submittedAt: string;
  /** `submitted` (awaiting review) or `approved` (published). */
  state: "submitted" | "approved";
  videoHours: number;
}

export interface PayLabellerRow {
  labellerId: string;
  name: string;
  email: string;
  submittedSessions: number;
  approvedSessions: number;
  submittedHours: number;
  approvedHours: number;
  practiceSets: number;
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

/** Seconds of match video a job covers: its trimmed span, else what was billed. */
export function jobVideoSeconds(job: {
  start_time_seconds: number | string | null;
  end_time_seconds: number | string | null;
  billable_seconds: number | null;
}): number {
  const start = Number(job.start_time_seconds ?? 0);
  const end = Number(job.end_time_seconds ?? NaN);
  if (Number.isFinite(end) && end > start) return end - start;
  return job.billable_seconds ?? 0;
}

/**
 * Who handed in what between `from` and `to` (UTC days, both inclusive). A
 * session counts once, on the day of its FIRST submission, credited to whoever
 * made it — so a session reopened and handed in again is not paid twice. It
 * counts while it is `submitted` or `complete` (approved); one an admin sent
 * back (`labelling`) waits until it is handed in again. Hours are the job's
 * match video. Practice copies are never paid hours: they are counted apart,
 * as practice sets submitted in the range.
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
    session_id: string;
    submitted_by: string | null;
    submitted_at: string;
  };
  // Every submission up to the end of the range: a session's first one may
  // fall before `from`, and then it is not this range's to pay.
  const submissions = await readAllPages<SubmissionRow>(
    db
      .from("label_submissions")
      .select("session_id, submitted_by, submitted_at")
      .lt("submitted_at", toIso)
      .order("submitted_at")
      .order("id"),
    "Could not read submissions",
  );
  const first = new Map<string, SubmissionRow>();
  for (const row of submissions) {
    if (!first.has(row.session_id)) first.set(row.session_id, row);
  }
  const inRange = [...first.values()].filter(
    (row) => row.submitted_at >= fromIso && row.submitted_by,
  );
  if (inRange.length === 0) {
    return { ok: true, from: range.from, to: range.to, rows: [], lines: [] };
  }

  type SessionRow = {
    id: string;
    kind: string;
    status: string;
    job: {
      start_time_seconds: number | string | null;
      end_time_seconds: number | string | null;
      billable_seconds: number | null;
    } | null;
  };
  const sessionIds = inRange.map((row) => row.session_id);
  const userIds = [
    ...new Set(inRange.map((row) => row.submitted_by as string)),
  ];
  const [sessions, users] = await Promise.all([
    readAllPages<SessionRow>(
      db
        .from("label_sessions")
        .select(
          "id, kind, status, job:processing_jobs(start_time_seconds, end_time_seconds, billable_seconds)",
        )
        .in("id", sessionIds)
        .order("id")
        .returns<SessionRow[]>(),
      "Could not read sessions",
    ),
    readAllPages<DbUser>(
      db
        .from("users")
        .select("id, email, first_name, last_name")
        .in("id", userIds)
        .order("id"),
      "Could not read labellers",
    ),
  ]);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows = new Map<string, PayLabellerRow>();
  const lines: PaySessionLine[] = [];
  for (const sub of inRange) {
    const session = sessionById.get(sub.session_id);
    const who = sub.submitted_by as string;
    if (!session) continue;
    const user = userById.get(who);
    const row =
      rows.get(who) ??
      ({
        labellerId: who,
        name: nameOf(user),
        email: user?.email ?? "",
        submittedSessions: 0,
        approvedSessions: 0,
        submittedHours: 0,
        approvedHours: 0,
        practiceSets: 0,
      } satisfies PayLabellerRow);
    rows.set(who, row);

    if (session.kind === "practice") {
      if (session.status === "submitted") row.practiceSets += 1;
      continue;
    }
    if (session.status !== "submitted" && session.status !== "complete")
      continue;
    const hours = session.job ? jobVideoSeconds(session.job) / 3600 : 0;
    const state = session.status === "complete" ? "approved" : "submitted";
    if (state === "approved") {
      row.approvedSessions += 1;
      row.approvedHours += hours;
    } else {
      row.submittedSessions += 1;
      row.submittedHours += hours;
    }
    lines.push({
      sessionId: session.id,
      labellerId: who,
      labellerName: row.name,
      submittedAt: sub.submitted_at,
      state,
      videoHours: hours,
    });
  }

  return {
    ok: true,
    from: range.from,
    to: range.to,
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    lines,
  };
}
