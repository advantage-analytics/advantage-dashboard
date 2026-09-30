import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import {
  GENERATE_INSIGHTS_ENV,
  MATCH,
  SERVICE_ROLE_KEY,
} from "./fixtures/edge-function-guard-identities";

/**
 * The Advantage Intelligence summary's length is set by the prompt alone —
 * the expanded insight card renders whatever `meta.summary` holds, unclamped.
 * This spec runs generate-insights in a vm, captures the request body the
 * function sends to Gemini and reads the summary instruction out of it, so a
 * change to the cap is visible in a test rather than only in live output.
 * (The guards spec stubs `fetch` by URL only; this one keeps `init.body`.)
 */

const SOURCE = ts.transpileModule(
  readFileSync("supabase/functions/generate-insights/index.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

interface GeminiRequestBody {
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: {
    responseMimeType: string;
    responseSchema: unknown;
    temperature: number;
  };
}

/** Runs the function as the service role and returns what it asked Gemini. */
async function captureGeminiRequest(): Promise<{
  url: string;
  body: GeminiRequestBody;
}> {
  let handler!: (request: Request) => Promise<Response>;
  let captured: { url: string; body: GeminiRequestBody } | null = null;

  const from = (table: string) => {
    const resolve = () => {
      if (table === "match_stats_with_percentages") {
        return {
          data: [{ is_player1: true }, { is_player1: false }],
          error: null,
        };
      }
      return { data: [], error: null };
    };
    const query: Record<string, unknown> = {};
    Object.assign(query, {
      select: () => query,
      eq: () => query,
      is: () => query,
      lt: () => query,
      in: () => query,
      order: () => query,
      update: () => query,
      single: async () => resolve(),
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled),
    });
    return query;
  };

  runInNewContext(SOURCE, {
    exports: {},
    require: (id: string) =>
      id.includes("http/server")
        ? {
            serve: (callback: typeof handler) => {
              handler = callback;
            },
          }
        : {
            createClient: () => ({
              auth: {
                getUser: async () => ({
                  data: { user: null },
                  error: { message: "not expected" },
                }),
              },
              from,
            }),
          },
    Deno: { env: { get: (key: string) => GENERATE_INSIGHTS_ENV[key] } },
    Response,
    console: { ...console, warn: () => {}, error: () => {} },
    fetch: async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        captured = {
          url,
          body: JSON.parse(String(init?.body)) as GeminiRequestBody,
        };
      }
      return Response.json({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
      });
    },
  });

  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ matchId: MATCH }),
    }),
  );
  expect(response.status).toBe(200);
  if (!captured) throw new Error("generate-insights never called Gemini");
  return captured;
}

test("the summary instruction asks for 2-3 sentences under 350 characters", async () => {
  const { body } = await captureGeminiRequest();
  const prompt = body.contents[0].parts[0].text;

  const summaryLine = prompt
    .split("\n")
    .find((line) => line.includes("a 'summary':"));
  expect(summaryLine).toBeDefined();
  expect(summaryLine).toContain("2-3 sentences");
  expect(summaryLine).toContain("under 350 characters");
  expect(prompt).not.toContain("600");
  expect(prompt).not.toContain("4-5");

  // The report card shows the first sentence as a headline and the rest as
  // its description (`splitInsight`), so the headline is the short one and
  // the description stays on the headline's point.
  expect(summaryLine).toContain(
    "The first sentence is the headline: the single most important takeaway from this match",
  );
  expect(summaryLine).toContain("under 90 characters and with no figures");
  expect(summaryLine).toContain("longer than the headline");
  expect(summaryLine).toContain(
    "stay on that same takeaway rather than raising a second topic",
  );
  expect(summaryLine).toContain("Do not greet them");
  expect(summaryLine).toContain("do not use markdown headers or bullet points");
  expect(summaryLine).toContain("do not list stats one after another");
  // The summary quotes this match's own figures inline — without this line
  // flash-lite wrote summaries with no numbers at all.
  expect(summaryLine).toContain(
    "quote the one or two percentages from THIS match",
  );
  expect(summaryLine).toContain("as digits with a percent sign");
  expect(prompt).not.toContain("WITHOUT printing raw numbers");
});

test("the summary names no vendor and speaks of Player 1 / Player 2", async () => {
  const { body } = await captureGeminiRequest();
  const prompt = body.contents[0].parts[0].text;
  // Guardrails §2: customer-facing text names no vendor.
  expect(prompt).not.toMatch(/splitstep|swingvision/i);
  // Guardrails §4: the prompt knows only Player 1 / Player 2; which one the
  // viewer sees is decided by `sides.pick` in the match page, never here.
  expect(prompt).toContain("Player 1");
  expect(prompt).toContain("Player 2");
});

test("the generation config and model are the ones the prompt was tuned for", async () => {
  const { url, body } = await captureGeminiRequest();
  expect(url).toContain("/models/gemini-3.5-flash-lite:generateContent");
  expect(body.generationConfig.temperature).toBe(0.4);
  expect(body.generationConfig.responseMimeType).toBe("application/json");
  expect(body.generationConfig.responseSchema).toMatchObject({
    type: "OBJECT",
    required: ["player1", "player2"],
  });
});
