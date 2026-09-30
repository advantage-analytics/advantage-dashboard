/**
 * The decision half of `POST /api/splitstep/jobs/[jobId]/cancel` — "Cancel
 * analysis" on a video that is still waiting in Advantage Intelligence's queue.
 *
 * The vendor removes a job only while it is queued (`DELETE {jobs}/{id}`;
 * `409 JOB_NOT_REMOVABLE` once it is processing), so the vendor answers first
 * and our row follows: `markCancelled` (the `cancel_processing_job` RPC, which
 * flips the row to `cancelled` and releases its allowance) runs ONLY after a
 * 2xx. Flipping first would refund a job the vendor then goes on to analyse.
 *
 * Split from `route.ts` on the `rederive/handler.ts` pattern so
 * `tests/cancel-job-handler.spec.ts` can run the whole ladder against fakes.
 *
 * ORDER: signed in → a UUID → load the job → yours (same 404 for "missing" and
 * "not yours", never confirming another user's job) → still cancellable
 * (`submitting|queued` with a vendor id) → vendor DELETE → mark cancelled.
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

export const ALREADY_STARTED_MESSAGE =
  "It started a moment ago and can't be cancelled now.";
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

  if (!CANCELLABLE_STATUSES.has(job.status) || !job.external_job_id) {
    return alreadyStarted(`status_${job.status}`);
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
    if (vendor.code === "JOB_NOT_FOUND" || vendor.status === 404) {
      // The vendor has no such job in its queue: it finished, failed, or was
      // removed elsewhere. The webhook or the reconciler settles our row.
      pipelineLog.warn(`${LOG} vendor has no such job`, {
        jobId,
        externalJobId: job.external_job_id,
      });
      return notCancellable("vendor_job_not_found");
    }
    // 401 (our key), 503 STATUS_UNAVAILABLE, any other 4xx/5xx.
    pipelineLog.error(`${LOG} vendor refused the delete`, {
      jobId,
      status: vendor.status,
      code: vendor.code,
    });
    return vendorUnavailable(`vendor_status_${vendor.status}`);
  }

  const marked = await deps.markCancelled(jobId, userId);
  if (marked.error) {
    // The vendor already dropped the job, so it will never call back; the row
    // stays queued until the reconciler finds JOB_NOT_FOUND and settles it.
    pipelineLog.error(
      `${LOG} vendor removed the job but the row did not flip`,
      {
        jobId,
        error: marked.error,
      },
    );
    return errorResponse(transportError("internal_error", "mark_cancelled"));
  }
  if (marked.status !== "cancelled") {
    // The vendor accepted the delete, but between our read and this write the
    // row moved on (a webhook landed, another tab cancelled). Nothing to
    // release twice; report it as no longer cancellable.
    pipelineLog.warn(`${LOG} row moved on before it could be cancelled`, {
      jobId,
      status: marked.status,
    });
    return notCancellable("row_moved_on");
  }

  pipelineLog.info(`${LOG} cancelled`, { jobId });
  return jsonResponse({ status: "cancelled" });
}
