import type { createAdminClient } from "@/lib/supabase/admin";
import { RESULTS_BUCKET } from "./config";
import { pipelineLog } from "./pipeline-log";

/**
 * Secure a job's results: download the vendor's strokes JSON, write it to the
 * `match-results` bucket, and record the outcome through
 * `finalize_splitstep_results`.
 *
 * Extracted verbatim from the `completed` branch of the SplitStep webhook
 * (`api/webhooks/splitstep/route.ts`), which still calls it with the same
 * arguments, log prefix and timeout it used inline — the webhook route is
 * frozen integration code (docs/ui-revamp-guardrails.md §2), so this is an
 * extraction with identical behaviour, not a rewrite.
 *
 * It exists as a function so a caller WITHOUT a webhook delivery — the
 * reconciler recovering a job whose results never landed — can run the same
 * step. `deliveryId` is optional for that reason: without one the RPC's
 * delivery update matches no row (so there is nowhere to write
 * `processing_error`; the error is still logged and returned), while the
 * `processing_jobs.results_object_key` write happens exactly as it does for a
 * delivery.
 *
 * Never throws for a download or upload failure: the reason has to reach
 * `finalize_splitstep_results` either way, and nothing retries this. The RPC's
 * own error is ignored, as it always was in the route.
 */

const DEFAULT_LOG_PREFIX = "[splitstep-webhook]";

/** Ceiling on the strokes fetch — the route's `RESULTS_FETCH_TIMEOUT_MS`. */
const DEFAULT_TIMEOUT_MS = 25_000;

export type SecureResultsOutcome =
  | {
      resultsSecured: true;
      objectKey: string;
      bytes: number;
      /** The downloaded JSON, kept in memory for grading. */
      body?: string;
    }
  | { resultsSecured: false; error: string };

export async function secureResults(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string | null;
  strokesUrl: string;
  /** Storage key to write the results under. */
  objectKey: string;
  /** The webhook delivery this download belongs to, when there is one. */
  deliveryId?: string | null;
  timeoutMs?: number;
  /** Prefix for the log lines; the webhook passes its own `[splitstep-webhook]`. */
  logPrefix?: string;
  io?: { fetch?: typeof fetch };
}): Promise<SecureResultsOutcome> {
  const {
    supabase,
    jobId,
    strokesUrl,
    objectKey,
    deliveryId = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logPrefix = DEFAULT_LOG_PREFIX,
    io = {},
  } = params;

  const stored = await storeVendorJson({
    supabase,
    url: strokesUrl,
    objectKey,
    timeoutMs,
    // Kept in memory for the grading step, which would otherwise read it
    // straight back out of storage.
    returnBody: true,
    fetchImpl: io.fetch ?? fetch,
  });

  await supabase.rpc("finalize_splitstep_results", {
    p_delivery_id: deliveryId,
    p_job_id: jobId,
    p_results_object_key: stored.ok ? stored.objectKey : null,
    p_error: stored.ok ? null : stored.error,
  });

  if (stored.ok) {
    pipelineLog.info(`${logPrefix} results stored`, {
      jobId,
      objectKey: stored.objectKey,
      bytes: stored.bytes,
    });
    return {
      resultsSecured: true,
      objectKey: stored.objectKey,
      bytes: stored.bytes,
      body: stored.body,
    };
  }

  // Loud, because nothing retries this. The url is on the job row
  // (`sas_url`) and stays valid for days — it can be fetched by hand.
  pipelineLog.error(
    `${logPrefix} results download FAILED — recover from the stored strokes url (processing_jobs.sas_url)`,
    { deliveryId, jobId, error: stored.error },
  );
  return { resultsSecured: false, error: stored.error };
}

/**
 * Fetch one of the vendor's JSON files and put it in Supabase Storage.
 *
 * A copy of the route's `storeVendorJson` with `fetch` injectable. The route
 * keeps its own for the per-frame files: it is frozen, and a route module may
 * not export a helper for this file to import.
 */
async function storeVendorJson(params: {
  supabase: ReturnType<typeof createAdminClient>;
  url: string;
  objectKey: string;
  timeoutMs: number;
  returnBody?: boolean;
  fetchImpl: typeof fetch;
}): Promise<
  | { ok: true; objectKey: string; bytes: number; body?: string }
  | { ok: false; error: string }
> {
  const {
    supabase,
    url,
    objectKey,
    timeoutMs,
    returnBody = false,
    fetchImpl,
  } = params;

  let body: Blob;
  let text: string | undefined;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      // No credentials — the URL carries its own.
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Vendor returned ${response.status} ${response.statusText}`,
      };
    }

    if (returnBody) {
      text = await response.text();
      body = new Blob([text], { type: "application/json" });
    } else {
      body = await response.blob();
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }

  if (body.size === 0 || (text !== undefined && text.trim() === "")) {
    return { ok: false, error: "Vendor returned an empty body" };
  }

  const { error } = await supabase.storage
    .from(RESULTS_BUCKET)
    .upload(objectKey, body, {
      contentType: "application/json",
      // Overwrite: a retry that got past the already-stored guard should land
      // on the same key rather than accumulating near-identical copies.
      upsert: true,
    });

  if (error) {
    return { ok: false, error: `Storage upload failed: ${error.message}` };
  }

  return { ok: true, objectKey, bytes: body.size, body: text };
}
