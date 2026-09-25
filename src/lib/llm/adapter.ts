import { Anthropic } from "@posthog/ai/anthropic";
import { OpenAI } from "@posthog/ai/openai";
import { PostHog } from "posthog-node";
import { randomUUID } from "node:crypto";

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

function createPostHogClient(): PostHog | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
      );
    }
    return null;
  }

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!host) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
      );
    }
    return null;
  }

  return new PostHog(token, {
    host,
    enableExceptionAutocapture: true,
    flushAt: 1,
    flushInterval: 0,
    privacyMode: false,
  });
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
  const posthog = createPostHogClient();
  const { default: AnthropicSdk } = await import("@anthropic-ai/sdk");
  const request = {
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const stream = posthog
    ? new Anthropic({
        apiKey,
        posthog,
      }).messages.stream({ ...request, ...posthogOptions(context) })
    : new AnthropicSdk({ apiKey }).messages.stream(request);

  async function* iterate(): AsyncIterable<string> {
    try {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } finally {
      await posthog?.shutdown();
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
  const posthog = createPostHogClient();
  const { default: OpenAISdk } = await import("openai");
  const request = {
    model: "gemini-2.5-flash-lite",
    stream: true as const,
    messages: [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };
  const stream = posthog
    ? await new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        posthog,
      }).chat.completions.create({
        ...request,
        ...posthogOptions(context, "google"),
      })
    : await new OpenAISdk({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }).chat.completions.create(request);

  async function* iterate(): AsyncIterable<string> {
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } finally {
      await posthog?.shutdown();
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
