import { after } from "next/server";
import { PostHog } from "posthog-node";
import { randomUUID } from "node:crypto";
import { getPostHogServerConfig } from "@/lib/posthog-logs";

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
  /** Sampling temperature. Omitted, the provider's default applies. */
  temperature?: number;
  /** The reply's length cap in tokens. The Anthropic path's default is 1024. */
  maxTokens?: number;
  /**
   * When set, the reply is one JSON object of this shape and nothing else:
   * `response_format` on the OpenAI-compatible path, a single forced tool on
   * the Anthropic path, whose arguments then stream as JSON text. The caller
   * still parses and checks what comes back.
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
}

/** Each provider's default model, and the prefix its ids carry. */
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-4-6";
const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";

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

function flushAfterResponse(posthog: PostHog | null) {
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
 * provider's model instead, which is not known here.
 */
export function resolvedLLMModel(requested: string | undefined): string | null {
  if (!isLLMConfigured()) return null;
  return modelFor(
    process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "openai",
    requested,
  );
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

  const primary =
    provider === "anthropic" && anthropicKey
      ? () =>
          anthropicStream(
            systemPrompt,
            messages,
            context,
            options,
            anthropicKey,
          )
      : provider === "openai" && openaiKey
        ? () =>
            openaiStream(systemPrompt, messages, context, options, openaiKey)
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
      ? () => openaiStream(systemPrompt, messages, context, options, openaiKey)
      : provider === "openai" && anthropicKey
        ? () =>
            anthropicStream(
              systemPrompt,
              messages,
              context,
              options,
              anthropicKey,
            )
        : null;

  try {
    return await primary();
  } catch (error) {
    if (!secondary || options.signal?.aborted) throw error;
    console.warn("[llm] primary provider failed; retrying on the other", {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return secondary();
  }
}

/* ── Anthropic ────────────────────────────────────────────── */

async function anthropicStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  options: LLMCallOptions,
  apiKey: string,
): Promise<AsyncIterable<string>> {
  const posthog = getPostHogClient();
  const request = {
    model: modelFor("anthropic", options.model),
    max_tokens: options.maxTokens ?? 1024,
    stream: true as const,
    system: anthropicSystem(systemPrompt, options.staticPrefixLength),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    // A JSON reply is a forced call of one tool whose input is the schema:
    // the one way this API constrains a reply's shape. Its arguments arrive
    // as `input_json_delta` events, yielded below as the reply's text.
    ...(options.jsonSchema
      ? {
          tools: [
            {
              name: options.jsonSchema.name,
              description:
                "The reply, in the shape the system prompt asks for.",
              input_schema: options.jsonSchema.schema,
            },
          ],
          tool_choice: { type: "tool" as const, name: options.jsonSchema.name },
        }
      : {}),
  };
  const requestOptions = options.signal ? { signal: options.signal } : {};
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
      if (event.delta.type === "text_delta") {
        yield event.delta.text;
      } else if (event.delta.type === "input_json_delta") {
        yield event.delta.partial_json;
      }
    }
  }

  return iterate();
}

/* ── OpenAI ───────────────────────────────────────────────── */

const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

async function openaiStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  options: LLMCallOptions,
  apiKey: string,
): Promise<AsyncIterable<string>> {
  const posthog = getPostHogClient();
  const request = {
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
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxTokens !== undefined
      ? { max_tokens: options.maxTokens }
      : {}),
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
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  return iterate();
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
