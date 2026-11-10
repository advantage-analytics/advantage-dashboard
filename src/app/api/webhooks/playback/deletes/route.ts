import { NextRequest } from "next/server";

import {
  errorResponse,
  jsonResponse,
  transportError,
} from "@/lib/services/match-video/http";
import { verifyPlaybackSignature } from "@/lib/services/match-video/playback-copy";
import {
  claimR2Deletes,
  confirmR2Deletes,
  parseDrainRequest,
} from "@/lib/services/video-storage/delete-queue";
import {
  r2ObjectExists,
  resolveR2Config,
} from "@/lib/services/video-storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 64 * 1024;
const CLAIM_MAX = 50;

/**
 * The R2 delete queue, for the playback worker (`workers/playback/run.sh`),
 * which holds the R2 WRITE token the app deliberately does not.
 *
 *   {"action":"claim","ts":…}               → {"keys":[…]}  up to 50 playback keys
 *   {"action":"done","keys":[…],"ts":…}     → {"removed":n,"remaining":n}
 *
 * Signed like the playback reports: HMAC-SHA256 of the raw body with
 * `PLAYBACK_CALLBACK_SECRET`, hex, in `x-playback-signature`. `ts` (epoch
 * ms) must be within ten minutes of now, so a captured request cannot be
 * replayed later. Within that window a replay is harmless: a claim is
 * read-only, and `done` removes a row only once a HEAD with the app's read
 * token confirms the object is gone — the worker's word alone deletes
 * nothing. Under `api/webhooks` so the session proxy skips it.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PLAYBACK_CALLBACK_SECRET;
  if (!secret || !resolveR2Config("read").ok) {
    return errorResponse({
      ...transportError("internal_error", "not_configured"),
      status: 503,
    });
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > BODY_MAX_BYTES) {
    return errorResponse(transportError("request_too_large", "body_size"));
  }
  if (
    !verifyPlaybackSignature(
      body,
      request.headers.get("x-playback-signature"),
      secret,
    )
  ) {
    return errorResponse({
      ...transportError("invalid_request", "bad_signature"),
      status: 401,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(transportError("invalid_request", "not_json"));
  }
  const drain = parseDrainRequest(parsed, Date.now(), CLAIM_MAX);
  if (!drain) {
    return errorResponse(transportError("invalid_request", "not_an_action"));
  }

  const db = createAdminClient();
  try {
    if (drain.action === "claim") {
      return jsonResponse({ keys: await claimR2Deletes(db, CLAIM_MAX) });
    }
    return jsonResponse(await confirmR2Deletes(db, drain.keys, r2ObjectExists));
  } catch (cause) {
    console.error("[r2-delete-queue] drain request failed", {
      action: drain.action,
      message: (cause as Error)?.message,
    });
    return errorResponse(transportError("internal_error", "queue_unavailable"));
  }
}
