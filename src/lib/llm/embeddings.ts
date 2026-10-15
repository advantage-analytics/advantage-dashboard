import { getGeminiOpenAIClient } from "@/lib/llm/adapter";

/**
 * One embedding call, for Ask's dynamic few-shot (`examples.ts`): the
 * question is embedded, the nearest rated (question → plan) pairs are
 * retrieved by cosine similarity (`ask_similar_examples`), and the planner
 * is shown them.
 *
 * Only the Gemini path has an embeddings endpoint — the same
 * OpenAI-compatible one the chat calls use — so `embedText()` answers null
 * whenever the provider is not Gemini or its key is unset, and the prompt
 * then keeps its fixed examples. Null too on any failure: an embedding is a
 * nicety, never a reason to fail a question.
 *
 * `gemini-embedding-001` is a Matryoshka model: its vectors can be cut to
 * 768 dimensions and renormalised. The request asks for 768 outright; a
 * longer vector that comes back anyway is cut and renormalised here, so the
 * stored vectors are unit length whichever way the endpoint answered.
 */

export const ASK_EMBEDDING_MODEL = "gemini-embedding-001";
export const ASK_EMBEDDING_DIMENSIONS = 768;
/** More than this is cut before embedding: a question is at most 1000 characters anyway. */
export const MAX_EMBEDDING_INPUT_LENGTH = 2000;

/** The one method this module calls on the SDK client. */
export interface EmbeddingsClient {
  embeddings: {
    create(
      body: { model: string; input: string; dimensions?: number },
      options?: { signal?: AbortSignal },
    ): Promise<{ data: { embedding: number[] }[] }>;
  };
}

/**
 * The first `dimensions` values, scaled to unit length. Null when there are
 * fewer than that many, or when every value is zero (nothing to scale).
 */
export function normaliseEmbedding(
  values: readonly number[],
  dimensions: number = ASK_EMBEDDING_DIMENSIONS,
): number[] | null {
  if (values.length < dimensions) return null;
  const head = values.slice(0, dimensions);
  if (!head.every((value) => Number.isFinite(value))) return null;
  const norm = Math.sqrt(head.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return null;
  return head.map((value) => value / norm);
}

/**
 * `embedText()` with the client handed in, for a spec: null for a null
 * client, a short vector or a thrown call.
 */
export async function embedTextWith(
  client: EmbeddingsClient | null,
  text: string,
  options: { signal?: AbortSignal } = {},
): Promise<number[] | null> {
  if (!client) return null;
  const input = text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EMBEDDING_INPUT_LENGTH);
  if (input === "") return null;
  try {
    const response = await client.embeddings.create(
      {
        model: ASK_EMBEDDING_MODEL,
        input,
        dimensions: ASK_EMBEDDING_DIMENSIONS,
      },
      options.signal ? { signal: options.signal } : undefined,
    );
    const values = response.data?.[0]?.embedding;
    return Array.isArray(values) ? normaliseEmbedding(values) : null;
  } catch (error) {
    // The message only: never the text that was being embedded.
    console.warn("[llm] embedding failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The embedding of `text` as a unit vector of 768 numbers, or null when the
 * provider is not Gemini, no key is set, or the call failed.
 */
export async function embedText(
  text: string,
  options: { signal?: AbortSignal } = {},
): Promise<number[] | null> {
  return embedTextWith(await getGeminiOpenAIClient(), text, options);
}
