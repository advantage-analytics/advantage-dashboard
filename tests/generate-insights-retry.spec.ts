import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

/**
 * generate-insights retries Gemini's transient refusals. A 503 "high demand"
 * used to end the review for good, since every caller swallows the failure.
 * The edge function runs in a vm with a stubbed client, fetch and clock.
 */
async function run(statuses: number[]) {
  let handler!: (request: Request) => Promise<Response>;
  const calls: number[] = [];
  const updates: unknown[] = [];
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: () => query,
    eq: () => query,
    is: () => query,
    lt: () => query,
    in: () => query,
    order: () => query,
    update: (value: unknown) => {
      updates.push(value);
      return query;
    },
    single: async () => ({ data: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{ is_player1: true }, { is_player1: false }],
        error: null,
      }).then(resolve),
  });
  const source = readFileSync(
    "supabase/functions/generate-insights/index.ts",
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      require: (id: string) =>
        id.includes("http/server")
          ? {
              serve: (callback: typeof handler) => {
                handler = callback;
              },
            }
          : { createClient: () => ({ from: () => query }) },
      Deno: { env: { get: () => "stub" } },
      Response,
      console: { ...console, warn: () => {}, error: () => {} },
      setTimeout: (fn: () => void) => setTimeout(fn, 0),
      fetch: async () => {
        const status = statuses[calls.length] ?? 200;
        calls.push(status);
        return status === 200
          ? Response.json({
              candidates: [{ content: { parts: [{ text: "{}" }] } }],
            })
          : Response.json({ error: { message: "high demand" } }, { status });
      },
    },
  );
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ matchId: "match" }),
    }),
  );
  return { status: response.status, calls, updates };
}

test("a 503 is retried and the review is written", async () => {
  const { status, calls, updates } = await run([503, 200]);
  expect(status).toBe(200);
  expect(calls).toEqual([503, 200]);
  expect(updates).toEqual([{ insights: {} }]);
});

test("gives up after three attempts", async () => {
  const { status, calls, updates } = await run([503, 429, 500]);
  expect(status).toBe(500);
  expect(calls).toHaveLength(3);
  expect(updates).toEqual([]);
});

test("a non-transient 4xx is not retried", async () => {
  const { status, calls } = await run([400]);
  expect(status).toBe(500);
  expect(calls).toEqual([400]);
});
