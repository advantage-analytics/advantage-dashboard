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

/**
 * Returns an AsyncIterable<string> of text chunks for the given conversation.
 * Each chunk is a raw text delta (not JSON-wrapped).
 */
export async function getLLMStream(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<AsyncIterable<string>> {
  const provider = process.env.LLM_PROVIDER ?? "";

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return anthropicStream(systemPrompt, messages);
  }

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return openaiStream(systemPrompt, messages);
  }

  // No provider configured — return a mock stream for local dev.
  return mockStream();
}

/* ── Anthropic ────────────────────────────────────────────── */

async function anthropicStream(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<AsyncIterable<string>> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

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
  messages: ChatMessage[]
): Promise<AsyncIterable<string>> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

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
