/**
 * The plumbing the insight routes share.
 *
 * `/api/home-insight` and `/api/team-insight` differ in what they read and
 * what they ask; how they answer is one contract — a plain-text stream of one
 * sentence — and the pipe from the adapter's async iterable to a `Response`
 * was written out in both, and in `/api/chat` before them. Three copies of an
 * encoder loop is three places a stream error handles differently.
 */

/** An async iterable of text chunks, as a streamed `text/plain` response. */
export function textStreamResponse(iterable: AsyncIterable<string>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of iterable) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        // `close()` on an errored controller throws; the error is the close.
        console.error("Stream error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** "+2.1", "-0.5", or "flat" — a KPI's movement, as the prompts state it. */
export function formatChange(change: number): string {
  if (change === 0) return "flat";
  return `${change > 0 ? "+" : ""}${change}`;
}
