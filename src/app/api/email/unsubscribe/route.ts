/**
 * `POST /api/email/unsubscribe?u=<user id>&t=<token>` — RFC 8058 one-click
 * unsubscribe, the target of the `List-Unsubscribe` header on the
 * getting-started emails. Gmail and Apple Mail POST here from their own
 * Unsubscribe button with the body `List-Unsubscribe=One-Click`.
 *
 * POST only. A GET is what a mail scanner sends, and it must not turn anyone's
 * mail off; the link people click in the footer goes to the
 * `/email/unsubscribe` page instead, which asks first.
 */

import {
  errorResponse,
  jsonResponse,
  transportError,
} from "@/lib/services/match-video/http";
import { applyUnsubscribe } from "@/lib/services/notifications/unsubscribe-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const outcome = await applyUnsubscribe(
    url.searchParams.get("u"),
    url.searchParams.get("t"),
  );
  if (outcome === "invalid") {
    return errorResponse(transportError("invalid_request", "unsubscribe_link"));
  }
  if (outcome === "failed") {
    return errorResponse(
      transportError("internal_error", "unsubscribe_write_failed"),
    );
  }
  return jsonResponse({ ok: true });
}
