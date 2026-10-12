/**
 * `POST /api/ask` — one question about the signed-in player's own matches,
 * or, with `programId`, about the matches of a program they are a member of,
 * answered as a stream (design "Route", "Error handling"; plan step 7).
 *
 * The HTTP shell around `src/lib/services/ask/ask.ts`. Everything that can be
 * refused is refused here, as JSON through `errorResponse()`, BEFORE the
 * stream opens; once it is open the answer is `200 application/x-ndjson` and
 * a failure is an `error` event inside it (`events.ts`).
 *
 * The ladder, in order — each rung answers before the next one reads anything:
 *
 *   403 cross_origin            not a request from a page this app served
 *   401 unauthenticated         no session
 *   413 request_too_large       a body over 4096 bytes
 *   400 invalid_request         not a JSON object, an unknown key, an empty or
 *                               over-long question, malformed or too many
 *                               tags, a `programId` that is not a uuid, a tag
 *                               that is not in scope
 *   403 not_a_member            `programId` is not a program the viewer
 *                               belongs to (before anything of it is read)
 *   404 conversation_not_found  `conversationId` is not the viewer's, or was
 *                               asked in the other workspace
 *   409 no_matches              the scope has no match
 *   429 ask_limit_reached       `ask_reserve_question()` refused
 *   500 internal_error          the matches could not be read, the
 *                               reservation failed, the stream did not open
 *
 * Same origin before the session, as every other mutation here does it
 * (`uploads.ts`, the cancel route): a cross-site caller learns nothing about
 * whether a session exists.
 *
 * Nothing from the browser is trusted beyond the question's own words. A tag
 * is `{ kind, id }` and is re-resolved against the viewer's matches
 * (`resolveAskTags()`); the conversation is re-read through RLS; and the 429
 * is `ask_reserve_question()`'s own refusal — no count is read and compared
 * here. Every database call rides the cookie-authenticated client; the
 * service-role client is never built.
 *
 * A team question (`programId`) is the same ladder over the program's rows.
 * Membership is `getWorkspaceContext()`'s answer — the id must be one of the
 * viewer's team workspaces — and it is asked here even though the database
 * asks again (`ask.my_match_ids()` returns a non-member nothing): the route
 * says 403 rather than "no matches". Any member may ask, whatever their role.
 * It spends the asker's own monthly questions; there is no program quota.
 *
 * `no_matches` is decided from `getAskTagOptions()` — the scope's matches,
 * the rows `ask.matches` holds and the same emptiness the page reads as day
 * zero. Whether a match has statistics yet is not asked here: a
 * question about one that has none ends as a `no_data` event, which costs
 * nothing.
 */

import {
  createLLMObservabilityContext,
  getLLMStream,
  isLLMConfigured,
} from "@/lib/llm/adapter";
import { ndjsonStreamResponse } from "@/lib/llm/stream-response";
import { isUuid } from "@/lib/admin/validation";
import {
  getAskConversation,
  getAskQuota,
  getAskTagOptions,
  type AskTagOptions,
} from "@/lib/data/ask-server";
import {
  askQuestion,
  conversationTurnsFromMessages,
  previousPlanFromMessages,
  reserveAskQuestion,
  type AskDatabase,
  type AskModel,
} from "@/lib/services/ask/ask";
import {
  MAX_ASK_QUESTION_LENGTH,
  type AskEvent,
} from "@/lib/services/ask/events";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import {
  ASK_TAG_KINDS,
  MAX_ASK_TAGS,
  resolveAskTags,
  type AskTagKind,
  type AskTagRequest,
} from "@/lib/services/ask/tags";
import {
  checkSameOrigin,
  errorResponse,
  isPlainObject,
  readBoundedJson,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/** The codes this route adds to the transport ones in `http.ts`. */
type AskRefusalCode =
  | "unauthenticated"
  | "not_a_member"
  | "conversation_not_found"
  | "no_matches"
  | "ask_limit_reached";

/**
 * `errorResponse()`'s input is typed to the match-video union; the cancel
 * route casts for its own codes the same way. The body shape is what the
 * helper owns, and that is identical.
 */
function refusal(
  code: AskRefusalCode,
  status: number,
  message: string,
  detail: string,
): MatchVideoHttpError {
  return { code, status, message, detail } as unknown as MatchVideoHttpError;
}

/** A 400, with its own sentence where the composer has something to say. */
function invalidError(detail: string, message?: string): MatchVideoHttpError {
  const error = transportError("invalid_request", detail);
  return message ? { ...error, message } : error;
}

function invalid(detail: string, message?: string): HttpResult<never> {
  return { ok: false, error: invalidError(detail, message) };
}

const QUESTION_EMPTY_MESSAGE = "Type a question first.";
const QUESTION_TOO_LONG_MESSAGE = `That question is too long. Keep it under ${MAX_ASK_QUESTION_LENGTH} characters.`;
const TOO_MANY_TAGS_MESSAGE = `A question can carry at most ${MAX_ASK_TAGS} tags.`;

/* -------------------------------------------------------------------------
 * Body
 * ---------------------------------------------------------------------- */

interface AskBody {
  question: string;
  tags: AskTagRequest[];
  conversationId: string | null;
  /** The program a team question is about; null for a personal one. */
  programId: string | null;
}

const BODY_KEYS: ReadonlySet<string> = new Set([
  "conversationId",
  "programId",
  "question",
  "tags",
]);

/**
 * `{ conversationId?, programId?, question, tags? }`. Unknown keys are refused by name,
 * as every mutation body in this app is: a client that starts sending a
 * field learns on its first request that it has no effect. Keys beyond
 * `kind` and `id` on a TAG are dropped instead — a label sent with one is
 * never read (`tags.ts`), and the composer's own tag objects carry one.
 */
function parseAskBody(value: unknown): HttpResult<AskBody> {
  if (!isPlainObject(value)) return invalid("body_type");
  for (const key of Object.keys(value)) {
    if (!BODY_KEYS.has(key)) return invalid(`unexpected_field:${key}`);
  }

  if (typeof value.question !== "string") return invalid("question_type");
  const question = value.question.trim();
  if (question === "") return invalid("question_empty", QUESTION_EMPTY_MESSAGE);
  if (question.length > MAX_ASK_QUESTION_LENGTH) {
    return invalid("question_too_long", QUESTION_TOO_LONG_MESSAGE);
  }

  const rawTags = value.tags ?? [];
  if (!Array.isArray(rawTags)) return invalid("tags_type");
  if (rawTags.length > MAX_ASK_TAGS) {
    return invalid("too_many_tags", TOO_MANY_TAGS_MESSAGE);
  }
  const tags: AskTagRequest[] = [];
  for (const tag of rawTags as unknown[]) {
    if (
      !isPlainObject(tag) ||
      !ASK_TAG_KINDS.includes(tag.kind as AskTagKind) ||
      typeof tag.id !== "string" ||
      tag.id.trim() === ""
    ) {
      return invalid("tag_shape");
    }
    tags.push({ kind: tag.kind as AskTagKind, id: tag.id });
  }

  const rawConversation = value.conversationId ?? null;
  if (rawConversation !== null && typeof rawConversation !== "string") {
    return invalid("conversation_id_type");
  }

  // Null and absent are both "a personal question". Anything else must be a
  // uuid: it is about to be compared with the viewer's workspaces and handed
  // to Postgres as one.
  const rawProgram = value.programId ?? null;
  if (rawProgram !== null && !isUuid(rawProgram)) {
    return invalid("program_id_type");
  }

  return {
    ok: true,
    value: {
      question,
      tags,
      conversationId: rawConversation,
      programId: rawProgram,
    },
  };
}

/* -------------------------------------------------------------------------
 * The limit
 * ---------------------------------------------------------------------- */

/**
 * The 429. Reached only from `ask_reserve_question()`'s refusal. `detail` is
 * the count the page's meter shows, so it goes out as `clientDetail` and
 * survives production; when the function's message did not carry it, the
 * meter's own read (`ask_quota()`) supplies it, and failing that the refusal
 * goes without.
 */
async function limitReached(
  detail: { used: number; cap: number; resets_on: string } | null,
) {
  let figures = detail;
  if (!figures) {
    const quota = await getAskQuota().catch(() => null);
    figures = quota
      ? { used: quota.used, cap: quota.cap, resets_on: quota.resetsOn }
      : null;
  }
  return errorResponse(
    refusal(
      "ask_limit_reached",
      429,
      figures
        ? `You have used all ${figures.cap} questions for this month.`
        : "You have used all of this month's questions.",
      "month_spent",
    ),
    figures ?? undefined,
  );
}

/* -------------------------------------------------------------------------
 * The stream
 * ---------------------------------------------------------------------- */

/**
 * Make a generator that will never be read give its reservation back.
 * `askQuestion()` releases in its own `finally`, and a `finally` only runs
 * for a generator that has started — `.return()` on a fresh one ends it
 * without entering the body. So: one step in (its first event is a status
 * line, with no side effect before it), then out.
 */
async function abandon(events: AsyncGenerator<AskEvent, void, undefined>) {
  try {
    await events.next();
    await events.return();
  } catch (error) {
    console.error("[ask] could not abandon an unopened answer", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

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
        "Sign in to ask a question.",
        "no_session",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = parseAskBody(raw.value);
  if (!parsed.ok) return errorResponse(parsed.error);
  const body = parsed.value;

  // The scope. A program id from the browser names a workspace; whether the
  // viewer is in it is read here, before a row of the program is.
  let scope: AskScope = PERSONAL_ASK_SCOPE;
  if (body.programId !== null) {
    const workspaces = await getWorkspaceContext().catch(() => null);
    const program = workspaces?.available.find(
      (workspace) =>
        workspace.kind === "team" && workspace.id === body.programId,
    );
    if (!program) {
      return errorResponse(
        refusal(
          "not_a_member",
          403,
          "You are not a member of this program.",
          "program_not_available",
        ),
      );
    }
    scope = {
      kind: "team",
      programId: program.id,
      programName: program.name,
    };
  }
  const team = scope.kind === "team";

  // Server-derived, for this viewer — never the browser's word for it.
  let options: AskTagOptions;
  try {
    options = await getAskTagOptions(body.programId);
  } catch (error) {
    console.error("[ask] could not read the viewer's matches", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(transportError("internal_error", "matches_read"));
  }

  const resolved = resolveAskTags(body.tags, options, scope);
  if (!resolved.ok) {
    return errorResponse(invalidError("tag_not_resolved", resolved.reason));
  }

  // Null for an id that is malformed, unknown, someone else's or from the
  // other workspace — all the same answer, so the field cannot be used to
  // probe.
  const conversation = body.conversationId
    ? await getAskConversation(body.conversationId, body.programId)
    : null;
  if (body.conversationId && !conversation) {
    return errorResponse(
      refusal(
        "conversation_not_found",
        404,
        "This conversation is not available.",
        "not_visible",
      ),
    );
  }

  if (options.matches.length === 0) {
    return errorResponse(
      refusal(
        "no_matches",
        409,
        team
          ? "Add a team match before you ask a question."
          : "Add a match before you ask a question.",
        team ? "no_program_match" : "no_personal_match",
      ),
    );
  }

  const db: AskDatabase = {
    rpc: (fn, args) => supabase.rpc(fn, args),
  };
  const model: AskModel = {
    configured: isLLMConfigured(),
    stream: (systemPrompt, messages) =>
      getLLMStream(
        systemPrompt,
        messages,
        createLLMObservabilityContext(user.id),
      ),
  };

  // Everything that could refuse has. From here a question is spent (unless
  // this is mock mode, which spends nothing), so the only statements left
  // are the two that hand the reservation to the generator that owns it.
  const reserved = await reserveAskQuestion(db, model);
  if (!reserved.ok) {
    if (reserved.code === "ask_limit_reached") {
      return limitReached(reserved.detail);
    }
    console.error("[ask] could not reserve a question", {
      error: reserved.message,
    });
    return errorResponse(transportError("internal_error", "reserve_failed"));
  }

  const events = askQuestion({
    db,
    model,
    now: () => new Date(),
    question: body.question,
    tags: resolved.tags,
    conversation: conversation
      ? conversationTurnsFromMessages(conversation.messages)
      : [],
    previousPlan: conversation
      ? previousPlanFromMessages(conversation.messages)
      : null,
    conversationId: conversation?.id ?? null,
    reservation: reserved.reservation,
    scope,
  });

  try {
    const response = ndjsonStreamResponse(events);
    // Per-caller, like every refusal above.
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[ask] could not open the answer stream", {
      error: error instanceof Error ? error.message : String(error),
    });
    await abandon(events);
    return errorResponse(transportError("internal_error", "stream_open"));
  }
}
