/**
 * POST /api/admin/splitstep/reprocess — resend COMPLETED analyses to the
 * vendor for its newer model output. Admin only; never billable.
 *
 * Body: `{ matchIds?: uuid[], jobIds?: uuid[], force?: boolean }` — at least
 * one id, at most {@link MAX_ITEMS} in all. A match id resolves to the match's
 * newest completed job; a job id names the parent directly. Answers 200 with
 * one line per item, in request order:
 *
 *     { matchId, parentJobId, childJobId, externalJobId }   — sent
 *     { matchId, parentJobId?, error, code }                — not sent
 *
 * Who may call: a request carrying `Authorization: Bearer $CRON_SECRET`, or a
 * signed-in `users.is_admin` session. A request with an Authorization header
 * is judged on that header alone — a wrong secret never falls through to the
 * cookie.
 *
 * A match with a label session still `labelling` is refused unless `force`:
 * its labeller is mid-way and has published nothing, so nothing would protect
 * the rows a reprocess re-derives. A `complete` session is fine — its points
 * carry `hand_labelled`, and `persistTranscript` will not overwrite them.
 *
 * Items run one after another, not in parallel: each is a vendor POST, and
 * `processing_jobs_one_live_per_match` already decides duplicates per match.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/admin/validation";
import type { ResubmitResult } from "@/lib/services/splitstep/resubmit-job";

const LOG = "[admin-reprocess]";

export const MAX_ITEMS = 25;

export type ReprocessAuth =
  { ok: true; actor: string } | { ok: false; status: 401 | 403 };

export interface ReprocessDeps {
  authorize(request: Request): Promise<ReprocessAuth>;
  /** Service role — the job reads and `resubmitJob()` need it. */
  supabase: SupabaseClient;
  /** `resubmitJob` with `reprocess: true`; injected so a spec sends nothing. */
  reprocess(input: {
    jobId: string;
    requestedBy: string;
  }): Promise<ResubmitResult>;
}

export type ReprocessLine =
  | {
      matchId: string | null;
      parentJobId: string;
      childJobId: string;
      externalJobId: string;
    }
  | {
      matchId: string | null;
      parentJobId?: string;
      error: string;
      code: string;
    };

export interface HandlerResponse {
  status: number;
  body: unknown;
}

type Target = { matchId: string } | { jobId: string };

function parseBody(
  value: unknown,
):
  | { ok: true; targets: Target[]; force: boolean }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!["matchIds", "jobIds", "force"].includes(key)) {
      return { ok: false, error: `Unknown field: ${key}.` };
    }
  }
  const list = (key: "matchIds" | "jobIds"): string[] | null => {
    const raw = body[key];
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || !raw.every(isUuid)) return null;
    return raw as string[];
  };
  const matchIds = list("matchIds");
  const jobIds = list("jobIds");
  if (matchIds === null || jobIds === null) {
    return { ok: false, error: "matchIds and jobIds must be arrays of uuids." };
  }
  if (body.force !== undefined && typeof body.force !== "boolean") {
    return { ok: false, error: "force must be a boolean." };
  }
  const targets: Target[] = [
    ...[...new Set(matchIds)].map((matchId) => ({ matchId })),
    ...[...new Set(jobIds)].map((jobId) => ({ jobId })),
  ];
  if (targets.length === 0) {
    return { ok: false, error: "Give at least one match id or job id." };
  }
  if (targets.length > MAX_ITEMS) {
    return { ok: false, error: `At most ${MAX_ITEMS} items per request.` };
  }
  return { ok: true, targets, force: body.force === true };
}

/** The parent a target names: a job id directly, a match by its newest completed job. */
async function resolveParent(
  supabase: SupabaseClient,
  target: Target,
): Promise<
  | { ok: true; matchId: string; jobId: string }
  | { ok: false; matchId: string | null; error: string; code: string }
> {
  if ("jobId" in target) {
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("id, match_id")
      .eq("id", target.jobId)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        matchId: null,
        error: error.message,
        code: "read_failed",
      };
    }
    if (!data) {
      return {
        ok: false,
        matchId: null,
        error: "Job not found.",
        code: "not_found",
      };
    }
    const row = data as { id: string; match_id: string };
    return { ok: true, matchId: row.match_id, jobId: row.id };
  }

  const { data, error } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("match_id", target.matchId)
    .eq("status", "completed")
    // The job whose data the match shows — the same order ball-paths-access
    // uses to pick it.
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      matchId: target.matchId,
      error: error.message,
      code: "read_failed",
    };
  }
  if (!data) {
    return {
      ok: false,
      matchId: target.matchId,
      error: "This match has no completed analysis to reprocess.",
      code: "not_completed",
    };
  }
  return {
    ok: true,
    matchId: target.matchId,
    jobId: (data as { id: string }).id,
  };
}

/** Is a label session for this match still being labelled? */
async function labellingInProgress(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ ok: true; labelling: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select("id")
    .eq("match_id", matchId)
    .eq("status", "labelling")
    .limit(1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, labelling: (data ?? []).length > 0 };
}

export async function handleReprocess(
  request: Request,
  deps: ReprocessDeps,
): Promise<HandlerResponse> {
  const auth = await deps.authorize(request);
  if (!auth.ok) {
    return auth.status === 401
      ? {
          status: 401,
          body: { error: "Sign in as an admin.", code: "unauthorized" },
        }
      : { status: 403, body: { error: "Admins only.", code: "forbidden" } };
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      status: 400,
      body: { error: "Body must be JSON.", code: "invalid_request" },
    };
  }
  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return {
      status: 400,
      body: { error: parsed.error, code: "invalid_request" },
    };
  }

  const results: ReprocessLine[] = [];
  for (const target of parsed.targets) {
    const parent = await resolveParent(deps.supabase, target);
    if (!parent.ok) {
      results.push({
        matchId: parent.matchId,
        error: parent.error,
        code: parent.code,
      });
      continue;
    }

    const labelling = await labellingInProgress(deps.supabase, parent.matchId);
    if (!labelling.ok) {
      results.push({
        matchId: parent.matchId,
        parentJobId: parent.jobId,
        error: `Could not check label sessions: ${labelling.error}`,
        code: "read_failed",
      });
      continue;
    }
    if (labelling.labelling && !parsed.force) {
      results.push({
        matchId: parent.matchId,
        parentJobId: parent.jobId,
        error:
          "A label session for this match is still in progress; pass force to reprocess anyway.",
        code: "labelling_in_progress",
      });
      continue;
    }
    if (labelling.labelling) {
      console.warn(`${LOG} forced past a label session in progress`, {
        matchId: parent.matchId,
        actor: auth.actor,
      });
    }

    const sent = await deps.reprocess({
      jobId: parent.jobId,
      requestedBy: auth.actor,
    });
    if (sent.ok) {
      results.push({
        matchId: parent.matchId,
        parentJobId: parent.jobId,
        childJobId: sent.jobId,
        externalJobId: sent.externalJobId,
      });
    } else {
      results.push({
        matchId: parent.matchId,
        parentJobId: parent.jobId,
        error: sent.message,
        code: sent.reason,
      });
    }
  }

  console.log(`${LOG} done`, {
    actor: auth.actor,
    sent: results.filter((r) => "childJobId" in r).length,
    refused: results.filter((r) => "error" in r).length,
  });
  return { status: 200, body: { results } };
}
