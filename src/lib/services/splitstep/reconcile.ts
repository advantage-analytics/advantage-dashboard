/**
 * Status reconciliation — recovery from a *lost or missing webhook*.
 *
 * Distinct from resubmission (resubmit-job.ts), which recovers a *failed*
 * job. Two failure modes are invisible without this:
 *
 *   • `JOB_STALE` — reported ONLY via `GET {BASE_URL}/jobs/{job_id}`, never
 *     as a webhook. Without polling, a stale job sits at `processing` forever.
 *   • A completed job whose delivery was lost. The vendor has NO retry
 *     policy, so a delivery that missed its 30s window is gone permanently —
 *     and the status response does not include `sas_url`, so the results
 *     cannot be recovered this way. The honest outcome is a failed state that
 *     routes the user to the manual resubmit path.
 *
 * Runs on the READ PATH, not a schedule: this app is on Vercel Hobby, where
 * cron fires once a day — useless against a 30-minute staleness window. The
 * precedent is `reap_stalled_uploads()`, called by the same two loaders
 * (matches list, match detail) at the same moment: a stale row only misleads
 * while someone is looking at it. `last_polled_at` is the rate limiter —
 * stamped on EVERY attempt, so a flapping vendor endpoint sees at most one
 * request per job per 10 minutes however often the page reloads.
 *
 * A failed poll (network error, `JOB_NOT_FOUND`, `STATUS_UNAVAILABLE`, or an
 * unparseable body) never mutates job state — only the stamp.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { normaliseKey, parseWebhookPayload } from "./webhook-payload";
import { releaseQuota } from "./quota";
import { isDownloadFailure, resubmitJob } from "./resubmit-job";
import { notifyAnalysisOutcome } from "@/lib/services/notifications/analysis-mail";
import { resolveSplitstepVendorApiConfig } from "./deployment-config";

const LOG = "[splitstep-reconcile]";

/** Only these statuses can be waiting on a vendor transition. */
const POLLABLE_STATUSES = ["submitting", "queued", "processing"] as const;

/** Nothing younger than this is considered stuck. */
const STALE_AFTER_MS = 30 * 60 * 1000;

/** Minimum gap between polls of the same job. */
const POLL_GAP_MS = 10 * 60 * 1000;

/** Ceiling per page load — reconciliation must never dominate a render. */
const DEFAULT_CAP = 3;

const POLL_TIMEOUT_MS = 10_000;

/**
 * OUR code for "the vendor finished, but its results never reached us" — shared
 * by the status poll (a lost delivery) and the results sweep (a delivery whose
 * download failed). Same code, same copy: to the user both are one fact.
 */
const RESULTS_DELIVERY_LOST = "RESULTS_DELIVERY_LOST";
const RESULTS_DELIVERY_LOST_MESSAGE =
  "The analysis finished, but its results never arrived. Retry the analysis.";

export interface ReconcileOutcome {
  polled: number;
  transitioned: number;
}

/**
 * Poll the vendor for jobs that look stuck and apply what it says.
 *
 * `matchIds` scopes the sweep to rows the calling page is actually showing —
 * which, arriving from an RLS-scoped read, also keeps it to the viewer's own
 * jobs. Pass no matchIds (undefined) to sweep every non-terminal job, which is
 * what scripts/splitstep-reconcile.ts does by hand.
 */
export async function reconcileVendorJobs(params: {
  /** Service-role client — writes status columns and reads the API key path. */
  supabase: SupabaseClient;
  matchIds?: string[];
  cap?: number;
  now?: Date;
}): Promise<ReconcileOutcome> {
  const { supabase, matchIds, cap = DEFAULT_CAP, now = new Date() } = params;
  const outcome: ReconcileOutcome = { polled: 0, transitioned: 0 };

  // Unconfigured deployments (local dev without vendor keys) skip silently —
  // the same posture the submit route takes, minus the 503, because nobody
  // asked for this call directly. Only the vendor-API half of the deployment
  // config: polling needs neither a webhook URL nor Azure storage, and
  // requiring them (as the full resolver does) would silently stop
  // reconciliation on a deployment where only those are incomplete.
  const config = resolveSplitstepVendorApiConfig();
  if (!config.ok) return outcome;
  const { apiUrl, apiKey } = config;

  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  const polledBefore = new Date(now.getTime() - POLL_GAP_MS).toISOString();

  let query = supabase
    .from("processing_jobs")
    .select("id, external_job_id, status, updated_at, last_polled_at")
    .in("status", [...POLLABLE_STATUSES])
    .not("external_job_id", "is", null)
    .lt("updated_at", staleBefore)
    .or(`last_polled_at.is.null,last_polled_at.lt.${polledBefore}`)
    // Oldest first: the job that has waited longest is the one most likely to
    // be genuinely lost rather than merely slow.
    .order("updated_at", { ascending: true })
    .limit(cap);

  if (matchIds !== undefined) {
    if (matchIds.length === 0) return outcome;
    query = query.in("match_id", matchIds);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`${LOG} could not list pollable jobs`, {
      error: error.message,
    });
    return outcome;
  }

  const jobs = (data ?? []) as {
    id: string;
    external_job_id: string;
    status: string;
  }[];

  if (jobs.length === 0) return outcome;

  // Stamp FIRST, unconditionally, in ONE write for the whole batch. If
  // everything after this throws, the rows still record that an attempt
  // happened and the 10-minute gap holds — and one UPDATE beats one per job
  // on a path that runs inside a page render.
  await supabase
    .from("processing_jobs")
    .update({ last_polled_at: now.toISOString() })
    .in(
      "id",
      jobs.map((j) => j.id),
    );
  outcome.polled = jobs.length;

  // The FETCHES run concurrently — they target different jobs, they don't
  // read each other, and serial polls would put cap × POLL_TIMEOUT_MS of
  // worst-case wall clock in front of a render. The failure WRITES below run
  // sequentially on purpose: they can end in resubmitJob(), whose
  // no-concurrent-duplicate guard is a read-then-insert, and two failures for
  // the same match applied in parallel could both pass it.
  const polls = await Promise.all(
    jobs.map(async (job): Promise<PolledFailure | null> => {
      let raw: string;
      let httpStatus: number;
      try {
        const response = await fetch(
          `${apiUrl.replace(/\/$/, "")}/${encodeURIComponent(job.external_job_id)}`,
          {
            headers: { "X-Api-Key": apiKey },
            signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
          },
        );
        httpStatus = response.status;
        raw = await response.text();
      } catch (err) {
        console.warn(`${LOG} poll failed — leaving the job untouched`, {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      let parsedJson: unknown = null;
      try {
        parsedJson = raw.trim() === "" ? null : JSON.parse(raw);
      } catch {
        /* handled below as unparseable */
      }

      // The status endpoint's own error shape (JOB_NOT_FOUND,
      // STATUS_UNAVAILABLE) arrives as a non-2xx with an error body. None of
      // it may move the job: JOB_NOT_FOUND could be their id churn,
      // STATUS_UNAVAILABLE is their outage, and both are polling problems,
      // not job outcomes.
      if (httpStatus < 200 || httpStatus >= 300 || parsedJson === null) {
        console.warn(`${LOG} status endpoint gave no usable answer`, {
          jobId: job.id,
          httpStatus,
          body: raw.slice(0, 300),
        });
        return null;
      }

      // Same defensive read the webhook and submit paths use — one parser,
      // one set of guesses about the vendor's field naming.
      const parsed = parseWebhookPayload(parsedJson);

      // JOB_STALE never arrives as a webhook and may not phrase itself as a
      // failed status; recognise it by code, or by the status/state field
      // itself. Only those fields — a "stale" appearing in a message or a
      // filename must not fail a job.
      const statusText = statusFieldOf(parsedJson);
      const isStale =
        parsed.errorCode === "JOB_STALE" ||
        (statusText !== null && /stale/i.test(statusText));

      if (parsed.nextStatus === "failed" || isStale) {
        return {
          jobId: job.id,
          // isStale wins over whatever error object happened to be present —
          // a status/state field matching /stale/i is definitive; a
          // leftover, unrelated error.code (e.g. a stray VIDEO_UNREACHABLE
          // from a different field) must never override that classification
          // and risk isDownloadFailure() misreading a stale job as retryable.
          errorCode: isStale ? "JOB_STALE" : parsed.errorCode,
          errorCategory: isStale ? "internal" : parsed.errorCategory,
          errorStep: isStale ? null : parsed.errorStep,
          errorMessage:
            parsed.errorMessage ??
            "The analysis could not be completed. You can retry it.",
        };
      }

      if (parsed.nextStatus === "completed") {
        // Their half finished but our row never heard: the delivery is lost,
        // and with it the results SAS — the status response cannot hand it
        // back. Do not pretend otherwise: the only path to statistics is a
        // new submission, so this surfaces as a failed state whose message
        // says exactly that, wired to the manual resubmit path.
        return {
          jobId: job.id,
          // OUR code, not a vendor one — vendor codes come from their error
          // object, and this failure is the delivery's, not the job's.
          errorCode: RESULTS_DELIVERY_LOST,
          errorCategory: "internal",
          errorStep: null,
          errorMessage: RESULTS_DELIVERY_LOST_MESSAGE,
        };
      }

      // queued/processing or anything unrecognised: their answer matches (or
      // does not contradict) ours. The stamp is the only write.
      return null;
    }),
  );

  for (const failure of polls) {
    if (failure === null) continue;
    const transitioned = await applyPolledFailure({ supabase, ...failure });
    if (transitioned) outcome.transitioned += 1;
  }

  return outcome;
}

/**
 * How long a cached `GET /jobs` answer stays good. The matches layout and page
 * both render in one request, and a coach flicking between Matches and Roster
 * should not cost a vendor call per click.
 */
const QUEUE_LIST_TTL_MS = 60 * 1000;

let queueListCache: {
  at: number;
  jobs: Map<string, string>;
} | null = null;

/**
 * Learn which queued jobs the vendor has started.
 *
 * The vendor sends no "processing" webhook — only `queued` and then
 * `job_completed` / `job_failed` (api-docs.html, "Webhook Responses"). The only
 * source is their status API, whose `job_processing` means a worker picked the
 * job up. `reconcileVendorJobs` above cannot answer this: it waits 30 minutes
 * before polling, built for stuck jobs, and a typical job starts well inside
 * that. So a row went Queued → Analyzed without ever reading Analyzing.
 *
 * One `GET {BASE_URL}/jobs` lists every in-flight job for our key, so this is
 * one request per page read however many rows are queued, cached for a minute.
 * It only ever moves `queued` → `processing`, guarded on the row still being
 * `queued` so a webhook that lands meanwhile always wins. A job missing from
 * the list is finished or failed; its webhook, or the stale poll, owns that —
 * absence is never read as an outcome here.
 */
export async function refreshQueuedJobs(params: {
  supabase: SupabaseClient;
  matchIds: string[];
  now?: Date;
}): Promise<number> {
  const { supabase, matchIds, now = new Date() } = params;
  if (matchIds.length === 0) return 0;

  const config = resolveSplitstepVendorApiConfig();
  if (!config.ok) return 0;

  const { data, error } = await supabase
    .from("processing_jobs")
    .select("id, external_job_id")
    .eq("status", "queued")
    .not("external_job_id", "is", null)
    .in("match_id", matchIds);
  if (error || !data || data.length === 0) return 0;

  const vendorJobs = await listInFlightJobs(config, now);
  if (!vendorJobs) return 0;

  const started = (data as { id: string; external_job_id: string }[])
    .filter((job) => vendorJobs.get(job.external_job_id) === "processing")
    .map((job) => job.id);
  if (started.length === 0) return 0;

  const { data: moved, error: moveError } = await supabase
    .from("processing_jobs")
    .update({ status: "processing" })
    .in("id", started)
    .eq("status", "queued")
    .select("id");
  if (moveError) {
    console.warn(`${LOG} could not mark started jobs`, {
      error: moveError.message,
    });
    return 0;
  }
  return moved?.length ?? 0;
}

/** Vendor job id → our next status, for every job their queue still holds. */
async function listInFlightJobs(
  config: { apiUrl: string; apiKey: string },
  now: Date,
): Promise<Map<string, string> | null> {
  if (queueListCache && now.getTime() - queueListCache.at < QUEUE_LIST_TTL_MS) {
    return queueListCache.jobs;
  }

  let body: unknown;
  try {
    const response = await fetch(config.apiUrl.replace(/\/$/, ""), {
      headers: { "X-Api-Key": config.apiKey },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`${LOG} job list gave no usable answer`, {
        httpStatus: response.status,
      });
      return null;
    }
    body = await response.json();
  } catch (err) {
    console.warn(`${LOG} job list failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // `{ jobs: [...] }` per their reference client; a bare array is accepted
  // too rather than silently reading every job as absent.
  const list = Array.isArray(body)
    ? body
    : body &&
        typeof body === "object" &&
        Array.isArray((body as { jobs?: unknown }).jobs)
      ? (body as { jobs: unknown[] }).jobs
      : null;
  if (!list) {
    console.warn(`${LOG} job list had an unexpected shape`);
    return null;
  }

  const jobs = new Map<string, string>();
  for (const entry of list) {
    const parsed = parseWebhookPayload(entry);
    if (parsed.externalJobId && parsed.nextStatus) {
      jobs.set(parsed.externalJobId, parsed.nextStatus);
    }
  }
  queueListCache = { at: now.getTime(), jobs };
  return jobs;
}

interface PolledFailure {
  jobId: string;
  errorCode: string | null;
  errorCategory: string | null;
  errorStep: string | null;
  errorMessage: string;
}

/**
 * The render-path entry point: reconcile, but never fatally.
 *
 * Owns the admin client and the try/catch so the two Server Component pages
 * that call this (matches list, match detail) share one copy of the
 * "log and carry on" policy instead of each maintaining its own. Server-only
 * by dependency — nothing under a client module graph may import this file.
 */
export async function reconcileBeforePageRead(
  matchIds: string[],
  pageTag: string,
): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    await reconcileVendorJobs({ supabase, matchIds });
    await refreshQueuedJobs({ supabase, matchIds });
  } catch (err) {
    // Never fatal — the page is more useful slightly stale than not at all.
    console.warn(`[${pageTag}] reconciliation failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // The results sweep runs AFTER the response, never in front of it: unlike
  // the poll above (one small GET per job), it downloads a results file and
  // derives a whole match, which is seconds of work no render should wait on.
  // `after()` is allowed in Server Components, which both callers are (the
  // matches list loader runs inside its page). The page this read renders will
  // still say "Stats pending"; the next read shows the recovered match.
  //
  // Both halves are guarded: `after()` itself throws outside a request scope
  // (a script calling this), and nothing inside the callback may reject.
  try {
    after(async () => {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        await recoverUndeliveredResults({
          supabase: createAdminClient(),
          matchIds,
        });
      } catch (err) {
        console.warn(`[${pageTag}] results sweep failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch (err) {
    console.warn(`[${pageTag}] could not schedule the results sweep`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Ceiling per page read for the results sweep — separate from the poll's. */
const RESULTS_SWEEP_CAP = 2;

/**
 * How long after `completed_at` a missing results key counts as stuck. The
 * webhook secures results in its own `after()` within seconds; ten minutes
 * leaves any in-flight download well alone.
 */
const RESULTS_SWEEP_AFTER_MS = 10 * 60 * 1000;

/**
 * Budget for one sweep's derivation wait. deriveAndPublish() must settle the
 * job before the platform kills the invocation (a row frozen at `deriving`
 * reads as analysing forever), and a page invocation's remaining duration is
 * unknown here — so this is deliberately short of the 60 s floor.
 */
const RESULTS_SWEEP_BUDGET_MS = 40_000;

export interface ResultsSweepOutcome {
  claimed: number;
  recovered: number;
  lost: number;
}

/** The sweep's side effects, injectable for tests. Defaults load lazily. */
export interface ResultsSweepIo {
  secureResults: typeof import("./secure-results").secureResults;
  gradeResults: typeof import("./grade-results").gradeResults;
  deriveAndPublish: typeof import("./derive-and-publish").deriveAndPublish;
  resultsKeyFor: (job: {
    id: string;
    created_by: string | null;
    match_id: string | null;
    external_job_id: string | null;
  }) => string;
  releaseQuota: typeof releaseQuota;
  notifyAnalysisOutcome: typeof notifyAnalysisOutcome;
}

async function defaultResultsSweepIo(): Promise<ResultsSweepIo> {
  // Imported on use: the render path loads this module on every list read,
  // and only a sweep that actually claimed a row needs the derivation engine.
  const [secure, grade, derive, keys] = await Promise.all([
    import("./secure-results"),
    import("./grade-results"),
    import("./derive-and-publish"),
    import("./delivery-storage-keys"),
  ]);
  return {
    secureResults: secure.secureResults,
    gradeResults: grade.gradeResults,
    deriveAndPublish: derive.deriveAndPublish,
    // The webhook's own key builder, so a recovered file lands exactly where
    // a normal delivery would have put it. With a job id the delivery id only
    // names the orphan fallback, which this path can never take.
    resultsKeyFor: (job) =>
      keys.selectDeliveryStorageKeys({
        jobId: job.id,
        createdBy: job.created_by,
        matchId: job.match_id,
        externalJobId: job.external_job_id,
        deliveryId: "reconcile",
      }).resultsKey,
    releaseQuota,
    notifyAnalysisOutcome,
  };
}

interface UndeliveredJob {
  id: string;
  match_id: string | null;
  created_by: string | null;
  external_job_id: string | null;
  sas_url: string | null;
  sas_expires_at: string | null;
  completed_at: string;
  last_polled_at: string | null;
}

/**
 * Recover jobs the vendor completed whose results never landed.
 *
 * The webhook's `completed` branch records the delivery (status `completed`,
 * `sas_url` = the strokes url) and returns 200, then downloads in `after()`.
 * If that download fails nothing retries it, and the row sits at `completed`
 * with no `results_object_key` and no `derivation_version` — "Stats pending"
 * forever. This sweep re-runs the webhook's post-download path for such rows:
 * secureResults → gradeResults → deriveAndPublish, the same three calls in the
 * same order, gated on the results being secured exactly as the webhook gates
 * them. (The webhook's per-frame files and ball paths are not repeated: they
 * are best-effort and their urls stay on the row. Without the trajectories
 * file a recovered derivation takes the strokes-only fallback for line calls,
 * exactly as a webhook whose trajectories fetch missed does.)
 *
 * ── Claiming, and what "a second attempt" means ─────────────────────────────
 * Two page reads can sweep the same row. Each row is CLAIMED before any work
 * by a compare-and-swap on `last_polled_at`: an update that stamps it to now,
 * conditional on the row still being stuck AND on `last_polled_at` still
 * holding the value this sweep read. Only one sweep can win that swap; a
 * sweep whose claim matches 0 rows skips the row. The stamp doubles as the
 * rate limit — a claimed row is not selected again for POLL_GAP_MS.
 *
 * A failed attempt leaves only that stamp behind. The NEXT claim therefore
 * sees a `last_polled_at` later than `completed_at`, which is how it knows a
 * sweep has already tried and failed once. (A stamp from BEFORE completion is
 * the status poll's, from while the job was still processing, and does not
 * count.) Rule: an attempt that fails when a previous sweep attempt already
 * exists marks the job lost; a first failure just waits for the next read.
 *
 * A job is also marked lost WITHOUT a download attempt when its strokes url is
 * missing or already expired — `sas_expires_at`, or failing that the SAS's own
 * `se=` expiry — because there is nothing left to fetch.
 *
 * Marking lost is the same RESULTS_DELIVERY_LOST failure the status poll
 * writes, conditional on `status = completed` so a derivation or webhook that
 * moved the row first wins; it then refunds the reservation and sends the
 * failure mail, as applyPolledFailure() does for that code.
 *
 * Never throws for a per-row failure; each is logged and the sweep moves on.
 */
export async function recoverUndeliveredResults(params: {
  /** Service-role client. */
  supabase: SupabaseClient;
  /** Scope to the rows the page shows (RLS-scoped); undefined sweeps all. */
  matchIds?: string[];
  cap?: number;
  /** Clock, for tests. */
  now?: () => Date;
  io?: Partial<ResultsSweepIo>;
}): Promise<ResultsSweepOutcome> {
  const {
    supabase,
    matchIds,
    cap = RESULTS_SWEEP_CAP,
    now = () => new Date(),
  } = params;
  const outcome: ResultsSweepOutcome = { claimed: 0, recovered: 0, lost: 0 };
  if (matchIds !== undefined && matchIds.length === 0) return outcome;

  const startedAt = now();
  const completedBefore = new Date(
    startedAt.getTime() - RESULTS_SWEEP_AFTER_MS,
  ).toISOString();
  const polledBefore = new Date(
    startedAt.getTime() - POLL_GAP_MS,
  ).toISOString();

  let query = supabase
    .from("processing_jobs")
    .select(
      "id, match_id, created_by, external_job_id, sas_url, sas_expires_at, completed_at, last_polled_at",
    )
    .eq("status", "completed")
    .is("results_object_key", null)
    .is("derivation_version", null)
    .lt("completed_at", completedBefore)
    .or(`last_polled_at.is.null,last_polled_at.lt.${polledBefore}`)
    .order("completed_at", { ascending: true })
    .limit(cap);
  if (matchIds !== undefined) query = query.in("match_id", matchIds);

  const { data, error } = await query;
  if (error) {
    console.warn(`${LOG} could not list undelivered results`, {
      error: error.message,
    });
    return outcome;
  }
  // The cap is enforced here as well as in the query, so a misbehaving
  // client can never widen a render-path sweep.
  const jobs = ((data ?? []) as UndeliveredJob[]).slice(0, cap);
  if (jobs.length === 0) return outcome;

  const io: ResultsSweepIo = {
    ...(await defaultResultsSweepIoIfNeeded(params.io)),
    ...params.io,
  } as ResultsSweepIo;
  const deadline = startedAt.getTime() + RESULTS_SWEEP_BUDGET_MS;

  // Sequential: each row can end in a derivation, and the budget is shared.
  for (const job of jobs) {
    try {
      const result = await sweepOneJob({ supabase, job, io, now, deadline });
      if (result !== "skipped") outcome.claimed += 1;
      if (result === "recovered") outcome.recovered += 1;
      if (result === "lost") outcome.lost += 1;
    } catch (err) {
      console.error(`${LOG} results sweep threw on a job`, {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcome;
}

/** Only pay for the lazy imports when a test has not injected every one. */
async function defaultResultsSweepIoIfNeeded(
  injected: Partial<ResultsSweepIo> | undefined,
): Promise<Partial<ResultsSweepIo>> {
  const needed: (keyof ResultsSweepIo)[] = [
    "secureResults",
    "gradeResults",
    "deriveAndPublish",
    "resultsKeyFor",
  ];
  if (injected && needed.every((k) => injected[k] !== undefined)) {
    return { releaseQuota, notifyAnalysisOutcome };
  }
  return defaultResultsSweepIo();
}

async function sweepOneJob(params: {
  supabase: SupabaseClient;
  job: UndeliveredJob;
  io: ResultsSweepIo;
  now: () => Date;
  deadline: number;
}): Promise<"skipped" | "recovered" | "lost" | "retry-later" | "unsettled"> {
  const { supabase, job, io, now, deadline } = params;
  const at = now();

  // Claim: compare-and-swap on last_polled_at (see the doc comment above).
  let claim = supabase
    .from("processing_jobs")
    .update({ last_polled_at: at.toISOString() })
    .eq("id", job.id)
    .eq("status", "completed")
    .is("results_object_key", null)
    .is("derivation_version", null);
  claim =
    job.last_polled_at === null
      ? claim.is("last_polled_at", null)
      : claim.eq("last_polled_at", job.last_polled_at);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) {
    console.warn(`${LOG} could not claim an undelivered job`, {
      jobId: job.id,
      error: claimError.message,
    });
    return "skipped";
  }
  if (!claimed || claimed.length === 0) return "skipped";

  const previousSweepAttempt =
    job.last_polled_at !== null &&
    new Date(job.last_polled_at).getTime() >
      new Date(job.completed_at).getTime();

  const expiresAt = strokesUrlExpiry(job);
  if (!job.sas_url || (expiresAt !== null && expiresAt <= at.getTime())) {
    console.warn(`${LOG} strokes url missing or expired — results are lost`, {
      jobId: job.id,
    });
    return (await markResultsLost({ supabase, jobId: job.id, io, now }))
      ? "lost"
      : "unsettled";
  }

  const objectKey = io.resultsKeyFor(job);
  const secured = await io.secureResults({
    supabase,
    jobId: job.id,
    strokesUrl: job.sas_url,
    objectKey,
    logPrefix: LOG,
  });

  if (!secured.resultsSecured) {
    if (previousSweepAttempt) {
      return (await markResultsLost({ supabase, jobId: job.id, io, now }))
        ? "lost"
        : "unsettled";
    }
    // First failure: the claim's stamp is the record of it. The next read
    // after POLL_GAP_MS tries once more, and that attempt decides.
    console.warn(`${LOG} results recovery failed once — will retry`, {
      jobId: job.id,
      error: secured.error,
    });
    return "retry-later";
  }

  // The webhook's post-secure path, in its order: grade, then derive.
  await io.gradeResults({
    supabase,
    jobId: job.id,
    objectKey: secured.objectKey,
    body: secured.body,
  });
  const derived = await io.deriveAndPublish({
    supabase,
    jobId: job.id,
    deadline,
  });
  console.log(`${LOG} recovered undelivered results`, {
    jobId: job.id,
    derived: derived.ok,
  });
  return "recovered";
}

/**
 * When the strokes url stops working: the row's `sas_expires_at` when set,
 * else the SAS token's own `se=` parameter. Null when neither is readable —
 * then only the download attempt can tell.
 */
function strokesUrlExpiry(job: {
  sas_url: string | null;
  sas_expires_at: string | null;
}): number | null {
  if (job.sas_expires_at) {
    const t = new Date(job.sas_expires_at).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (job.sas_url) {
    try {
      const se = new URL(job.sas_url).searchParams.get("se");
      if (se) {
        const t = new Date(se).getTime();
        if (!Number.isNaN(t)) return t;
      }
    } catch {
      /* not a URL — let the download attempt decide */
    }
  }
  return null;
}

/**
 * Settle a completed-but-undelivered job as RESULTS_DELIVERY_LOST. Conditional
 * on `status = completed`: 0 rows means something else moved it (a derivation
 * that started, a webhook redelivery) and that answer wins — leave it.
 */
async function markResultsLost(params: {
  supabase: SupabaseClient;
  jobId: string;
  io: ResultsSweepIo;
  now: () => Date;
}): Promise<boolean> {
  const { supabase, jobId, io, now } = params;
  const { data, error } = await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      error_code: RESULTS_DELIVERY_LOST,
      error_category: "internal",
      error_step: null,
      error_message: RESULTS_DELIVERY_LOST_MESSAGE,
      completed_at: now().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "completed")
    .select("id");

  if (error) {
    console.error(`${LOG} could not mark results lost`, {
      jobId,
      error: error.message,
    });
    return false;
  }
  if (!data || data.length === 0) return false;

  console.log(`${LOG} job failed: results never landed`, { jobId });
  // As applyPolledFailure() does for this same code: refund, then the
  // uploader's failure mail. Never auto-resubmitted — `internal`.
  await io.releaseQuota(supabase, jobId);
  await io.notifyAnalysisOutcome({ supabase, jobId, outcome: "failed" });
  return true;
}

/** The top-level `status`/`state` string of a parsed body, if one exists. */
function statusFieldOf(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const normalised = normaliseKey(key);
    if (
      (normalised === "status" || normalised === "state") &&
      typeof value === "string"
    ) {
      return value;
    }
  }
  return null;
}

/**
 * Apply a failure learned via polling — the same shape the webhook's
 * `job_failed` branch produces, guarded so a webhook that raced in wins.
 *
 * Auto-resubmission runs for the same single class the webhook retries
 * (download-step failures) and no other. `JOB_STALE` and
 * `RESULTS_DELIVERY_LOST` are `internal` and never auto-retried — they
 * surface, and the manual button is the recovery.
 */
async function applyPolledFailure(params: {
  supabase: SupabaseClient;
  jobId: string;
  errorCode: string | null;
  errorCategory: string | null;
  errorStep: string | null;
  errorMessage: string;
}): Promise<boolean> {
  const { supabase, jobId, errorCode, errorCategory, errorStep, errorMessage } =
    params;

  // Conditional on still being pollable: if a webhook landed between our read
  // and this write, its answer is fresher and this update matches zero rows.
  const { data, error } = await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      error_code: errorCode,
      error_category: errorCategory,
      error_step: errorStep,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", [...POLLABLE_STATUSES])
    .select("id");

  if (error) {
    console.error(`${LOG} could not apply polled failure`, {
      jobId,
      error: error.message,
    });
    return false;
  }
  if (!data || data.length === 0) return false;

  console.log(`${LOG} job failed via status poll`, { jobId, errorCode });

  // Same order as the webhook's failed branch: hand the reservation back
  // before anything might reserve again.
  await releaseQuota(supabase, jobId);

  if (isDownloadFailure(errorCode, errorStep)) {
    const result = await resubmitJob({ supabase, jobId, auto: true });
    if (result.ok) {
      console.log(`${LOG} auto-resubmitted after polled download failure`, {
        jobId,
        newJobId: result.jobId,
      });
    } else {
      console.warn(`${LOG} auto-resubmit declined`, {
        jobId,
        reason: result.reason,
      });
      await notifyAnalysisOutcome({ supabase, jobId, outcome: "failed" });
    }
  } else {
    // Final, same as the webhook's branch: the uploader's "Email me if
    // analysis fails". Deduped per job, so a webhook landing later is silent.
    await notifyAnalysisOutcome({ supabase, jobId, outcome: "failed" });
  }

  return true;
}
