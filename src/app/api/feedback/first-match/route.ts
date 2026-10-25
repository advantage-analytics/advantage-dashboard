/**
 * `POST /api/feedback/first-match` — the signed-in player's answer to the
 * first-match feedback prompt: a 1–5 rating and an optional note.
 *
 *   403 cross_origin     not a request from a page this app served
 *   401 unauthenticated  no session
 *   413 / 400            an over-long or malformed body
 *                        (`readFirstMatchFeedbackRequest()`)
 *   500 internal_error   the write failed
 *   204                  saved — or already answered, in which case the
 *                        first answer stands and the prompt is stamped done
 *
 * Runs entirely as the signed-in user: `submit_product_feedback()` takes the
 * player from `auth.uid()` and stamps `users.first_match_feedback_done_at`
 * in the same transaction as the row, so nothing here uses the service role
 * and nothing is left half-done.
 */

import {
  FIRST_MATCH_FEEDBACK_PROMPT,
  readFirstMatchFeedbackRequest,
} from "@/lib/feedback/first-match-feedback";
import {
  checkSameOrigin,
  errorResponse,
  readBoundedJson,
  transportError,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** As `/api/ask/feedback` does it: `errorResponse()` is typed to the match-video codes. */
function refusal(
  code: "unauthenticated",
  status: number,
  message: string,
  detail: string,
): MatchVideoHttpError {
  return { code, status, message, detail } as unknown as MatchVideoHttpError;
}

function saved(): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const origin = checkSameOrigin(request, [siteUrl()]);
  if (origin) return errorResponse(origin);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return errorResponse(
      refusal(
        "unauthenticated",
        401,
        "Sign in to send feedback.",
        "no_session",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = readFirstMatchFeedbackRequest(raw.value);
  if (!parsed.ok) {
    return errorResponse({
      ...transportError("invalid_request", "feedback_body"),
      message: parsed.error,
    });
  }
  const body = parsed.value;

  // The context the answer is read with later: when the first report was
  // seen and how long after it this came. Own row, RLS-scoped; a failed read
  // costs the context, never the answer.
  const { data: row } = await supabase
    .from("users")
    .select("first_report_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  const seenAt: string | null = row?.first_report_seen_at ?? null;
  const seenMs = seenAt ? Date.parse(seenAt) : NaN;
  const context = {
    first_report_seen_at: seenAt,
    hours_since_first_report: Number.isFinite(seenMs)
      ? Math.round((Date.now() - seenMs) / 36e5)
      : null,
    last_sign_in_at: user.last_sign_in_at ?? null,
  };

  const { error } = await supabase.rpc("submit_product_feedback", {
    p_prompt: FIRST_MATCH_FEEDBACK_PROMPT,
    p_rating: body.rating,
    p_note: body.note,
    p_context: context,
  });
  if (error) {
    if (error.code === "23505") {
      // Already answered: the first answer stands. The function stamps the
      // column only on a successful insert, so make sure it is stamped here
      // too and the prompt is not asked again.
      await supabase
        .from("users")
        .update({ first_match_feedback_done_at: new Date().toISOString() })
        .eq("id", user.id)
        .is("first_match_feedback_done_at", null);
      return saved();
    }
    console.error("[feedback] could not save first-match feedback", {
      sqlstate: error.code,
    });
    return errorResponse(transportError("internal_error", "feedback_write"));
  }

  return saved();
}
