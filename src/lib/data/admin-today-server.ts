import {
  isFresh,
  loadNavSeen,
  lookAtSurface,
  type SeenState,
} from "@/lib/admin/seen-server";
import {
  listAdminRequests,
  type AdminRequestRow,
} from "@/lib/data/admin-requests-server";
import {
  STATUS_MAP,
  isAnalysisFailed,
  isSubmitStalled,
  resolveAnalysisStatus,
  showsStoredNote,
} from "@/lib/data/match-analysis";
import { matchOutcome, type MatchScore } from "@/lib/data/match-utils";
import { programDisplayName } from "@/lib/data/programs-server";
import { formatHoursShort } from "@/lib/data/usage-format";
import { readAllPages } from "@/lib/data/admin-range-read";
import { askerName } from "@/lib/data/ask-admin-view";
import { classifyFlags } from "@/lib/services/labels/job-groups";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import {
  ASK_FEEDBACK_REASON_LABELS,
  type AskFeedbackReason,
} from "@/lib/services/ask/feedback";
import {
  PROVIDER_ID,
  currentBillingMonth,
} from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";

/**
 * Admin › Today — everything waiting on an admin, oldest first, in one list.
 *
 * Nothing here invents a rule. Each kind of row is read with the definition
 * the surface that owns it already uses:
 *
 *   claim / request  `listAdminRequests({ view: "waiting" })` — claims
 *                    `pending_review` / `objected` and open `program_requests`,
 *                    the same set the Requests nav count reads.
 *   job              the NEWEST `processing_jobs` row per match, when it is
 *                    failed (`isAnalysisFailed` over `resolveAnalysisStatus`)
 *                    or a submit that never happened (`isSubmitStalled`, the
 *                    3-minute clock the match page uses). A failed job that
 *                    was resubmitted is not waiting on anyone.
 *   label            a completed Advantage Intelligence job nobody has opened
 *                    a label session for (`jobState` "todo", Labels' "Needs
 *                    labelling"), whose analysis raised at least one amber
 *                    flag — a flag that can move the score, by `classifyFlags`.
 *                    Grey flags (data hints) do not put a match here, and a
 *                    session already under way is someone's work in progress.
 *   pilot            a pilot individual with 90%+ of this month's personal cap
 *                    used, cap from `monthlyCapSecondsFor()` with their
 *                    `video_hours_override`; usage as Admin › Pilots counts it.
 *   ask              a thumbs down that is unread: `ask_feedback` has no read
 *                    state, so "unread" is the Ask page's own definition — set
 *                    after this admin's latest look at Admin › Ask and not
 *                    opened there since (key `ask:<id>`, as `countAskForNav`).
 *
 * Service role behind `requireAdminOrNotFound()`, like every admin loader.
 */

export type TodayKind = "claim" | "request" | "job" | "label" | "pilot" | "ask";

export type TodayCell =
  | {
      type: "person";
      name: string;
      photoUrl: string | null;
      rest: string | null;
      sub: string | null;
    }
  | {
      type: "match";
      player: string;
      opponent: string;
      won: boolean | null;
      sets: ScoreLineSet[];
      /** "Personal" or the program's name — text only, no crest on Today. */
      context: string;
    };

export type TodayPrimary =
  | { label: string; href: string }
  /** Seeds the job's label session, then opens it (`useStartLabelling`). */
  | { label: string; startLabellingJobId: string };

export interface TodayItem {
  /** The `admin_seen` key on the "today" surface: `claim:<id>`, `job:<id>`… */
  key: string;
  kind: TodayKind;
  /** The Needs column: "Claim objected", "Analysis failed". */
  need: string;
  /** When it started waiting, ISO. The Waiting column's clock. */
  since: string;
  fresh: boolean;
  cell: TodayCell;
  /** The drawer's heading. */
  title: string;
  /** One sentence built from the row's own facts. */
  body: string;
  primary: TodayPrimary;
  link: { label: string; href: string } | null;
}

export interface TodayPipeline {
  uploading: number;
  analyzing: number;
  queued: number;
  /** Newest `splitstep_webhook_deliveries.received_at`, or null. */
  lastWebhookAt: string | null;
}

export interface TodayPage {
  items: TodayItem[];
  freshCount: number;
  pipeline: TodayPipeline | null;
}

/** The "New" key Admin › Ask writes — `askSeenKey()` in ask-admin-server. */
const askSeenKey = (id: string) => `ask:${id}`;

/** 90% of the month's cap used reads as "nearly out". */
const PILOT_NEARLY_OUT = 0.9;

type Draft = Omit<TodayItem, "fresh">;

// ── Requests ────────────────────────────────────────────────────────────────

const REQUEST_NEED: Record<string, string> = {
  unlisted_program: "New program",
  invite_request: "Invite request",
  ownership_dispute: "Ownership dispute",
  match_issue: "Match issue",
};

function requestDrafts(rows: AdminRequestRow[]): Draft[] {
  return rows.map((row) => {
    const detail = row.detail;
    const reviewHref = `/admin/requests?id=${encodeURIComponent(row.id)}`;

    if (detail.source === "claim") {
      return {
        key: `claim:${row.id}`,
        kind: "claim",
        need: row.status === "objected" ? "Claim objected" : "Claim to review",
        since: row.date,
        cell: {
          type: "person",
          name: row.from.name,
          photoUrl: null,
          rest: `claims ${row.team}`,
          sub: row.for,
        },
        title: `${row.from.name} claims ${row.team}`,
        body: sentence(detail.reviewReason),
        primary: { label: "Review claim", href: reviewHref },
        link: {
          label: "Open team",
          href: `/admin/teams/${encodeURIComponent(detail.programId)}`,
        },
      };
    }

    const kind = detail.kind;
    const rest =
      kind === "unlisted_program"
        ? `wants ${row.team} added`
        : kind === "invite_request"
          ? `asks to join ${row.team}`
          : kind === "match_issue"
            ? `reports ${row.team}`
            : kind === "ownership_dispute"
              ? `disputes ${row.team}`
              : `about ${row.team}`;
    const note = detail.note?.trim();
    const point = detail.match?.pointLabel
      ? ` It names point ${detail.match.pointLabel}.`
      : "";
    return {
      key: `request:${row.id}`,
      kind: "request",
      need: REQUEST_NEED[kind] ?? row.for,
      since: row.date,
      cell: {
        type: "person",
        name: row.from.name,
        photoUrl: null,
        rest,
        sub: detail.roleLabel ? `${row.for} · ${detail.roleLabel}` : row.for,
      },
      title: `${row.from.name} ${rest}`,
      body:
        (note
          ? `Their note: “${note}”`
          : `No note came with it; reply to ${row.from.email}.`) + point,
      primary: { label: "Review request", href: reviewHref },
      link: detail.match
        ? {
            label: "Open match",
            href: `/admin/matches/${encodeURIComponent(detail.match.id)}`,
          }
        : detail.programId
          ? {
              label: "Open team",
              href: `/admin/teams/${encodeURIComponent(detail.programId)}`,
            }
          : null,
    };
  });
}

// ── Matches (shared by jobs and labels) ─────────────────────────────────────

interface MatchFacts {
  player: string;
  opponent: string;
  won: boolean | null;
  sets: ScoreLineSet[];
  context: string;
}

async function readMatches(
  db: AdminClient,
  ids: string[],
): Promise<Map<string, MatchFacts>> {
  const out = new Map<string, MatchFacts>();
  if (ids.length === 0) return out;
  const { data, error } = await db
    .from("matches")
    .select(
      "id, player1_name, player2_name, score, programs!matches_program_id_fkey(school_name, team)",
    )
    .in("id", ids);
  if (error) {
    console.error("[admin today] could not read matches", error.message);
    return out;
  }
  for (const row of (data ?? []) as unknown as {
    id: string;
    player1_name: string | null;
    player2_name: string | null;
    score: MatchScore | null;
    programs:
      | { school_name: string | null; team: string | null }
      | { school_name: string | null; team: string | null }[]
      | null;
  }[]) {
    const program = Array.isArray(row.programs)
      ? (row.programs[0] ?? null)
      : row.programs;
    out.set(row.id, {
      player: row.player1_name ?? "Player",
      opponent: row.player2_name ?? "Opponent",
      won: matchOutcome(row.score, true),
      sets: scoreSetsFrom(row.score),
      context: program?.school_name
        ? programDisplayName(program.school_name, program.team)
        : "Personal",
    });
  }
  return out;
}

function matchCell(match: MatchFacts | undefined): TodayCell {
  return {
    type: "match",
    player: match?.player ?? "Player",
    opponent: match?.opponent ?? "Opponent",
    won: match?.won ?? null,
    sets: match?.sets ?? [],
    context: match?.context ?? "Personal",
  };
}

const matchTitle = (match: MatchFacts | undefined) =>
  `${match?.player ?? "Player"} vs ${match?.opponent ?? "Opponent"}`;

// ── Failed or stuck analyses ────────────────────────────────────────────────

interface JobRow {
  id: string;
  match_id: string;
  status: string;
  derivation_version: string | null;
  external_job_id: string | null;
  error_message: string | null;
  error_code: string | null;
  error_step: string | null;
  created_at: string;
  updated_at: string;
}

async function jobDrafts(db: AdminClient, nowMs: number): Promise<Draft[]> {
  // Candidates first, then every job on their matches, so "newest per match"
  // is decided against the whole chain — a resubmitted failure is not waiting.
  const { data: candidates, error } = await db
    .from("processing_jobs")
    .select("match_id")
    .in("status", ["failed", "derivation_failed", "uploaded"]);
  if (error) {
    console.error("[admin today] could not read jobs", error.message);
    return [];
  }
  const matchIds = [
    ...new Set(
      ((candidates ?? []) as { match_id: string }[]).map((r) => r.match_id),
    ),
  ];
  if (matchIds.length === 0) return [];

  const { data: chain, error: chainError } = await db
    .from("processing_jobs")
    .select(
      "id, match_id, status, derivation_version, external_job_id, error_message, error_code, error_step, created_at, updated_at",
    )
    .in("match_id", matchIds)
    .order("created_at", { ascending: false });
  if (chainError) {
    console.error(
      "[admin today] could not read job chains",
      chainError.message,
    );
    return [];
  }

  const newest = new Map<string, JobRow>();
  for (const job of (chain ?? []) as JobRow[]) {
    if (!newest.has(job.match_id)) newest.set(job.match_id, job);
  }

  const waiting: { job: JobRow; stuck: boolean }[] = [];
  for (const job of newest.values()) {
    const status = resolveAnalysisStatus(job.status, job.derivation_version);
    if (!status) continue;
    if (isAnalysisFailed(status)) {
      waiting.push({ job, stuck: false });
    } else if (
      isSubmitStalled(
        {
          status,
          updatedAt: job.updated_at,
          jobReference: job.external_job_id ?? undefined,
        },
        nowMs,
      )
    ) {
      waiting.push({ job, stuck: true });
    }
  }
  if (waiting.length === 0) return [];

  const matches = await readMatches(
    db,
    waiting.map(({ job }) => job.match_id),
  );

  return waiting.map(({ job, stuck }) => {
    const match = matches.get(job.match_id);
    const message = job.error_message?.trim();
    const body = stuck
      ? "The video finished uploading but was never handed to Advantage Intelligence, so nothing is analysing it."
      : job.status === "derivation_failed"
        ? "The vendor’s results came back, and turning them into points and shots failed."
        : message && showsStoredNote(job.error_code)
          ? `The job failed${job.error_step ? ` at ${job.error_step}` : ""}: ${message}`
          : `The job failed${job.error_step ? ` at ${job.error_step}` : ""} with no message recorded.`;
    const matchId = encodeURIComponent(job.match_id);
    return {
      key: `job:${job.id}`,
      kind: "job",
      need: stuck ? "Analysis stuck" : "Analysis failed",
      since: job.updated_at,
      cell: matchCell(match),
      title: matchTitle(match),
      body: sentence(body),
      primary: {
        label: "Open in Matches",
        href: `/admin/matches?id=${matchId}`,
      },
      link: { label: "Open match", href: `/admin/matches/${matchId}` },
    } satisfies Draft;
  });
}

// ── Flagged labels ──────────────────────────────────────────────────────────

async function labelDrafts(db: AdminClient): Promise<Draft[]> {
  const { data: jobs, error } = await db
    .from("processing_jobs")
    .select("id, match_id, completed_at")
    .eq("provider", PROVIDER_ID)
    .eq("status", "completed")
    .not("results_object_key", "is", null);
  if (error) {
    console.error("[admin today] could not read label jobs", error.message);
    return [];
  }
  const jobRows = (jobs ?? []) as {
    id: string;
    match_id: string;
    completed_at: string | null;
  }[];
  if (jobRows.length === 0) return [];

  const { data: sessions, error: sessionsError } = await db
    .from("label_sessions")
    .select("job_id")
    .in(
      "job_id",
      jobRows.map((job) => job.id),
    );
  if (sessionsError) {
    console.error(
      "[admin today] could not read label sessions",
      sessionsError.message,
    );
    return [];
  }
  const started = new Set(
    ((sessions ?? []) as { job_id: string }[]).map((s) => s.job_id),
  );
  const todo = jobRows.filter(
    (job) => !started.has(job.id) && job.completed_at,
  );
  if (todo.length === 0) return [];

  const matchIds = [...new Set(todo.map((job) => job.match_id))];
  let points: { match_id: string; flags: unknown }[];
  try {
    points = await readAllPages<{ match_id: string; flags: unknown }>(
      db
        .from("points")
        .select("match_id, flags")
        .in("match_id", matchIds)
        .order("id"),
      "Could not read the matches' flags",
    );
  } catch (cause) {
    console.error("[admin today] could not read flags", cause);
    return [];
  }

  // Points whose own flags hold at least one amber mark.
  const amberPoints = new Map<string, number>();
  for (const row of points) {
    if (!Array.isArray(row.flags) || row.flags.length === 0) continue;
    const codes = row.flags.filter((f): f is string => typeof f === "string");
    if (classifyFlags([codes]).amber > 0) {
      amberPoints.set(row.match_id, (amberPoints.get(row.match_id) ?? 0) + 1);
    }
  }

  const flagged = todo.filter(
    (job) => (amberPoints.get(job.match_id) ?? 0) > 0,
  );
  if (flagged.length === 0) return [];
  const matches = await readMatches(
    db,
    flagged.map((job) => job.match_id),
  );

  return flagged.map((job) => {
    const count = amberPoints.get(job.match_id) ?? 0;
    const match = matches.get(job.match_id);
    const points = count === 1 ? "1 point" : `${count} points`;
    return {
      key: `label:${job.id}`,
      kind: "label",
      need: `${points} flagged`,
      since: job.completed_at as string,
      cell: matchCell(match),
      title: matchTitle(match),
      body: `Nobody has started labelling this match, and the analysis flagged ${points} with a mark that can change the score.`,
      primary: { label: "Open in label console", startLabellingJobId: job.id },
      link: {
        label: "Open match",
        href: `/admin/matches/${encodeURIComponent(job.match_id)}`,
      },
    } satisfies Draft;
  });
}

// ── Pilots nearly out ───────────────────────────────────────────────────────

async function pilotDrafts(db: AdminClient): Promise<Draft[]> {
  const { data: users, error } = await db
    .from("users")
    .select(
      "id, email, first_name, last_name, avatar_path, is_admin, video_hours_override",
    )
    .eq("individual_pilot", true);
  if (error) {
    console.error("[admin today] could not read pilots", error.message);
    return [];
  }
  const pilots = (users ?? []) as {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_path: string | null;
    is_admin: boolean | null;
    video_hours_override: number | string | null;
  }[];
  if (pilots.length === 0) return [];

  const month = currentBillingMonth();
  const { data: usage, error: usageError } = await db
    .from("processing_usage")
    .select("account_id, reserved_seconds, actual_seconds, created_at")
    .eq("account_type", "individual")
    .eq("billing_month", month)
    .eq("released", false)
    .in(
      "account_id",
      pilots.map((p) => p.id),
    )
    .order("created_at", { ascending: true });
  if (usageError) {
    console.error("[admin today] could not read usage", usageError.message);
    return [];
  }
  const byUser = new Map<string, { seconds: number; at: string }[]>();
  for (const row of (usage ?? []) as {
    account_id: string;
    reserved_seconds: number | null;
    actual_seconds: number | null;
    created_at: string;
  }[]) {
    const list = byUser.get(row.account_id) ?? [];
    list.push({
      seconds: Number(row.actual_seconds ?? row.reserved_seconds ?? 0),
      at: row.created_at,
    });
    byUser.set(row.account_id, list);
  }

  const drafts: Draft[] = [];
  for (const pilot of pilots) {
    const override =
      pilot.video_hours_override == null
        ? null
        : Number(pilot.video_hours_override);
    const cap = monthlyCapSecondsFor({
      kind: "personal",
      orgType: null,
      individualPilot: true,
      pilotEligible: false,
      unlimitedVideo: pilot.is_admin === true,
      videoHoursOverride: Number.isFinite(override) ? override : null,
    });
    if (!(cap > 0)) continue;
    const threshold = cap * PILOT_NEARLY_OUT;

    // The upload that carried them over the line is when it started waiting.
    let used = 0;
    let crossedAt: string | null = null;
    for (const row of byUser.get(pilot.id) ?? []) {
      used += row.seconds;
      if (!crossedAt && used >= threshold) crossedAt = row.at;
    }
    if (!crossedAt) continue;

    const name = personName(pilot);
    const usedLine = `${formatHoursShort(used)} of ${formatHoursShort(cap)} h used`;
    drafts.push({
      key: `pilot:${pilot.id}:${month}`,
      kind: "pilot",
      need: used >= cap ? "Pilot out of hours" : "Pilot almost out",
      since: crossedAt,
      cell: {
        type: "person",
        name,
        photoUrl: pilot.avatar_path
          ? db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(pilot.avatar_path)
              .data.publicUrl
          : null,
        rest: null,
        sub: `Personal · ${usedLine}`,
      },
      title: name,
      body: `${name} has used ${formatHoursShort(used)} of ${formatHoursShort(cap)} hours of personal video this month.`,
      primary: { label: "Set hours", href: "/admin/pilots" },
      link: null,
    });
  }
  return drafts;
}

// ── Unread thumbs down on Ask ───────────────────────────────────────────────

async function askDrafts(
  db: AdminClient,
  askSeen: SeenState,
): Promise<Draft[]> {
  const { data, error } = await db
    .from("ask_feedback")
    .select("id, user_id, reasons, note, question, created_at")
    .eq("rating", "down")
    .gt("created_at", askSeen.since)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[admin today] could not read Ask feedback", error.message);
    return [];
  }
  const rows = (
    (data ?? []) as {
      id: string;
      user_id: string;
      reasons: unknown;
      note: string | null;
      question: unknown;
      created_at: string;
    }[]
  ).filter((row) => isFresh(askSeen, askSeenKey(row.id), row.created_at));
  if (rows.length === 0) return [];

  const { data: users } = await db
    .from("users")
    .select("id, first_name, last_name, avatar_path")
    .in("id", [...new Set(rows.map((row) => row.user_id))]);
  const people = new Map(
    (
      (users ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_path: string | null;
      }[]
    ).map((user) => [user.id, user]),
  );

  return rows.map((row) => {
    const user = people.get(row.user_id);
    const name = askerName(row.user_id, user?.first_name, user?.last_name);
    const question = questionText(row.question);
    const reasons = (Array.isArray(row.reasons) ? row.reasons : [])
      .map((r) => ASK_FEEDBACK_REASON_LABELS[r as AskFeedbackReason])
      .filter(Boolean);
    const note = row.note?.trim();
    const body = note
      ? `Their note: “${note}”`
      : reasons.length > 0
        ? `They picked ${reasons.join(", ").toLowerCase()} and left no note.`
        : "They left no reason and no note.";
    return {
      key: `ask:${row.id}`,
      kind: "ask",
      need: "Thumbs down on Ask",
      since: row.created_at,
      cell: {
        type: "person",
        name,
        photoUrl: user?.avatar_path
          ? db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(user.avatar_path)
              .data.publicUrl
          : null,
        rest: null,
        sub: question ? `“${question}”` : null,
      },
      title: question ? `“${question}”` : `${name}’s question`,
      body,
      primary: {
        label: "Open in Ask",
        href: `/admin/ask?id=${encodeURIComponent(row.id)}`,
      },
      link: null,
    } satisfies Draft;
  });
}

// ── The pipeline line ───────────────────────────────────────────────────────

async function loadPipeline(db: AdminClient): Promise<TodayPipeline | null> {
  const live = Object.entries(STATUS_MAP)
    .filter(([, ui]) =>
      ["uploading", "queued", "processing", "deriving"].includes(ui),
    )
    .map(([db]) => db);
  const [jobs, webhook] = await Promise.all([
    db.from("processing_jobs").select("status").in("status", live),
    db
      .from("splitstep_webhook_deliveries")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (jobs.error) {
    console.error("[admin today] could not read live jobs", jobs.error.message);
    return null;
  }
  const pipeline: TodayPipeline = {
    uploading: 0,
    analyzing: 0,
    queued: 0,
    lastWebhookAt: webhook.error
      ? null
      : ((webhook.data as { received_at: string } | null)?.received_at ?? null),
  };
  for (const row of (jobs.data ?? []) as { status: string }[]) {
    const ui = STATUS_MAP[row.status];
    if (ui === "uploading") pipeline.uploading += 1;
    else if (ui === "queued") pipeline.queued += 1;
    else pipeline.analyzing += 1;
  }
  return pipeline;
}

// ── Assembly ────────────────────────────────────────────────────────────────

async function loadDrafts(
  db: AdminClient,
  askSeen: SeenState,
  nowMs: number,
): Promise<Draft[]> {
  const settle = async <T>(label: string, work: Promise<T[]>): Promise<T[]> =>
    work.catch((cause) => {
      console.error(`[admin today] ${label} failed`, cause);
      return [] as T[];
    });

  const groups = await Promise.all([
    settle(
      "requests",
      listAdminRequests({ view: "waiting", limit: 100 }).then((page) =>
        requestDrafts(page.rows),
      ),
    ),
    settle("jobs", jobDrafts(db, nowMs)),
    settle("labels", labelDrafts(db)),
    settle("pilots", pilotDrafts(db)),
    settle("ask", askDrafts(db, askSeen)),
  ]);
  return groups
    .flat()
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

/** The page's read. Records this look at Today (moves the watermark). */
export async function loadAdminToday(): Promise<TodayPage> {
  const admin = await requireAdminOrNotFound();
  const db = createAdminClient();
  const now = new Date();
  const [seen, navSeen, pipeline] = await Promise.all([
    lookAtSurface(admin.id, "today", now),
    loadNavSeen(admin.id, now),
    loadPipeline(db).catch(() => null),
  ]);
  const drafts = await loadDrafts(db, navSeen.ask, now.getTime());
  const items = drafts.map((draft) => ({
    ...draft,
    fresh: isFresh(seen, draft.key, draft.since),
  }));
  return {
    items,
    freshCount: items.filter((item) => item.fresh).length,
    pipeline,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function personName(user: {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  const full = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return (
    full || (user.email ?? "").split("@")[0] || askerName(user.id, null, null)
  );
}

function questionText(question: unknown): string | null {
  if (typeof question === "string") return question.trim() || null;
  if (question && typeof question === "object" && "text" in question) {
    const text = (question as { text: unknown }).text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }
  return null;
}

/** Ends a sentence once — a stored message may already carry its full stop. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?”"]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
