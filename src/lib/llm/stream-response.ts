/**
 * The plumbing the insight routes share.
 *
 * `/api/home-insight` and `/api/team-insight` differ in what they read and
 * what they ask; how they answer is one contract — a plain-text stream of one
 * sentence — and the pipe from the adapter's async iterable to a `Response`
 * was written out in both, and in the since-deleted chat route before them.
 * Three copies of an encoder loop is three places a stream error handles
 * differently.
 */

/** Pipe an async iterable through `encode` into a streamed `Response`. */
function streamResponse<T>(
  iterable: AsyncIterable<T>,
  encode: (item: T) => string,
  contentType: string,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const item of iterable) {
          controller.enqueue(encoder.encode(encode(item)));
        }
        controller.close();
      } catch (err) {
        // `close()` on an errored controller throws; the error is the close.
        console.error("Stream error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": contentType } });
}

/** An async iterable of text chunks, as a streamed `text/plain` response. */
export function textStreamResponse(iterable: AsyncIterable<string>): Response {
  return streamResponse(
    iterable,
    (chunk) => chunk,
    "text/plain; charset=utf-8",
  );
}

/**
 * An async iterable of events, as a streamed `application/x-ndjson` response:
 * one JSON object per line, each line ended by `\n`. For an answer with
 * structure — `/api/ask` sends a headline, figures and text as separate
 * events — where `textStreamResponse()` carries one sentence.
 *
 * `JSON.stringify` escapes every line break inside a string, so an event can
 * never span two lines. A failure the client should read belongs in the
 * iterable as an event of its own; an error thrown out of the iterable errors
 * the stream, exactly as it does for the text helper.
 */
export function ndjsonStreamResponse<T>(iterable: AsyncIterable<T>): Response {
  return streamResponse(
    iterable,
    (event) => `${JSON.stringify(event)}\n`,
    "application/x-ndjson",
  );
}

/** "+2.1", "-0.5", or "flat" — a KPI's movement, as the prompts state it. */
export function formatChange(change: number): string {
  if (change === 0) return "flat";
  return `${change > 0 ? "+" : ""}${change}`;
}
