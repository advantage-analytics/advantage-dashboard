import { after } from "next/server";
import { PostHog } from "posthog-node";
import { randomUUID } from "node:crypto";
import { getPostHogServerConfig } from "@/lib/posthog-logs";
import type OpenAI from "openai";

/**
 * LLM Adapter — provider-switching stream module.
 *
 * Switch providers by setting LLM_PROVIDER in .env.local:
 *   LLM_PROVIDER=anthropic   (requires ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=openai      (requires OPENAI_API_KEY — a Google AI key: the
 *                             OpenAI SDK pointed at Gemini's OpenAI-compatible
 *                             endpoint; production runs this)
 *
 * If no provider/key is set the adapter emits a mock stream so the UI
 * remains testable in local dev without credentials.
 *
 * Every real call is one `$ai_generation` event in PostHog LLM analytics,
 * named by `LLMCallOptions.span` so the stages of one Ask question and the
 * insight cards can be told apart, with tokens and cost from the provider's
 * usage report (`docs/llm-setup.md` §7).
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface LLMObservabilityContext {
  distinctId: string;
  sessionId: string;
  traceId: string;
}

export interface LLMCallOptions {
  /**
   * What this call is for, recorded as `$ai_span_name` on its PostHog event:
   * `home.insight`, `team.insight`, `ask.plan`, `ask.pattern`, `ask.answer`.
   * Every call under one context shares a trace; the span is what tells a
   * question's plan call from its answer call inside that trace.
   */
  span?: string;
  /**
   * Sampling temperature. Sent to neither provider any more: Gemini answers
   * sampling parameters with a 400, and so does every current Claude model.
   * Kept so callers that ask for determinism still type-check.
   */
  temperature?: number;
  /**
   * The reply's length floor in tokens, Anthropic path only. Claude's
   * thinking counts against `max_tokens`, so the request never goes below
   * `ANTHROPIC_MIN_MAX_TOKENS`; you pay only for what is generated.
   */
  maxTokens?: number;
  /**
   * How hard Claude thinks, Anthropic path only (`output_config.effort`):
   * `low` (the default here) for prose and insight cards, `medium` for SQL
   * planning. Thinking cannot be turned off on Claude Opus 5.5 or Sonnet 5.5;
   * effort is the one control.
   */
  effort?: "low" | "medium" | "high";
  /**
   * When set, the reply is one JSON object of this shape and nothing else:
   * `response_format` on the OpenAI-compatible path, structured outputs
   * (`output_config.format`) on the Anthropic path. The reply then streams
   * as JSON text on both. The caller still parses and checks what comes back.
   */
  jsonSchema?: {
    name: string;
    schema: { type: "object" } & Record<string, unknown>;
  };
  /**
   * How many leading characters of the system prompt are the same on every
   * call. The Anthropic path marks that prefix for its prompt cache, so a
   * call within the cache window skips reading it again; Gemini's implicit
   * caching keys on the prefix by itself, so there nothing more is sent.
   */
  staticPrefixLength?: number;
  /** Aborts the provider request: the client went away, so stop paying for the reply. */
  signal?: AbortSignal;
  /**
   * The model to use instead of the provider's default — a different one per
   * stage (Ask's planner needs SQL accuracy, its writer only prose), chosen
   * by `ASK_PLAN_MODEL` / `ASK_ANSWER_MODEL` in the route. The id must belong
   * to the provider in use; one from the other provider falls back to the
   * default rather than failing the call.
   */
  model?: string;
  /**
   * Called once the call is answered, with the provider and model that
   * answered it — the other provider's when the configured one failed and
   * the call failed over. Ask records this as the stage's model, so a broken
   * Claude setup does not show up as Claude runs answered by Gemini.
   */
  onServed?: (served: LLMServed) => void;
}

/** Who answered one call. `failover` is true when the configured provider failed first. */
export interface LLMServed {
  provider: LLMProvider;
  model: string;
  failover: boolean;
}

/** The two provider paths, by `LLM_PROVIDER`'s values (`openai` drives Gemini). */
export type LLMProvider = "anthropic" | "openai";

/** Each provider's default model, and the prefix its ids carry. */
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Claude's thinking counts against `max_tokens`, so a cap sized for the
 * reply alone (Ask's answer asked for 1024) ends the reply mid-sentence.
 * Billing is per token generated, so a high ceiling costs nothing extra.
 */
const ANTHROPIC_MIN_MAX_TOKENS = 16000;

/**
 * Server-side refusal fallback: if a safety classifier declines a request,
 * the API re-runs it on a fallback model inside the same call instead of
 * returning an empty `refusal`. Sent as a beta header on the plain endpoint
 * because PostHog's wrapper instruments `messages.create` only.
 */
const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * The models that take `fallbacks`. Claude Haiku 5.5 has no server-side
 * fallback and older models predate it; sending it there is a 400, which
 * `getLLMStream()` would then hide by answering on Gemini.
 */
const ANTHROPIC_FALLBACK_MODELS =
  /^claude-(?:(?:fable|mythos)-5-[12]|opus-5(?:-5)?|sonnet-5-5)$/;

/**
 * The models that take `output_config.effort`. Haiku 4.5, Sonnet 4.5 and
 * earlier answer it with a 400; an id not listed here runs at its default.
 */
const ANTHROPIC_EFFORT_MODELS =
  /^claude-(?:fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[5-9]|sonnet-4-6)/;

/**
 * Structured outputs require every object in the schema to forbid extra
 * keys. The schemas here (`ASK_PLAN_REPLY_SCHEMA`) are shared with Gemini,
 * which does not need it, so the flag is added on the way out rather than
 * written into each schema.
 */
export function closedJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closedJsonSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key] = closedJsonSchema(value);
  }
  if (out.type === "object" && !("additionalProperties" in out)) {
    out.additionalProperties = false;
  }
  return out;
}

function modelFor(
  provider: "anthropic" | "openai",
  requested: string | undefined,
): string {
  const fallback =
    provider === "anthropic" ? ANTHROPIC_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL;
  if (!requested) return fallback;
  const theirs =
    provider === "anthropic"
      ? requested.startsWith("claude-")
      : requested.startsWith("gemini-");
  return theirs ? requested : fallback;
}

/**
 * One SDK client per provider and key for the life of the server instance:
 * each client holds a connection pool, and building one per call threw that
 * away on every request. Keyed by the key itself so a rotated key gets a
 * fresh client.
 */
const clients = new Map<string, unknown>();

async function cachedClient<T>(
  key: string,
  build: () => Promise<T>,
): Promise<T> {
  const found = clients.get(key);
  if (found) return found as T;
  const built = await build();
  clients.set(key, built);
  return built;
}

/**
 * The Anthropic system prompt as content blocks when a static prefix is
 * named, its first block marked for the prompt cache; the plain string
 * otherwise. A prefix shorter than the cache's minimum is still harmless:
 * the API ignores the mark.
 */
function anthropicSystem(
  systemPrompt: string,
  staticPrefixLength: number | undefined,
):
  | string
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] {
  if (!staticPrefixLength || staticPrefixLength <= 0) return systemPrompt;
  const head = systemPrompt.slice(0, staticPrefixLength);
  const tail = systemPrompt.slice(staticPrefixLength);
  return [
    { type: "text", text: head, cache_control: { type: "ephemeral" } },
    ...(tail.length > 0 ? [{ type: "text" as const, text: tail }] : []),
  ];
}

/**
 * This app does not persist a conversation identifier for its streamed routes,
 * so each server invocation is one single-turn AI session and trace.
 */
export function createLLMObservabilityContext(
  distinctId: string,
): LLMObservabilityContext {
  return {
    distinctId,
    sessionId: `llm-run:${randomUUID()}`,
    traceId: randomUUID(),
  };
}

declare global {
  var __posthogLLMClient: PostHog | undefined;
}

/**
 * One client per server instance, not per request: posthog-node cannot be
 * torn down cleanly, so a client per call leaks. No exception autocapture —
 * it registers process-wide handlers, and server errors already reach PostHog
 * through onRequestError in instrumentation.ts.
 */
function getPostHogClient(): PostHog | null {
  // Missing keys mean no observability, never a failed insight.
  const config = getPostHogServerConfig();
  if (!config) return null;
  const { token, host } = config;

  globalThis.__posthogLLMClient ??= new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });
  return globalThis.__posthogLLMClient;
}

/**
 * The server-side PostHog client, for a route that captures a product event
 * of its own beside the adapter's LLM events (Ask's `ask_run`). Null when
 * PostHog is not configured, and the caller then sends nothing.
 */
export function getPostHogServerClient(): PostHog | null {
  return getPostHogClient();
}

/**
 * Flush after the response has finished, never inside the stream: awaiting
 * PostHog in the generator's `finally` held the text stream open until the
 * send completed — up to half a minute of retries if PostHog was slow.
 */
export function flushPostHogAfterResponse(posthog: PostHog | null) {
  flushAfterResponse(posthog);
}

function flushAfterResponse(posthog: Pick<PostHog, "flush"> | null) {
  if (!posthog) return;
  try {
    after(() => posthog.flush());
  } catch {
    // Outside a request (a script): flushAt 1 has already sent each event.
  }
}

function posthogOptions(
  context: LLMObservabilityContext,
  options: LLMCallOptions,
  provider?: "google",
) {
  return {
    posthogDistinctId: context.distinctId,
    // Prompts and replies carry player first names and match stats, and some
    // players are minors. Decided 2026-09-26: keep only model, cost, tokens
    // and latency. Set per call because posthog-node accepts a constructor
    // `privacyMode` in its types but never applies it. Turning this off would
    // need the privacy policy and Guardian Terms to name PostHog first.
    posthogPrivacyMode: true,
    posthogTraceId: context.traceId,
    posthogProperties: {
      $ai_session_id: context.sessionId,
      ...(provider ? { $ai_provider: provider } : {}),
      ...(options.span ? { $ai_span_name: options.span } : {}),
    },
  };
}

/**
 * True exactly when `getLLMStream()` below would call a real provider, false
 * when it would answer with the mock stream. A caller that needs structured
 * output from the model (Ask) branches on this, because the mock stream's
 * warning sentence is not something it can parse.
 *
 * The two conditions here are the two provider branches of `getLLMStream()`,
 * restated: change one and you must change the other.
 * `tests/ask-prompt.spec.ts` holds them together.
 */
export function isLLMConfigured(): boolean {
  const provider = process.env.LLM_PROVIDER ?? "";
  return (
    (provider === "anthropic" && Boolean(process.env.ANTHROPIC_API_KEY)) ||
    (provider === "openai" && Boolean(process.env.OPENAI_API_KEY))
  );
}

/**
 * The model a call asking for `requested` runs on, as `modelFor()` resolves
 * it for the configured provider; null in mock mode, where no model runs.
 * For telemetry: a request that fails over to the other provider runs that
 * provider's model instead, which is not known here — `options.onServed`
 * reports what actually answered.
 */
export function resolvedLLMModel(requested: string | undefined): string | null {
  if (!isLLMConfigured()) return null;
  return modelFor(
    process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "openai",
    requested,
  );
}

/** One provider a call may run on: which, on what model, and the request itself. */
export interface LLMProviderAttempt<T> {
  provider: LLMProvider;
  model: string;
  run: () => Promise<T>;
}

/** The PostHog surface the failover event needs; a stub in the spec. */
type FailoverCapture = Pick<PostHog, "capture" | "flush">;

/**
 * What a failed provider call says about itself, reduced to fields that
 * cannot carry user data: the HTTP status, the provider's error type and
 * code (`invalid_request_error`, `invalid_api_key`), and the SDK's error
 * class. Never the message — a 400 can quote the request back; the
 * failover's server log keeps it.
 */
export function llmFailureFields(error: unknown): {
  error_status: number | null;
  error_type: string | null;
  error_code: string | null;
  error_name: string | null;
} {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  // Short identifiers only: anything else (a sentence, a quoted value) is dropped.
  const slug = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value)
      ? value
      : null;
  return {
    error_status:
      typeof record.status === "number" && Number.isInteger(record.status)
        ? record.status
        : null,
    error_type: slug(record.type),
    error_code: slug(record.code),
    // The SDKs' error classes all leave `.name` as "Error"; the class name
    // (`BadRequestError`, `APIConnectionError`) is what tells them apart.
    // Not minified: both SDKs are `serverExternalPackages`.
    error_name:
      error instanceof Error
        ? slug(
            error.constructor.name !== "Error"
              ? error.constructor.name
              : error.name,
          )
        : null,
  };
}

/** The `$ai_provider` PostHog's LLM events carry for each path. */
const POSTHOG_PROVIDER: Record<LLMProvider, string> = {
  anthropic: "anthropic",
  openai: "google",
};

/**
 * Runs `primary`; when it throws and `secondary` exists, captures one
 * `llm_provider_failover` event and runs `secondary` instead. An aborted
 * call is not retried. `options.onServed` hears which one answered.
 *
 * The event is for spotting a broken provider setup (a bad key, a key
 * without the workspace scope, a parameter the model refuses), which
 * otherwise runs silently on the other provider. It carries no prompt,
 * reply or error message: under `posthogPrivacyMode` only model, cost,
 * tokens and latency leave the server, and an error message can quote the
 * request. Exported for its spec, which passes a stub `posthog`.
 */
export async function runWithProviderFailover<T>(
  attempts: {
    primary: LLMProviderAttempt<T>;
    secondary: LLMProviderAttempt<T> | null;
  },
  context: LLMObservabilityContext,
  options: Pick<LLMCallOptions, "span" | "model" | "signal" | "onServed">,
  call: "stream" | "tool_turn",
  posthog: FailoverCapture | null = getPostHogClient(),
): Promise<T> {
  const { primary, secondary } = attempts;
  let answered = primary;
  let result: T;
  try {
    result = await primary.run();
  } catch (error) {
    if (!secondary || options.signal?.aborted) throw error;
    const failure = llmFailureFields(error);
    console.warn("[llm] primary provider failed; retrying on the other", {
      provider: primary.provider,
      span: options.span,
      ...failure,
      // Server logs only — never in the PostHog event below. It names the
      // cause (a key without workspace scope, a refused parameter), and a 400
      // can quote the request back, which is why it stays out of analytics.
      error: error instanceof Error ? error.message : String(error),
    });
    if (posthog) {
      posthog.capture({
        distinctId: context.distinctId,
        event: "llm_provider_failover",
        properties: {
          primary_provider: POSTHOG_PROVIDER[primary.provider],
          secondary_provider: POSTHOG_PROVIDER[secondary.provider],
          primary_model: primary.model,
          secondary_model: secondary.model,
          requested_model: options.model ?? null,
          call,
          $ai_span_name: options.span ?? null,
          $ai_trace_id: context.traceId,
          $ai_session_id: context.sessionId,
          ...failure,
        },
      });
      flushAfterResponse(posthog);
    }
    answered = secondary;
    result = await secondary.run();
  }
  options.onServed?.({
    provider: answered.provider,
    model: answered.model,
    failover: answered !== primary,
  });
  return result;
}

/**
 * Returns an AsyncIterable<string> of text chunks for the given conversation.
 * Each chunk is a raw text delta (not JSON-wrapped).
 */
export async function getLLMStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  options: LLMCallOptions = {},
): Promise<AsyncIterable<string>> {
  const provider = process.env.LLM_PROVIDER ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const viaAnthropic = (
    key: string,
  ): LLMProviderAttempt<AsyncIterable<string>> => ({
    provider: "anthropic",
    model: modelFor("anthropic", options.model),
    run: () => anthropicStream(systemPrompt, messages, context, options, key),
  });
  const viaOpenAI = (
    key: string,
  ): LLMProviderAttempt<AsyncIterable<string>> => ({
    provider: "openai",
    model: modelFor("openai", options.model),
    run: () => openaiStream(systemPrompt, messages, context, options, key),
  });

  const primary =
    provider === "anthropic" && anthropicKey
      ? viaAnthropic(anthropicKey)
      : provider === "openai" && openaiKey
        ? viaOpenAI(openaiKey)
        : null;
  if (!primary) {
    // No provider configured — return a mock stream for local dev.
    return mockStream();
  }

  // The other provider, when its key is also set: one vendor's outage is a
  // retry on the other, not an `llm_unavailable` straight away. Only the
  // request itself is retried — a stream that fails after its first chunk
  // is the caller's to handle, as it was.
  const secondary =
    provider === "anthropic" && openaiKey
      ? viaOpenAI(openaiKey)
      : provider === "openai" && anthropicKey
        ? viaAnthropic(anthropicKey)
        : null;

  return runWithProviderFailover(
    { primary, secondary },
    context,
    options,
    "stream",
  );
}

/* ── Anthropic ────────────────────────────────────────────── */

/**
 * The fields every Anthropic request shares, apart from messages and tools.
 * No `temperature` and no `thinking`: current Claude models answer sampling
 * parameters with a 400, and Opus 5.5 / Sonnet 5.5 refuse a disabled
 * `thinking` too — they think adaptively, and `effort` sets how much.
 */
function anthropicCommonBody(
  systemPrompt: string,
  options: LLMCallOptions,
  defaultEffort: NonNullable<LLMCallOptions["effort"]>,
) {
  const model = modelFor("anthropic", options.model);
  return {
    model,
    max_tokens: Math.max(options.maxTokens ?? 0, ANTHROPIC_MIN_MAX_TOKENS),
    system: anthropicSystem(systemPrompt, options.staticPrefixLength),
    output_config: {
      ...(ANTHROPIC_EFFORT_MODELS.test(model)
        ? { effort: options.effort ?? defaultEffort }
        : {}),
      // A JSON reply is constrained by structured outputs and streams as
      // ordinary text. (It used to be a forced tool call, which Opus 5.5
      // and Sonnet 5.5 refuse with a 400.)
      ...(options.jsonSchema
        ? {
            format: {
              type: "json_schema" as const,
              schema: closedJsonSchema(options.jsonSchema.schema) as Record<
                string,
                unknown
              >,
            },
          }
        : {}),
    },
    ...(ANTHROPIC_FALLBACK_MODELS.test(model)
      ? { fallbacks: "default" as const }
      : {}),
  };
}

/** The streamed Anthropic request body, apart from PostHog's options. Exported for its spec. */
export function anthropicRequestBody(
  systemPrompt: string,
  messages: ChatMessage[],
  options: LLMCallOptions,
) {
  return {
    ...anthropicCommonBody(systemPrompt, options, "low"),
    stream: true as const,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

/** Per-request options: the fallback beta header only beside a `fallbacks` body field. Exported for its spec. */
export function anthropicRequestOptions(
  model: string,
  signal: AbortSignal | undefined,
) {
  return {
    ...(ANTHROPIC_FALLBACK_MODELS.test(model)
      ? { headers: { "anthropic-beta": ANTHROPIC_FALLBACK_BETA } }
      : {}),
    ...(signal ? { signal } : {}),
  };
}

async function anthropicStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  options: LLMCallOptions,
  apiKey: string,
): Promise<AsyncIterable<string>> {
  const posthog = getPostHogClient();
  // The SDK's request type predates `fallbacks` and the newer models; the
  // body is sent as written.
  const request = anthropicRequestBody(
    systemPrompt,
    messages,
    options,
  ) as never as {
    stream: true;
    model: string;
    max_tokens: number;
    messages: never[];
  };
  const requestOptions = anthropicRequestOptions(request.model, options.signal);
  // `create({ stream: true })`, not `messages.stream()`: PostHog's wrapper
  // only instruments `create`, and `stream()` through it throws on first read.
  // Imported inside each branch, not at module scope: `@posthog/ai/anthropic`
  // pulls in the full `@anthropic-ai/sdk` itself, so loading both here
  // unconditionally would double the SDK weight on every request regardless
  // of whether PostHog is configured.
  const stream = posthog
    ? await (
        await cachedClient(
          `anthropic:posthog:${apiKey}`,
          async () =>
            new (await import("@posthog/ai/anthropic")).Anthropic({
              apiKey,
              posthog,
            }),
        )
      ).messages.create(
        {
          ...request,
          ...posthogOptions(context, options),
        },
        requestOptions,
      )
    : await (
        await cachedClient(
          `anthropic:${apiKey}`,
          async () =>
            new (await import("@anthropic-ai/sdk")).default({ apiKey }),
        )
      ).messages.create(request, requestOptions);
  flushAfterResponse(posthog);

  async function* iterate(): AsyncIterable<string> {
    for await (const event of stream) {
      if (event.type !== "content_block_delta") continue;
      // Thinking deltas are skipped: only the reply is the caller's text.
      if (event.delta.type === "text_delta") yield event.delta.text;
    }
  }

  return iterate();
}

/* ── OpenAI ───────────────────────────────────────────────── */

const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

/** The Gemini (OpenAI-compatible) request body, apart from PostHog's options. Exported for its spec. */
export function geminiRequestBody(
  systemPrompt: string,
  messages: ChatMessage[],
  options: LLMCallOptions,
) {
  return {
    // 2.5 models are closed to new Google Cloud projects, so a key from one
    // is refused with a 404 on 2.5-flash-lite. Same model as generate-insights.
    model: modelFor("openai", options.model),
    stream: true as const,
    // A streamed completion reports its token usage only on request, in one
    // last chunk with no choices. Without it every event PostHog recorded
    // from this path carried zero tokens and zero cost (checked 2026-10-14:
    // 701 of 701 calls). The chunk loop below ignores a chunk with no delta.
    stream_options: { include_usage: true },
    messages: [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    // No `temperature` and no `max_tokens` on this path. Gemini is retiring
    // sampling parameters and answers them with a 400, and a 3.x model counts
    // its thinking tokens against `max_tokens`, so a cap sized for the reply
    // can cut a JSON plan off mid-object. Both apply on the Anthropic path only.
    ...(options.jsonSchema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: options.jsonSchema.name,
              schema: options.jsonSchema.schema,
            },
          },
        }
      : {}),
  };
}

async function openaiStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  options: LLMCallOptions,
  apiKey: string,
): Promise<AsyncIterable<string>> {
  const posthog = getPostHogClient();
  const request = geminiRequestBody(systemPrompt, messages, options);
  const requestOptions = options.signal ? { signal: options.signal } : {};
  // Imported inside each branch, not at module scope: `@posthog/ai/openai`
  // pulls in the full `openai` package itself, so loading both here
  // unconditionally would double the SDK weight on every request regardless
  // of whether PostHog is configured.
  const stream = posthog
    ? await (
        await cachedClient(
          `openai:posthog:${apiKey}`,
          async () =>
            new (await import("@posthog/ai/openai")).OpenAI({
              apiKey,
              baseURL: GEMINI_OPENAI_BASE_URL,
              posthog,
            }),
        )
      ).chat.completions.create(
        {
          ...request,
          ...posthogOptions(context, options, "google"),
        },
        requestOptions,
      )
    : await (
        await cachedClient(
          `openai:${apiKey}`,
          async () =>
            new (await import("openai")).default({
              apiKey,
              baseURL: GEMINI_OPENAI_BASE_URL,
            }),
        )
      ).chat.completions.create(request, requestOptions);
  flushAfterResponse(posthog);

  async function* iterate(): AsyncIterable<string> {
    for await (const chunk of stream) {
      // The trailing usage chunk may omit `choices` entirely rather than send [].
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  return iterate();
}

/* ── Tool calling ─────────────────────────────────────────── */

/** One tool the model may call: its name, what it does, and its arguments as a JSON schema. */
export interface LLMTool {
  name: string;
  description: string;
  inputSchema: { type: "object" } & Record<string, unknown>;
}

/** One call the model asked for. `input` is the parsed arguments, `{}` when they did not parse. */
export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * One turn of a tool conversation, provider-neutral. An assistant turn keeps
 * the provider's own message in `raw`, sent back verbatim on that provider:
 * Gemini 3 signs each function call (`extra_content.google.thought_signature`)
 * and refuses the next turn when the signature is not returned with it.
 */
export type LLMToolMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls: LLMToolCall[];
      raw?: { provider: "anthropic" | "openai"; message: unknown };
    }
  | {
      role: "tool";
      results: {
        id: string;
        name: string;
        content: string;
        isError?: boolean;
      }[];
    };

/** What one model turn answered: its prose, and the calls it asked for (none when it stopped). */
export interface LLMToolTurn {
  text: string;
  toolCalls: LLMToolCall[];
  raw: { provider: "anthropic" | "openai"; message: unknown };
}

export interface LLMToolCallOptions extends Omit<LLMCallOptions, "jsonSchema"> {
  /** `auto` (default): the model may stop. `required`: it must call one. A name: it must call that one. */
  toolChoice?: "auto" | "required" | { name: string };
}

function parseToolInput(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * One non-streamed model turn with tools, for a caller that runs its own
 * bounded loop (Ask's agent mode, `src/lib/services/ask/agent.ts`): the
 * caller executes the calls and sends their results back as a `tool` turn.
 * Same providers, failover, models and PostHog events as `getLLMStream()`;
 * throws when no provider is configured — there is no mock tool turn.
 */
export async function getLLMToolTurn(
  systemPrompt: string,
  messages: LLMToolMessage[],
  tools: readonly LLMTool[],
  context: LLMObservabilityContext,
  options: LLMToolCallOptions = {},
): Promise<LLMToolTurn> {
  const provider = process.env.LLM_PROVIDER ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const viaAnthropic = (key: string): LLMProviderAttempt<LLMToolTurn> => ({
    provider: "anthropic",
    model: modelFor("anthropic", options.model),
    run: () =>
      anthropicToolTurn(systemPrompt, messages, tools, context, options, key),
  });
  const viaOpenAI = (key: string): LLMProviderAttempt<LLMToolTurn> => ({
    provider: "openai",
    model: modelFor("openai", options.model),
    run: () =>
      openaiToolTurn(systemPrompt, messages, tools, context, options, key),
  });

  const primary =
    provider === "anthropic" && anthropicKey
      ? viaAnthropic(anthropicKey)
      : provider === "openai" && openaiKey
        ? viaOpenAI(openaiKey)
        : null;
  if (!primary) throw new Error("No LLM provider is configured.");
  const secondary =
    provider === "anthropic" && openaiKey
      ? viaOpenAI(openaiKey)
      : provider === "openai" && anthropicKey
        ? viaAnthropic(anthropicKey)
        : null;
  return runWithProviderFailover(
    { primary, secondary },
    context,
    options,
    "tool_turn",
  );
}

/**
 * What a forced tool choice becomes on Claude. Opus 5.5 and Sonnet 5.5
 * refuse a forced `tool_choice` (`any` / `tool`) with a 400, so the choice
 * is always `auto`.
 *
 * A named choice also gets a note after the latest tool results. Only a
 * named one: `agent.ts` names a tool on its last turn alone, so the note is
 * never resent without it. A note on every `required` turn would be dropped
 * from the history the next turn sends, and an earlier message that changes
 * between requests makes Claude discard the reasoning it attached to the
 * turns after it. `required` turns rely on the tool list, and on the loop's
 * own nudge (`agent.ts`) when a turn answers in prose.
 */
function anthropicToolNudge(
  choice: LLMToolCallOptions["toolChoice"],
): string | null {
  if (!choice || typeof choice === "string") return null;
  return `Respond now by calling the ${choice.name} tool.`;
}

/** The Anthropic request body for one tool turn, apart from PostHog's options. Exported for its spec. */
export function anthropicToolRequestBody(
  systemPrompt: string,
  messages: LLMToolMessage[],
  tools: readonly LLMTool[],
  options: LLMToolCallOptions,
) {
  const nudge = anthropicToolNudge(options.toolChoice);
  const lastIndex = messages.length - 1;
  return {
    // The planner's turns: SQL accuracy is worth some thinking.
    ...anthropicCommonBody(systemPrompt, options, "medium"),
    messages: messages.map((message, index) => {
      const note = index === lastIndex ? nudge : null;
      if (message.role === "user") {
        return {
          role: "user" as const,
          content: note ? `${message.content}\n\n${note}` : message.content,
        };
      }
      if (message.role === "tool") {
        return {
          role: "user" as const,
          content: [
            ...message.results.map((result) => ({
              type: "tool_result" as const,
              tool_use_id: result.id,
              content: result.content,
              ...(result.isError ? { is_error: true } : {}),
            })),
            // Text after the tool results, never before: the API wants the
            // results first in the turn.
            ...(note ? [{ type: "text" as const, text: note }] : []),
          ],
        };
      }
      if (message.raw?.provider === "anthropic") {
        return { role: "assistant" as const, content: message.raw.message };
      }
      return {
        role: "assistant" as const,
        content: [
          ...(message.content
            ? [{ type: "text" as const, text: message.content }]
            : []),
          ...message.toolCalls.map((call) => ({
            type: "tool_use" as const,
            id: call.id,
            name: call.name,
            input: call.input,
          })),
        ],
      };
    }),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    })),
    tool_choice: { type: "auto" as const },
  };
}

async function anthropicToolTurn(
  systemPrompt: string,
  messages: LLMToolMessage[],
  tools: readonly LLMTool[],
  context: LLMObservabilityContext,
  options: LLMToolCallOptions,
  apiKey: string,
): Promise<LLMToolTurn> {
  const posthog = getPostHogClient();
  const request = anthropicToolRequestBody(
    systemPrompt,
    messages,
    tools,
    options,
  );
  const requestOptions = anthropicRequestOptions(request.model, options.signal);
  // The content blocks are built loosely (a replayed assistant turn is the
  // provider's own array, thinking blocks included, which must go back
  // unchanged); the SDK's request type is too narrow for that.
  const body = request as never;
  const response = (
    posthog
      ? await (
          await cachedClient(
            `anthropic:posthog:${apiKey}`,
            async () =>
              new (await import("@posthog/ai/anthropic")).Anthropic({
                apiKey,
                posthog,
              }),
          )
        ).messages.create(
          {
            ...(body as object),
            ...posthogOptions(context, options),
          } as never,
          requestOptions,
        )
      : await (
          await cachedClient(
            `anthropic:${apiKey}`,
            async () =>
              new (await import("@anthropic-ai/sdk")).default({ apiKey }),
          )
        ).messages.create(body, requestOptions)
  ) as {
    content: (
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: unknown }
      | { type: string }
    )[];
  };
  flushAfterResponse(posthog);

  const text: string[] = [];
  const toolCalls: LLMToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "text" && "text" in block) text.push(block.text);
    if (block.type === "tool_use" && "id" in block && "name" in block) {
      const input = (block as { input: unknown }).input;
      toolCalls.push({
        id: block.id,
        name: block.name,
        input:
          typeof input === "object" && input !== null && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {},
      });
    }
  }
  return {
    text: text.join(""),
    toolCalls,
    raw: { provider: "anthropic", message: response.content },
  };
}

/** The Gemini (OpenAI-compatible) request body for one tool turn, apart from PostHog's options. Exported for its spec. */
export function geminiToolRequestBody(
  systemPrompt: string,
  messages: LLMToolMessage[],
  tools: readonly LLMTool[],
  options: LLMToolCallOptions,
) {
  const choice = options.toolChoice ?? "auto";
  return {
    model: modelFor("openai", options.model),
    messages: [
      { role: "system" as const, content: systemPrompt },
      ...messages.flatMap((message): Record<string, unknown>[] => {
        if (message.role === "user") {
          return [{ role: "user", content: message.content }];
        }
        if (message.role === "tool") {
          return message.results.map((result) => ({
            role: "tool",
            tool_call_id: result.id,
            content: result.content,
          }));
        }
        const raw =
          message.raw?.provider === "openai"
            ? (message.raw.message as { tool_calls?: unknown[] })
            : null;
        return [
          {
            role: "assistant",
            content: message.content || null,
            // The provider's own calls, signatures included, with the ids
            // the results answer — an id the provider left out was minted
            // in `openaiToolTurn`, and the result carries that one.
            tool_calls: message.toolCalls.map((call, index) => {
              const own = raw?.tool_calls?.[index];
              return {
                ...(typeof own === "object" && own !== null ? own : {}),
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.input),
                },
              };
            }),
          },
        ];
      }),
    ],
    tools: tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    })),
    tool_choice:
      choice === "auto" || choice === "required"
        ? choice
        : { type: "function" as const, function: { name: choice.name } },
    // No sampling parameters and no `max_tokens`, as `geminiRequestBody()`.
  };
}

async function openaiToolTurn(
  systemPrompt: string,
  messages: LLMToolMessage[],
  tools: readonly LLMTool[],
  context: LLMObservabilityContext,
  options: LLMToolCallOptions,
  apiKey: string,
): Promise<LLMToolTurn> {
  const posthog = getPostHogClient();
  const body = geminiToolRequestBody(
    systemPrompt,
    messages,
    tools,
    options,
  ) as never;
  const requestOptions = options.signal ? { signal: options.signal } : {};
  const completion = (
    posthog
      ? await (
          await cachedClient(
            `openai:posthog:${apiKey}`,
            async () =>
              new (await import("@posthog/ai/openai")).OpenAI({
                apiKey,
                baseURL: GEMINI_OPENAI_BASE_URL,
                posthog,
              }),
          )
        ).chat.completions.create(
          {
            ...(body as object),
            ...posthogOptions(context, options, "google"),
          } as never,
          requestOptions,
        )
      : await (
          await cachedClient(
            `openai:${apiKey}`,
            async () =>
              new (await import("openai")).default({
                apiKey,
                baseURL: GEMINI_OPENAI_BASE_URL,
              }),
          )
        ).chat.completions.create(body, requestOptions)
  ) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
    }[];
  };
  flushAfterResponse(posthog);

  const message = completion.choices?.[0]?.message ?? {};
  const toolCalls: LLMToolCall[] = (message.tool_calls ?? []).flatMap((call) =>
    call.function?.name
      ? [
          {
            id: call.id || `call_${randomUUID()}`,
            name: call.function.name,
            input: parseToolInput(call.function.arguments),
          },
        ]
      : [],
  );
  return {
    text: message.content ?? "",
    toolCalls,
    raw: { provider: "openai", message },
  };
}

/* ── Embeddings ───────────────────────────────────────────── */

/**
 * The Gemini-through-OpenAI-SDK client, for the one embeddings call
 * (`embeddings.ts`, Ask's dynamic few-shot). It is the same plain client
 * the chat calls use without PostHog — same base URL, same key, same cache
 * entry — so an embedding costs no second connection pool. Null unless the
 * `openai` provider and its key are configured: the Anthropic path has no
 * embeddings endpoint, and the caller then keeps its fixed examples. Nothing
 * is recorded in LLM analytics for it.
 */
export async function getGeminiOpenAIClient(): Promise<InstanceType<
  typeof OpenAI
> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if ((process.env.LLM_PROVIDER ?? "") !== "openai" || !apiKey) return null;
  return cachedClient(
    `openai:${apiKey}`,
    async () =>
      new (await import("openai")).default({
        apiKey,
        baseURL: GEMINI_OPENAI_BASE_URL,
      }),
  );
}

/* ── Mock (no credentials) ────────────────────────────────── */

async function* mockStream(): AsyncIterable<string> {
  const text =
    "⚠️ No LLM provider is configured. Set LLM_PROVIDER and the corresponding API key in .env.local to enable real AI responses. See docs/llm-setup.md for instructions.";
  const words = text.split(" ");
  for (const word of words) {
    yield word + " ";
    await new Promise((r) => setTimeout(r, 40));
  }
}
