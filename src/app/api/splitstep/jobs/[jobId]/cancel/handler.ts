/**
 * The decision half of `POST /api/splitstep/jobs/[jobId]/cancel` — "Cancel
 * analysis" on a video that is still waiting in Advantage Intelligence's queue.
 *
 * The vendor removes a job only while it is queued (`DELETE {jobs}/{id}`;
 * `409 JOB_NOT_REMOVABLE` once it is processing), so the vendor answers first
 * and our row follows: `markCancelled` (the `cancel_processing_job` RPC, which
 * flips the row to `cancelled` and releases its allowance) runs ONLY when the
 * vendor no longer holds the job — a 2xx, or a `404 JOB_NOT_FOUND` for a row we
 * still hold as `submitting|queued`. Flipping first would refund a job the
 * vendor then goes on to analyse. Never on a 409, 5xx or unreachable vendor.
 *
 * The 404 branch is what makes a repeat click recover: if a first cancel's
 * DELETE succeeded but every `markCancelled` attempt errored, the vendor has
 * dropped the job and will never call back, and the reconciler reads
 * `JOB_NOT_FOUND` as "no usable answer" and never moves the row — so without
 * it the row would sit `queued`, its reservation held, forever.
 *
 * Split from `route.ts` on the `rederive/handler.ts` pattern so
 * `tests/cancel-job-handler.spec.ts` can run the whole ladder against fakes.
 *
 * ORDER: signed in → a UUID → load the job → yours (same 404 for "missing" and
 * "not yours", never confirming another user's job) → still cancellable
 * (`submitting|queued`; with no vendor id yet, "still being handed off") →
 * vendor DELETE → mark cancelled (retried on a transport error).
 *
 * Refusals are `{ error, code, detail? }` through `errorResponse()`. Their
 * codes name outcomes of this route, not of the match-video domain whose union
 * `MatchVideoHttpError.code` is typed to, so {@link refusal} is the one place
 * that widens it — `errorResponse()` only reads the four fields.
 */

import type { NextResponse } from "next/server";

import { isUuid } from "@/lib/services/match-video/access";
import {
  errorResponse,
  jsonResponse,
  transportError,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";
import { pipelineLog } from "@/lib/services/splitstep/pipeline-log";

const LOG = "[splitstep-cancel-route]";

/** How long the vendor DELETE may take before it counts as unreachable. */
export const VENDOR_DELETE_TIMEOUT_MS = 10_000;

/** Statuses the vendor can still remove from its queue. */
const CANCELLABLE_STATUSES: ReadonlySet<string> = new Set([
  "submitting",
  "queued",
]);

/** Extra `markCancelled` tries after an errored first one, before giving up. */
export const MARK_CANCELLED_RETRIES = 2;

export const ALREADY_STARTED_MESSAGE =
  "It started a moment ago and can't be cancelled now.";
export const NOT_READY_MESSAGE =
  "It's still being handed off. Try again in a moment.";
export const VENDOR_UNAVAILABLE_MESSAGE =
  "Couldn't reach Advantage Intelligence. Try again.";

/** The columns of `processing_jobs` this decision reads. */
export interface CancelJobRow {
  id: string;
  created_by: string | null;
  status: string;
  external_job_id: string | null;
}

/**
 * What the vendor said to `DELETE {jobs}/{id}`, already read off the wire.
 * `code` is the vendor's `error.code` when the body carried one.
 */
export type VendorDeleteOutcome =
  | { kind: "removed" }
  | { kind: "refused"; status: number; code: string | null }
  | { kind: "unreachable"; reason: string };

export interface CancelJobDeps {
  /** The signed-in login from `auth.getUser()`, or null. */
  currentUserId(): Promise<string | null>;
  /** The job by id, through a client that can see every row. */
  loadJob(
    jobId: string,
  ): Promise<{ job: CancelJobRow | null; error: string | null }>;
  /** `DELETE {SPLITSTEP_API_URL}/{externalJobId}`, bounded by a timeout. */
  deleteAtVendor(externalJobId: string): Promise<VendorDeleteOutcome>;
  /**
   * `cancel_processing_job(jobId, userId)`. `status` is `'cancelled'` when the
   * row flipped, null when it had already moved on (or was not the user's).
   */
  markCancelled(
    jobId: string,
    userId: string,
  ): Promise<{ status: string | null; error: string | null }>;
}

type CancelErrorCode =
  | "unauthenticated"
  | "job_not_found"
  | "already_started"
  | "not_ready"
  | "not_cancellable"
  | "vendor_unavailable";

function refusal(
  code: CancelErrorCode,
  status: number,
  message: string,
  detail: string,
): NextResponse {
  return errorResponse({
    code,
    status,
    message,
    detail,
  } as unknown as MatchVideoHttpError);
}

const notFound = (detail: string) =>
  refusal("job_not_found", 404, "Job not found", detail);

const alreadyStarted = (detail: string) =>
  refusal("already_started", 409, ALREADY_STARTED_MESSAGE, detail);

const notReady = (detail: string) =>
  refusal("not_ready", 409, NOT_READY_MESSAGE, detail);

const vendorUnavailable = (detail: string) =>
  refusal("vendor_unavailable", 503, VENDOR_UNAVAILABLE_MESSAGE, detail);

const notCancellable = (detail: string) =>
  refusal(
    "not_cancellable",
    409,
    "This analysis can't be cancelled any more.",
    detail,
  );

/**
 * Read a vendor DELETE response into an outcome. The vendor's error envelope
 * is `{ job_id, error: { code, … } }`, sometimes nested one level down under
 * `detail` (FastAPI's `HTTPException(detail=…)`); a success body may be plain
 * text (`Removed job … from queue.`) or JSON and is never inspected.
 */
export function readVendorDelete(
  status: number,
  bodyText: string,
): VendorDeleteOutcome {
  if (status >= 200 && status < 300) return { kind: "removed" };
  return { kind: "refused", status, code: vendorErrorCode(bodyText) };
}

function vendorErrorCode(bodyText: string): string | null {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return null;
  }
  const codeOf = (value: unknown): string | null => {
    if (typeof value !== "object" || value === null) return null;
    const error = (value as { error?: unknown }).error;
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  };
  return (
    codeOf(body) ??
    (typeof body === "object" && body !== null
      ? codeOf((body as { detail?: unknown }).detail)
      : null)
  );
}

export async function handleCancelJob(
  jobId: string,
  deps: CancelJobDeps,
): Promise<NextResponse> {
  const userId = await deps.currentUserId();
  if (!userId) {
    return refusal(
      "unauthenticated",
      401,
      "Sign in to continue.",
      "no_session",
    );
  }

  // Not a UUID = no such job; same 404 as a missing or foreign one.
  if (!isUuid(jobId)) return notFound("job_id_not_uuid");

  const { job, error: loadError } = await deps.loadJob(jobId);
  if (loadError) {
    pipelineLog.error(`${LOG} job lookup failed`, { jobId, error: loadError });
    return errorResponse(transportError("internal_error", "job_lookup"));
  }
  if (!job || job.created_by !== userId) return notFound("job_not_visible");

  if (!CANCELLABLE_STATUSES.has(job.status)) {
    return alreadyStarted(`status_${job.status}`);
  }
  // `submitting` before the vendor's id lands: the hand-off is in flight, so
  // there is nothing to DELETE yet — but nothing has started either.
  if (!job.external_job_id) {
    return notReady(`status_${job.status}_no_vendor_id`);
  }

  const vendor = await deps.deleteAtVendor(job.external_job_id);

  if (vendor.kind === "unreachable") {
    pipelineLog.warn(`${LOG} vendor unreachable`, {
      jobId,
      reason: vendor.reason,
    });
    return vendorUnavailable(vendor.reason);
  }

  if (vendor.kind === "refused") {
    if (vendor.code === "JOB_NOT_REMOVABLE" || vendor.status === 409) {
      return alreadyStarted("vendor_job_not_removable");
    }
    if (vendor.code === "JOB_NOT_FOUND") {
      // The vendor holds no such job, yet our row (read above) is still
      // `submitting|queued`: no webhook has settled it, and none will for a
      // job the vendor dropped — typically a first cancel whose DELETE landed
      // but whose row flip failed. Cancelling our row is truthful and releases
      // the reservation. The RPC re-checks `submitting|queued`, so a row a
      // webhook moved on in the meantime answers null and stays as it is.
      pipelineLog.warn(`${LOG} vendor has no such job; settling our row`, {
        jobId,
        externalJobId: job.external_job_id,
      });
      return settle(jobId, userId, deps, "vendor_job_not_found");
    }
    if (vendor.status === 404) {
      // A 404 without the vendor's own code is not the vendor saying "no such
      // job" (a misrouted URL, a proxy) — never refund on it.
      pipelineLog.warn(`${LOG} vendor 404 without JOB_NOT_FOUND`, {
        jobId,
        externalJobId: job.external_job_id,
      });
      return notCancellable("vendor_404_no_code");
    }
    // 401 (our key), 503 STATUS_UNAVAILABLE, any other 4xx/5xx.
    pipelineLog.error(`${LOG} vendor refused the delete`, {
      jobId,
      status: vendor.status,
      code: vendor.code,
    });
    return vendorUnavailable(`vendor_status_${vendor.status}`);
  }

  return settle(jobId, userId, deps, "vendor_removed");
}

/**
 * Flip our row with `markCancelled`, once the vendor no longer holds the job.
 * A transport error is retried {@link MARK_CANCELLED_RETRIES} times: the
 * vendor will never call back about a job it dropped, so a flip that never
 * lands leaves the row `queued` with its reservation held until the athlete
 * clicks Cancel again (which then reaches the `JOB_NOT_FOUND` branch above).
 * A null status — the row moved on — is an answer, not an error, and is not
 * retried.
 */
async function settle(
  jobId: string,
  userId: string,
  deps: CancelJobDeps,
  via: "vendor_removed" | "vendor_job_not_found",
): Promise<NextResponse> {
  let marked = await deps.markCancelled(jobId, userId);
  for (let retry = 0; marked.error && retry < MARK_CANCELLED_RETRIES; retry++) {
    pipelineLog.warn(`${LOG} markCancelled failed; retrying`, {
      jobId,
      via,
      error: marked.error,
    });
    marked = await deps.markCancelled(jobId, userId);
  }
  if (marked.error) {
    // The vendor no longer holds the job, so it will never call back and the
    // reconciler will not settle the row. It stays `queued` until the athlete
    // clicks Cancel again: that DELETE answers JOB_NOT_FOUND, which settles.
    pipelineLog.error(
      `${LOG} vendor dropped the job but the row did not flip`,
      {
        jobId,
        via,
        error: marked.error,
      },
    );
    return errorResponse(transportError("internal_error", "mark_cancelled"));
  }
  if (marked.status !== "cancelled") {
    // Between our read and this write the row moved on (a webhook landed,
    // another tab cancelled). Nothing to release twice; report it as no
    // longer cancellable.
    pipelineLog.warn(`${LOG} row moved on before it could be cancelled`, {
      jobId,
      via,
      status: marked.status,
    });
    return notCancellable(`row_moved_on_${via}`);
  }

  pipelineLog.info(`${LOG} cancelled`, { jobId, via });
  return jsonResponse({ status: "cancelled" });
}
