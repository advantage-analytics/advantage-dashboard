/**
 * Admin › Ask — the feedback reader's rows, as the page draws them, and the
 * pure half of `ask-admin-server.ts`: a raw `ask_feedback` row (with its
 * copies of the question and the answer, both opaque jsonb) read into the
 * shape the table and the drawer show, plus the PostHog links.
 *
 * Pure so `tests/ask-admin.spec.ts` can pin the reading offline: no
 * Supabase, no `next/*`. Names, never emails: the asker is shown by name and
 * id, and the page prints no address anywhere.
 */

import {
  readAskFeedbackRow,
  type AskFeedback,
} from "@/lib/services/ask/feedback";

export interface AdminAskFeedbackRow {
  id: string;
  /** Null once the conversation was deleted; the copies below stand. */
  messageId: string | null;
  rating: AskFeedback["rating"];
  reasons: AskFeedback["reasons"];
  note: string | null;
  /** When the thumb was set, ISO. */
  createdAt: string;
  /** When it was last changed, ISO. */
  updatedAt: string;
  asker: { id: string; name: string };
  /** The program the question was asked in, or null for a personal one. */
  program: { id: string; name: string } | null;
  question: { text: string; tags: { kind: string; label: string }[] };
  answer: {
    headline: string | null;
    body: string;
    sql: string | null;
    scopeSql: string | null;
    visualKind: string | null;
    sourceCount: number | null;
    mock: boolean;
  };
  posthog: { traces: string; person: string };
}

/** The columns `listAdminAskFeedback()` selects. */
export interface DbAdminAskFeedback {
  id: string;
  message_id: string | null;
  user_id: string;
  program_id: string | null;
  rating: string;
  reasons: unknown;
  note: string | null;
  created_at: string;
  updated_at: string;
  question: unknown;
  answer: unknown;
}

export interface AdminAskPeople {
  /** `users.id` → a display name. */
  names: ReadonlyMap<string, string>;
  /** `programs.id` → the program's name. */
  programs: ReadonlyMap<string, string>;
}

/**
 * PostHog's project for this app. `.env.example` carries the ingest token
 * and host; the app's own project id is this one, shared by local and
 * production (`.env.example`), overridable through `POSTHOG_PROJECT_ID`.
 */
export const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID ?? "291029";

/** `https://us.i.posthog.com` (the ingest host) → `https://us.posthog.com` (the app). */
export function posthogAppOrigin(ingestHost: string | undefined): string {
  const host = (ingestHost ?? "https://us.i.posthog.com").replace(/\/+$/, "");
  return host.replace(/\.i\.posthog\.com$/, ".posthog.com");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The UTC day of an instant, `YYYY-MM-DD`; null when it cannot be read. */
export function utcDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Where the run's model calls are in PostHog. No trace id is stored —
 * `ask_runs` and `ask_feedback` carry none, and the LLM adapter mints one
 * per request and keeps it to itself — so the link opens the LLM analytics
 * traces for the day the answer was given, and the person page beside it
 * lists that asker's events; the page says so.
 */
export function posthogLinks(
  origin: string,
  userId: string,
  day: string | null,
): { traces: string; person: string } {
  const base = `${origin}/project/${POSTHOG_PROJECT_ID}`;
  const traces = new URL(`${base}/ai-observability/traces`);
  if (day) {
    traces.searchParams.set("date_from", day);
    traces.searchParams.set("date_to", nextDay(day));
  }
  return {
    traces: traces.toString(),
    person: `${base}/person/${encodeURIComponent(userId)}`,
  };
}

/** `first last`, else the id's first eight characters — never an email. */
export function askerName(
  id: string,
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const name = [first, last]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return name || `Player ${id.slice(0, 8)}`;
}

/** One raw row read into the page's shape; null when it does not read whole. */
export function readAdminAskFeedback(
  row: DbAdminAskFeedback,
  people: AdminAskPeople,
  origin: string,
): AdminAskFeedbackRow | null {
  const feedback = readAskFeedbackRow({
    rating: row.rating,
    reasons: row.reasons,
    note: row.note,
  });
  if (!feedback) return null;

  const question = isRecord(row.question) ? row.question : {};
  const answer = isRecord(row.answer) ? row.answer : {};
  const tags = Array.isArray(question.tags)
    ? question.tags.flatMap((tag) =>
        isRecord(tag) &&
        typeof tag.kind === "string" &&
        typeof tag.label === "string"
          ? [{ kind: tag.kind, label: tag.label }]
          : [],
      )
    : [];
  const visual = isRecord(answer.visual) ? answer.visual : null;
  const sources = Array.isArray(answer.sources)
    ? answer.sources.length
    : isRecord(answer.sources) && Array.isArray(answer.sources.matches)
      ? answer.sources.matches.length
      : null;

  return {
    id: row.id,
    messageId: row.message_id,
    rating: feedback.rating,
    reasons: feedback.reasons,
    note: feedback.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    asker: {
      id: row.user_id,
      name: people.names.get(row.user_id) ?? askerName(row.user_id, null, null),
    },
    program: row.program_id
      ? {
          id: row.program_id,
          name: people.programs.get(row.program_id) ?? "A program",
        }
      : null,
    question: {
      text:
        typeof row.question === "string"
          ? row.question
          : (text(question.text) ?? ""),
      tags,
    },
    answer: {
      headline: text(answer.headline),
      body: typeof answer.body === "string" ? answer.body : "",
      sql: text(answer.sql),
      scopeSql: text(answer.scopeSql),
      visualKind: visual ? text(visual.kind) : null,
      sourceCount: sources,
      mock: answer.mock === true,
    },
    posthog: posthogLinks(origin, row.user_id, utcDay(row.created_at)),
  };
}

/**
 * Down-votes first — they are what the page exists to read — newest change
 * first within each. Stable, so the loader's own order is the tie-break.
 */
export function sortAdminAskFeedback(
  rows: readonly AdminAskFeedbackRow[],
): AdminAskFeedbackRow[] {
  return [...rows].sort((a, b) => {
    if (a.rating !== b.rating) return a.rating === "down" ? -1 : 1;
    return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  });
}

export type AdminAskView = "down" | "up" | "all";

export function filterAdminAskFeedback(
  rows: readonly AdminAskFeedbackRow[],
  view: AdminAskView,
): AdminAskFeedbackRow[] {
  if (view === "all") return [...rows];
  return rows.filter((row) => row.rating === view);
}
