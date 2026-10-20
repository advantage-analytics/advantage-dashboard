import { NextRequest } from "next/server";

import {
  errorResponse,
  jsonResponse,
  transportError,
} from "@/lib/services/match-video/http";
import {
  applyPlaybackReport,
  parsePlaybackReport,
  verifyPlaybackSignature,
} from "@/lib/services/match-video/playback-copy";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A report is a few hundred bytes; anything near this is not one. */
const BODY_MAX_BYTES = 4096;

/**
 * The Azure playback worker's reports (`workers/playback/run.sh`):
 * `processing`, then `ready` with the copy's key, or `failed` after its last
 * attempt. Signed with `PLAYBACK_CALLBACK_SECRET`; written onto every job
 * that plays the upload (`playback-copy.ts`). Under `api/webhooks` so the
 * session proxy skips it — the caller is a machine, not a browser.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PLAYBACK_CALLBACK_SECRET;
  if (!secret) {
    return errorResponse({
      ...transportError("internal_error", "not_configured"),
      status: 503,
    });
  }
  const body = await request.text();
  if (body.length > BODY_MAX_BYTES) {
    return errorResponse(transportError("request_too_large", "report_size"));
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
  const report = parsePlaybackReport(parsed);
  if (!report) {
    return errorResponse(transportError("invalid_request", "not_a_report"));
  }

  const jobs = await applyPlaybackReport(createAdminClient(), report);
  return jsonResponse({ ok: true, jobs });
}
