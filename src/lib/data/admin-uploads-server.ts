import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DbAdminUploadSubmission,
  DbAdminUploadSubmissionItem,
} from "@/lib/admin/uploads/types";
import type {
  AdminUploadHistoryResult,
  AdminUploadHistoryState,
} from "@/lib/admin/uploads/history";
import { resolveAnalysisStatus, withStatsPublished } from "./match-analysis";
import { readAllPages } from "./admin-range-read";
import { UUID_RE } from "@/lib/admin/validation";

interface Dependencies {
  requireAdmin: typeof requireAdmin;
  createClient: () => Promise<SupabaseClient>;
  createAdminClient: () => SupabaseClient;
}
const defaults: Dependencies = {
  requireAdmin,
  createClient,
  createAdminClient,
};
// Keep PostgreSQL microseconds: Date.toISOString() would lose the pagination boundary.
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    if (cursor.length > 400 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      value.v !== 1 ||
      typeof value.date !== "string" ||
      !TIMESTAMP.test(value.date) ||
      !Number.isFinite(Date.parse(value.date)) ||
      typeof value.id !== "string" ||
      !UUID_RE.test(value.id)
    )
      return null;
    return { date: value.date, id: value.id };
  } catch {
    return null;
  }
}
function cursorFor(row: DbAdminUploadSubmission) {
  return Buffer.from(
    JSON.stringify({ v: 1, date: row.created_at, id: row.operation_id }),
  ).toString("base64url");
}
async function byIds<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  key: string,
  ids: string[],
  order = "id",
): Promise<T[]> {
  const unique = [...new Set(ids)];
  // Each id-chunk is an independent query, so every chunk resolves concurrently.
  const chunks: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += 100)
    chunks.push(unique.slice(offset, offset + 100));
  const pages = await Promise.all(
    chunks.map((chunk) =>
      readAllPages<T>(
        client
          .from(table)
          .select(columns)
          .in(key, chunk)
          .order(order)
          .returns<T[]>(),
        "history read failed",
      ),
    ),
  );
  return pages.flat();
}
interface Match {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
}
interface Job {
  id: string;
  match_id: string;
  status: string;
  derivation_version: string | null;
  error_message: string | null;
  external_job_id: string | null;
}
interface Attempt {
  operation_id: string;
  item_id: string;
  match_id: string;
  file_id: string;
  state: string;
  error_code: string | null;
}

/** No server action: injectable dependencies are for server tests only. */
export async function getAdminUploadHistory(
  input: { cursor?: string | null; pageSize?: number } = {},
  deps: Dependencies = defaults,
): Promise<AdminUploadHistoryResult> {
  // Authorization precedes either client and all parameter-driven reads.
  if (!(await deps.requireAdmin()))
    return {
      ok: false,
      reason: "admin-required",
      message: "Administrator access is required.",
    };
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    return {
      ok: false,
      reason: "invalid-page-size",
      message: "Choose a page size between 1 and 100.",
    };
  const cursor = input.cursor == null ? null : decodeCursor(input.cursor);
  if (input.cursor != null && !cursor)
    return {
      ok: false,
      reason: "invalid-cursor",
      message: "This history page link is invalid.",
    };
  try {
    // Provenance has authenticated admin-only SELECT, deliberately no service grants.
    const session = await deps.createClient();
    let query = session
      .from("admin_upload_submissions")
      .select(
        "operation_id, actor_user_id, program_id, kind, event_id, origin, created_at",
      )
      .eq("origin", "admin_console")
      .order("created_at", { ascending: false })
      .order("operation_id", { ascending: false });
    if (cursor)
      query = query.or(
        `created_at.lt.${cursor.date},and(created_at.eq.${cursor.date},operation_id.lt.${cursor.id})`,
      );
    const page = await query.limit(pageSize + 1);
    if (page.error || !page.data) throw new Error("history read failed");
    const submissions = page.data.slice(
      0,
      pageSize,
    ) as DbAdminUploadSubmission[];
    if (!submissions.length) return { ok: true, rows: [], nextCursor: null };
    const admin = deps.createAdminClient();
    const ids = submissions.map((s) => s.operation_id);
    const [items, attempts, programs, actors, events] = await Promise.all([
      byIds<DbAdminUploadSubmissionItem>(
        session,
        "admin_upload_submission_items",
        "operation_id, item_id, kind, request, status, match_id, outcome_id, processing_job_id, match_file_id, result, error_code",
        "operation_id",
        ids,
        "item_id",
      ),
      byIds<Attempt>(
        session,
        "admin_file_attempts",
        "operation_id, item_id, match_id, file_id, state, error_code",
        "operation_id",
        ids,
        "item_id",
      ),
      byIds<{ id: string; school_name: string; team: string | null }>(
        admin,
        "programs",
        "id, school_name, team",
        "id",
        submissions.map((s) => s.program_id),
      ),
      byIds<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>(
        admin,
        "users",
        "id, first_name, last_name, email",
        "id",
        submissions.flatMap((s) => (s.actor_user_id ? [s.actor_user_id] : [])),
      ),
      byIds<{ id: string; name: string }>(
        admin,
        "program_events",
        "id, name",
        "id",
        submissions.flatMap((s) => (s.event_id ? [s.event_id] : [])),
      ),
    ]);
    const matchIds = items.flatMap((i) => (i.match_id ? [i.match_id] : []));
    const [matches, jobs, stats, visible, outcomes] = await Promise.all([
      byIds<Match>(
        admin,
        "matches",
        "id, player1_name, player2_name",
        "id",
        matchIds,
      ),
      byIds<Job>(
        admin,
        "processing_jobs",
        "id, match_id, status, derivation_version, error_message, external_job_id",
        "id",
        items.flatMap((i) =>
          i.processing_job_id ? [i.processing_job_id] : [],
        ),
      ),
      byIds<{ match_id: string }>(
        admin,
        "match_stats",
        "match_id",
        "match_id",
        matchIds,
        "match_id",
      ),
      byIds<{ id: string }>(session, "matches", "id", "id", matchIds),
      byIds<{ id: string; kind: string; side: string; round: string | null }>(
        admin,
        "program_event_outcomes",
        "id, kind, side, round",
        "id",
        items.flatMap((i) => (i.outcome_id ? [i.outcome_id] : [])),
      ),
    ]);
    const matchMap = new Map(matches.map((m) => [m.id, m]));
    const outcomeMap = new Map(outcomes.map((o) => [o.id, o]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const attemptMap = new Map(
      attempts.map((a) => [`${a.operation_id}/${a.item_id}`, a]),
    );
    const published = new Set(stats.map((s) => s.match_id));
    const readable = new Set(visible.map((m) => m.id));
    const rows = submissions.map((s) => {
      const mapped = items
        .filter((i) => i.operation_id === s.operation_id)
        .map((i) => {
          const match = i.match_id ? matchMap.get(i.match_id) : undefined;
          const outcome = i.outcome_id
            ? outcomeMap.get(i.outcome_id)
            : undefined;
          let state: AdminUploadHistoryState = "unknown";
          let error = i.error_code;
          // Mirrors admin_reconcile_submission_item's admission rules; the RPC
          // re-checks everything (quota, analysis rows) under its locks.
          const reconcile = { abandon: false, complete: false };
          const reconcilable =
            i.kind !== "outcome" &&
            (s.kind === "video" ||
              s.kind === "file" ||
              s.kind === "analysis_attachment");
          if (i.status === "failed") state = "failed";
          else if (i.status === "pending") state = "pending";
          else if (i.status === "succeeded") {
            if (i.processing_job_id) {
              const job = jobMap.get(i.processing_job_id);
              if (job && job.match_id === i.match_id) {
                const resolved = resolveAnalysisStatus(
                  job.status,
                  job.derivation_version,
                );
                if (resolved)
                  state = withStatsPublished(
                    resolved,
                    published.has(job.match_id),
                  );
                error = job.error_message ?? error;
                reconcile.abandon =
                  reconcilable &&
                  ["pending", "uploading", "uploaded", "failed"].includes(
                    job.status,
                  ) &&
                  job.external_job_id == null;
              }
            } else if (i.match_file_id) {
              const attempt = attemptMap.get(`${s.operation_id}/${i.item_id}`);
              if (
                attempt &&
                attempt.match_id === i.match_id &&
                attempt.file_id === i.match_file_id
              ) {
                if (attempt.state === "completed") state = "imported";
                else if (
                  ["queued", "processing", "failed"].includes(attempt.state)
                )
                  state = attempt.state as AdminUploadHistoryState;
                error = attempt.error_code ?? error;
                reconcile.abandon =
                  reconcilable &&
                  ["queued", "processing", "failed"].includes(attempt.state);
                reconcile.complete =
                  reconcilable && attempt.state === "processing";
              }
            } else if (
              outcome ||
              (match && (s.kind === "dual" || s.kind === "tournament"))
            )
              state = "saved";
          }
          const target =
            typeof i.request.slot === "string"
              ? i.request.slot
              : typeof i.request.round === "string"
                ? i.request.round
                : null;
          const what = match
            ? [
                match.player1_name || "Unknown player",
                match.player2_name || "Unknown opponent",
              ].join(" vs ")
            : i.kind === "outcome"
              ? outcome
                ? `${outcome.kind} · ${outcome.side}`
                : "Schedule outcome unavailable"
              : i.kind === "analysis_attachment"
                ? "Analysis attachment"
                : "Match";
          return {
            itemId: i.item_id,
            kind: i.kind,
            saveStatus: i.status,
            state,
            error,
            what: target ? `${target} · ${what}` : what,
            matchId: i.match_id,
            outcomeId: i.outcome_id,
            outcome: outcome
              ? { kind: outcome.kind, side: outcome.side, round: outcome.round }
              : null,
            matchHref:
              i.match_id && readable.has(i.match_id)
                ? `/dashboard/matches/${i.match_id}`
                : null,
            reconcile,
          };
        });
      const counts = {
        saved: mapped.filter((i) => i.saveStatus === "succeeded").length,
        failed: mapped.filter((i) => i.saveStatus === "failed").length,
        pending: mapped.filter((i) => i.saveStatus === "pending").length,
        unknown: mapped.filter(
          (i) => !["succeeded", "failed", "pending"].includes(i.saveStatus),
        ).length,
      };
      const state: AdminUploadHistoryState =
        counts.saved && counts.saved < mapped.length
          ? "partial"
          : mapped.length && mapped.every((i) => i.state === mapped[0].state)
            ? mapped[0].state
            : "unknown";
      const program = programs.find((p) => p.id === s.program_id);
      const actor = actors.find((a) => a.id === s.actor_user_id);
      return {
        operationId: s.operation_id,
        date: s.created_at,
        team: {
          id: s.program_id,
          name: program?.school_name ?? "Unavailable team",
          side: program?.team ?? null,
        },
        kind: s.kind,
        what:
          events.find((e) => e.id === s.event_id)?.name ??
          (mapped.length === 1 ? mapped[0].what : `${mapped.length} items`),
        addedBy: {
          id: s.actor_user_id,
          name: actor
            ? [actor.first_name, actor.last_name].filter(Boolean).join(" ") ||
              actor.email ||
              "Unknown administrator"
            : "Deleted or unavailable administrator",
        },
        eventId: s.event_id,
        state,
        counts,
        items: mapped,
      };
    });
    return {
      ok: true,
      rows,
      nextCursor:
        page.data.length > pageSize
          ? cursorFor(submissions[submissions.length - 1])
          : null,
    };
  } catch {
    return {
      ok: false,
      reason: "read-failed",
      message: "We couldn't load upload history. Try again.",
    };
  }
}
