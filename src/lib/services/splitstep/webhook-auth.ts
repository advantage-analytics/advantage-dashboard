/**
 * Authentication for the SplitStep results webhook.
 *
 * Pure: reads the request, the raw body and `process.env`, writes nothing.
 * Split out of the route so the accept/refuse decision can be pinned by an
 * offline spec (tests/splitstep-webhook-auth.spec.ts) without a database.
 */

import type { NextRequest } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { pipelineLog } from "@/lib/services/splitstep/pipeline-log";

const LOG = "[splitstep-webhook]";

/**
 * Headers the signature might arrive in.
 *
 * `x-hmac-signature` is the vendor's answer, given by email and since added to
 * their published docs, so it leads. The rest stay for two reasons. They are
 * still a cheap hedge should the vendor ever move the header — the log below
 * prints the full header set whenever none of these match. And this list is
 * also the redaction set for the route's safeHeaders(): dropping
 * `authorization` or `x-api-key` from it would start writing credential values
 * into the delivery row, which is a worse outcome than carrying a few dead
 * candidates.
 */
export const SIGNATURE_HEADERS = [
  "x-hmac-signature",
  "x-splitstep-signature",
  "x-webhook-signature",
  "x-signature",
  "x-signature-256",
  "x-hub-signature-256",
  "signature",
  "x-webhook-secret",
  "x-api-key",
  "authorization",
] as const;

export type AuthOutcome = {
  /** Whether to process this delivery at all. */
  ok: boolean;
  /** Recorded on the row. True only for a real HMAC match. */
  verified: boolean;
  /** For the log; never includes the signature or the secret. */
  reason: string;
};

/**
 * Verify a delivery against the documented scheme:
 * base64(HMAC-SHA256(secret, raw_body)), compared to a signature header.
 *
 *   digest = hmac.new(secret, raw_body, sha256).digest()
 *   expected = base64.b64encode(digest)
 *
 * ── Why a missing signature is refused once the secret is set ────────────────
 * Every live delivery since the first (2026-08) has verified via
 * `x-hmac-signature`, so the header name is no longer in question and a
 * delivery without one is not the vendor. With SPLITSTEP_WEBHOOK_SECRET set the
 * endpoint therefore fails closed: a signature that is present and WRONG is
 * refused, and so is a signature we cannot find. The refusal is logged with the
 * full header set, which is what would identify a renamed header.
 *
 * The vendor has NO retry policy and a 30s connection timeout, so a refused
 * delivery is gone for good. SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true is the
 * explicit escape hatch for a pilot against a vendor build that has not signed
 * yet: it accepts the delivery, recorded `signature_verified = false`. It is
 * never the default, and nothing else reopens the endpoint.
 *
 * With no secret at all the endpoint is open and says so on every delivery.
 * SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE is no longer read.
 */
export function verifyWebhookAuth(
  request: NextRequest,
  rawBody: string,
): AuthOutcome {
  const secret = process.env.SPLITSTEP_WEBHOOK_SECRET;

  if (!secret) {
    pipelineLog.warn(
      `${LOG} UNSIGNED — SPLITSTEP_WEBHOOK_SECRET is not set. Accepting without ` +
        `authentication. This must not remain true once real match video is processed.`,
    );
    return { ok: true, verified: false, reason: "no secret configured" };
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  // Equal-length compare via digests, so nothing leaks through timing or length.
  const matches = (presented: string, against: string) =>
    timingSafeEqual(
      createHash("sha256").update(presented).digest(),
      createHash("sha256").update(against).digest(),
    );

  let sawCandidate = false;

  for (const header of SIGNATURE_HEADERS) {
    const raw = request.headers.get(header);
    if (!raw) continue;
    sawCandidate = true;

    const presented =
      header === "authorization" ? raw.replace(/^Bearer\s+/i, "") : raw.trim();

    if (matches(presented, expected)) {
      return {
        ok: true,
        verified: true,
        reason: `HMAC verified via ${header}`,
      };
    }

    // Tolerated, not trusted: some senders put the shared secret itself in the
    // header rather than a signature over the body. It proves they hold the
    // secret, which is worth accepting, but it is not a signature — it says
    // nothing about whether the body was modified in transit.
    if (matches(presented, secret)) {
      pipelineLog.warn(
        `${LOG} ${header} carried the raw shared secret, not an HMAC of the body. ` +
          `Accepted, but recorded unverified — ask the vendor to send ` +
          `base64(HMAC-SHA256(secret, raw_body)).`,
      );
      return { ok: true, verified: false, reason: `raw secret via ${header}` };
    }
  }

  if (sawCandidate) {
    // A signature was presented and it did not match. That is a real failure,
    // not an unknown-header problem.
    return {
      ok: false,
      verified: false,
      reason: "signature present but did not match",
    };
  }

  const allowUnsigned = process.env.SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED === "true";

  pipelineLog.warn(
    `${LOG} no signature header found${allowUnsigned ? " — accepting unverified (SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED)" : " — REJECTING"}`,
    {
      searched: SIGNATURE_HEADERS,
      // The header NAMES are what identify the right one. Values are redacted
      // by safeHeaders() before anything is stored or logged.
      received: [...request.headers.keys()],
    },
  );

  return {
    ok: allowUnsigned,
    verified: false,
    reason: "no signature header found",
  };
}
