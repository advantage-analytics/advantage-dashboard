import { after } from "next/server";
import { PostHog } from "posthog-node";
import { randomUUID } from "node:crypto";
import { getPostHogServerConfig } from "@/lib/posthog-logs";

/**
 * LLM Adapter — provider-switching stream module.
 *
 * Switch providers by setting LLM_PROVIDER in .env.local:
 *   LLM_PROVIDER=anthropic   (requires ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=openai      (requires OPENAI_API_KEY)
 *
 * If no provider/key is set the adapter emits a mock stream so the UI
 * remains testable in local dev without credentials.
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
    // Deliberate (decided 2026-09-25): prompts and replies are recorded in
    // full so a bad insight can be debugged from its trace. They carry player
    // first names and match stats, which makes this the one place those reach
    // PostHog — replays mask all text and the warehouse role sees neither.
    // The privacy policy must say so; flip to true to keep only model, cost,
    // tokens and latency.
    privacyMode: false,
  });
  return globalThis.__posthogLLMClient;
}

/**
 * Flush after the response has finished, never inside the stream: awaiting
 * PostHog in the generator's `finally` held the text stream open until the
 * send completed — up to half a minute of retries if PostHog was slow.
 */
function flushAfterResponse(posthog: PostHog | null) {
  if (!posthog) return;
  try {
    after(() => posthog.flush());
  } catch {
    // Outside a request (a script): flushAt 1 has already sent each event.
  }
}

function posthogOptions(context: LLMObservabilityContext, provider?: "google") {
  return {
    posthogDistinctId: context.distinctId,
    posthogTraceId: context.traceId,
    posthogProperties: {
      $ai_session_id: context.sessionId,
      ...(provider ? { $ai_provider: provider } : {}),
    },
  };
}

/**
 * Returns an AsyncIterable<string> of text chunks for the given conversation.
 * Each chunk is a raw text delta (not JSON-wrapped).
 */
export async function getLLMStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
): Promise<AsyncIterable<string>> {
  const provider = process.env.LLM_PROVIDER ?? "";

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return anthropicStream(
      systemPrompt,
      messages,
      context,
      process.env.ANTHROPIC_API_KEY,
    );
  }

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return openaiStream(
      systemPrompt,
      messages,
      context,
      process.env.OPENAI_API_KEY,
    );
  }

  // No provider configured — return a mock stream for local dev.
  return mockStream();
}

/* ── Anthropic ────────────────────────────────────────────── */

async function anthropicStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  apiKey: string,
): Promise<AsyncIterable<string>> {
  const posthog = getPostHogClient();
  const request = {
    model: "claude-opus-4-6",
    max_tokens: 1024,
    stream: true as const,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  // `create({ stream: true })`, not `messages.stream()`: PostHog's wrapper
  // only instruments `create`, and `stream()` through it throws on first read.
  // Imported inside each branch, not at module scope: `@posthog/ai/anthropic`
  // pulls in the full `@anthropic-ai/sdk` itself, so loading both here
  // unconditionally would double the SDK weight on every request regardless
  // of whether PostHog is configured.
  const stream = posthog
    ? await new (await import("@posthog/ai/anthropic")).Anthropic({
        apiKey,
        posthog,
      }).messages.create({
        ...request,
        ...posthogOptions(context),
      })
    : await new (await import("@anthropic-ai/sdk")).default({
        apiKey,
      }).messages.create(request);
  flushAfterResponse(posthog);

  async function* iterate(): AsyncIterable<string> {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }

  return iterate();
}

/* ── OpenAI ───────────────────────────────────────────────── */

async function openaiStream(
  systemPrompt: string,
  messages: ChatMessage[],
  context: LLMObservabilityContext,
  apiKey: string,
): Promise<AsyncIterable<string>> {
  const posthog = getPostHogClient();
  const request = {
    model: "gemini-2.5-flash-lite",
    stream: true as const,
    messages: [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };
  // Imported inside each branch, not at module scope: `@posthog/ai/openai`
  // pulls in the full `openai` package itself, so loading both here
  // unconditionally would double the SDK weight on every request regardless
  // of whether PostHog is configured.
  const stream = posthog
    ? await new (await import("@posthog/ai/openai")).OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        posthog,
      }).chat.completions.create({
        ...request,
        ...posthogOptions(context, "google"),
      })
    : await new (await import("openai")).default({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }).chat.completions.create(request);
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
