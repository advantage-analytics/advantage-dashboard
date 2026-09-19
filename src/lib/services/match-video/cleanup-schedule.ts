/**
 * Plan step 9, schedule half — the gate in front of the cleanup worker.
 *
 * `vercel.json` calls `/api/cron/cleanup-match-videos` once a day at 05:00
 * UTC with `Authorization: Bearer $CRON_SECRET`. That path carries no session
 * cookie (it is excluded from `src/proxy.ts`'s matcher on purpose), so this
 * bearer check is the ONLY thing standing between the open internet and a
 * service-role worker that deletes blobs. Three rules follow from that:
 *
 *   1. The check runs FIRST. `deps.runCleanup` is not called, and the route
 *      does not even build the admin client, until the secret has matched.
 *      `tests/match-video-cleanup.spec.ts` asserts the worker was never
 *      invoked for every refusal, not merely that the status was 401.
 *   2. It fails CLOSED. An unset, blank or whitespace-only `CRON_SECRET`
 *      refuses every request — including one presenting an empty bearer —
 *      rather than turning the endpoint into an open sweep trigger. The
 *      misconfiguration is logged loudly, by name only.
 *   3. Nothing about the secret leaves the process. The comparison is over
 *      SHA-256 digests, so it is constant time AND equal length whatever was
 *      presented (a raw `timingSafeEqual` throws on a length mismatch, which
 *      is itself a length oracle). No branch, log line or response body ever
 *      carries the configured or presented value.
 *
 * The handler owns the decision; `route.ts` is the wiring that hands it the
 * service-role client and the real worker. Next reserves a route file's
 * exports for handler names, which is why this is a sibling module — the same
 * split every `/api/matches/[matchId]/video/*` route uses.
 *
 * SERVER ONLY. Listed in `tests/client-bundle-boundary.spec.ts`.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import type { CleanupRunSummary } from "./cleanup";
import { jsonResponse } from "./http";

const LOG = "[match-video-cleanup-cron]";

/** The scheduled path. `vercel.json` and the tests read it from here. */
export const CLEANUP_CRON_PATH = "/api/cron/cleanup-match-videos";

/** The `reason` every scheduled sweep is logged under. */
export const CLEANUP_CRON_REASON = "cron";

/* -------------------------------------------------------------------------
 * Authorization
 * ---------------------------------------------------------------------- */

/** Why a request was refused. A slug for the log — never rendered. */
export type CronRefusal =
  | "secret_not_configured"
  | "no_authorization_header"
  | "not_bearer"
  | "empty_credential"
  | "credential_mismatch";

export type CronAuthOutcome =
  { ok: true } | { ok: false; refusal: CronRefusal };

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * `Authorization: Bearer <CRON_SECRET>`, and nothing else.
 *
 * The scheme is matched case-insensitively (HTTP says it is), but the shape
 * is exact: Vercel Cron always sends a bearer, so a bare secret in the header
 * is not a caller we have to accommodate, and accepting one would widen the
 * surface for no user.
 */
export function authorizeCronRequest(
  request: Request,
  secret: string | undefined,
): CronAuthOutcome {
  // Fail closed BEFORE looking at the request: with no secret configured
  // there is no credential that could be correct, so there is nothing to
  // compare and no reason to let the request reach anything.
  const configured = secret?.trim() ?? "";
  if (configured === "") return { ok: false, refusal: "secret_not_configured" };

  const header = request.headers.get("authorization");
  if (!header) return { ok: false, refusal: "no_authorization_header" };

  const match = /^Bearer(?:[ \t]+(.*))?$/i.exec(header.trim());
  if (!match) return { ok: false, refusal: "not_bearer" };

  const presented = (match[1] ?? "").trim();
  if (presented === "") return { ok: false, refusal: "empty_credential" };

  // Digests, not the values: equal length whatever was presented, so neither
  // the length nor any prefix of the secret is observable through timing.
  return timingSafeEqual(sha256(presented), sha256(configured))
    ? { ok: true }
    : { ok: false, refusal: "credential_mismatch" };
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

export interface CleanupCronDeps {
  /**
   * The sweep. Injected so a refused request can be PROVEN never to reach the
   * worker, the database or storage — the spec counts invocations of this.
   */
  runCleanup: () => Promise<CleanupRunSummary>;
  /** Test seam. Production reads `process.env.CRON_SECRET`. */
  readSecret?: () => string | undefined;
}

/** What an authorized run reports back. Counts only; no keys, no ids. */
export interface CleanupCronBody {
  ok: boolean;
  reason: string;
  claimed: number;
  outcomes: CleanupRunSummary["outcomes"];
  /**
   * Rows whose settle was refused by the database itself (T14 maps a SQLSTATE
   * to `rpc_<code>`), counted apart from storage failures. `rpc_P0002` — an
   * attachment that vanished between claim and settle — is the one worth
   * watching: it is retryable, so it is invisible in the outcome counts.
   */
  rpcFailures: number;
  durationMs: number;
}

/**
 * Authorize, then sweep.
 *
 * Statuses: 401 for any refusal (one body for all of them — which rule was
 * broken is a server-side log line, not something to hand an attacker), 500
 * when the worker rejects or the claim itself failed, 200 otherwise. A 200
 * can still report rows that failed and were backed off; that is the worker
 * working, not the schedule failing.
 */
export async function handleCleanupCron(
  request: Request,
  deps: CleanupCronDeps,
): Promise<Response> {
  const readSecret = deps.readSecret ?? (() => process.env.CRON_SECRET);
  const auth = authorizeCronRequest(request, readSecret());

  if (!auth.ok) {
    if (auth.refusal === "secret_not_configured") {
      console.error(
        `${LOG} CRON_SECRET is not set — refusing every call to ` +
          `${CLEANUP_CRON_PATH}. Set it in Vercel or abandoned uploads are ` +
          `never collected.`,
      );
    } else {
      console.warn(`${LOG} refused`, { refusal: auth.refusal });
    }
    // Deliberately uniform, and deliberately empty of detail: no echo of what
    // was presented, no hint of what was expected.
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const startedAt = Date.now();
  let summary: CleanupRunSummary;
  try {
    summary = await deps.runCleanup();
  } catch (cause) {
    // `runMatchVideoCleanup` throws only for a failure outside any row, which
    // is this route's own 500 — nothing was half-collected, and every leased
    // row's lease simply expires.
    console.error(`${LOG} sweep threw`, {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return jsonResponse({ ok: false, error: "cleanup_failed" }, 500);
  }

  const body: CleanupCronBody = {
    ok: summary.claimError === undefined,
    reason: CLEANUP_CRON_REASON,
    claimed: summary.claimed,
    outcomes: summary.outcomes,
    rpcFailures: summary.rows.filter((row) => row.detail?.startsWith("rpc_"))
      .length,
    durationMs: Date.now() - startedAt,
  };

  if (summary.claimError) {
    // Ran, but the database refused to hand out a batch. Answering non-2xx is
    // what puts it in Vercel's failed-cron list instead of a silent no-op.
    console.error(`${LOG} claim refused`, {
      code: summary.claimError.code,
      detail: summary.claimError.detail,
    });
    return jsonResponse({ ...body, error: "claim_failed" }, 500);
  }

  return jsonResponse(body, 200);
}
