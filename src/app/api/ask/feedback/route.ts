/**
 * `POST /api/ask/feedback` — the signed-in player's thumbs up or down on one
 * of their own Ask answers, or (`rating: null`) taking it back.
 *
 *   403 cross_origin     not a request from a page this app served
 *   401 unauthenticated  no session
 *   413 / 400            an over-long or malformed body
 *                        (`readAskFeedbackRequest()`)
 *   404 not_found        the answer is not the viewer's, or is not an answer
 *   500 internal_error   the write failed
 *   204                  saved
 *
 * Runs entirely as the signed-in user: `ask_set_feedback()` checks the answer
 * is theirs with `auth.uid()`, so nothing here uses the service role.
 *
 * A thumbs up is also a (question → plan) pair worth learning from (roadmap
 * 1.6, `examples.ts`): after the 204 is sent it is read back, embedded and
 * stored as the viewer's own example — as the user, best effort, and never a
 * reason the rating fails. A thumb taken back or turned down removes the
 * example in the database (`ask_examples_follow_feedback`).
 */

import { after } from "next/server";
import { embedText } from "@/lib/llm/embeddings";
import { addAskFeedbackExample } from "@/lib/services/ask/examples";
import { readAskFeedbackRequest } from "@/lib/services/ask/feedback";
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

/** As `/api/ask` does it: `errorResponse()` is typed to the match-video codes. */
function refusal(
  code: "unauthenticated" | "not_found",
  status: number,
  message: string,
  detail: string,
): MatchVideoHttpError {
  return { code, status, message, detail } as unknown as MatchVideoHttpError;
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
        "Sign in to rate an answer.",
        "no_session",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = readAskFeedbackRequest(raw.value);
  if (!parsed.ok) {
    return errorResponse({
      ...transportError("invalid_request", "feedback_body"),
      message: parsed.error,
    });
  }
  const body = parsed.value;

  const { error } = await supabase.rpc("ask_set_feedback", {
    p_message_id: body.answerId,
    p_rating: body.rating,
    p_reasons: body.reasons,
    p_note: body.note,
  });
  if (error) {
    // 42501: not the caller's answer, or no answer at all — the same 404 for
    // both, so an id cannot be used to probe.
    if (error.code === "42501") {
      return errorResponse(
        refusal("not_found", 404, "That answer was not found.", "not_yours"),
      );
    }
    console.error("[ask] could not save feedback", { sqlstate: error.code });
    return errorResponse(transportError("internal_error", "feedback_write"));
  }

  if (body.rating === "up") {
    const learn = () =>
      addAskFeedbackExample({
        user: { rpc: (fn, args) => supabase.rpc(fn, args) },
        messageId: body.answerId,
        embed: (text) => embedText(text),
      });
    try {
      after(learn);
    } catch {
      // Outside a request context (a script): run it now, unawaited.
      void learn();
    }
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
