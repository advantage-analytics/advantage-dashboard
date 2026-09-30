import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { splitInsight } from "../src/components/dashboard/matches/match-detail/insight-text";
import {
  GENERATE_INSIGHTS_ENV,
  MATCH,
  SERVICE_ROLE_KEY,
} from "./fixtures/edge-function-guard-identities";

/**
 * The Advantage Intelligence summary is written as a headline and a
 * description, and `summary` is composed from them so the report card's
 * `splitInsight` lands exactly on the headline. This spec runs
 * generate-insights in a vm with scripted Gemini replies, captures what the
 * function asks Gemini and what it saves, so the prompt's rules and the
 * check-and-retry around them are visible in a test rather than only in live
 * output. (The guards spec stubs `fetch` by URL only; this one keeps
 * `init.body`.)
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

type PlayerReply = {
  focus?: string;
  headline?: string;
  description?: string;
  summary?: string;
};
type Reply = { player1?: PlayerReply; player2?: PlayerReply };

/** A reply whose headlines and descriptions pass the function's check. */
const GOOD_REPLY: Reply = {
  player1: {
    focus: "second-serve points won",
    headline: "Your second serve held firm under pressure.",
    description:
      "You won 67% of second-serve points and saved 70% of break points, so keep trusting that kick serve when the score gets tight.",
  },
  player2: {
    focus: "first-serve points won",
    headline: "Your first serve set up your best tennis.",
    description:
      "You won 66% of first-serve points, so build your service games around landing more first serves in the deuce court.",
  },
};

/**
 * Runs the function as the service role, answering each Gemini call with the
 * next of `replies` (the last one repeats), and returns every request it made
 * and the insights it saved.
 */
async function runWithReplies(replies: Reply[] = [{}]): Promise<{
  requests: { url: string; body: GeminiRequestBody }[];
  saved: Record<string, PlayerReply> | null;
}> {
  let handler!: (request: Request) => Promise<Response>;
  const requests: { url: string; body: GeminiRequestBody }[] = [];
  let saved: Record<string, PlayerReply> | null = null;

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
      update: (values: { insights: Record<string, PlayerReply> }) => {
        saved = values.insights;
        return query;
      },
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
        requests.push({
          url,
          body: JSON.parse(String(init?.body)) as GeminiRequestBody,
        });
        const reply = replies[Math.min(requests.length, replies.length) - 1];
        return Response.json({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(reply) }] } },
          ],
        });
      }
      return Response.json({});
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
  if (requests.length === 0) {
    throw new Error("generate-insights never called Gemini");
  }
  return { requests, saved };
}

/** The first request the function sent to Gemini. */
async function captureGeminiRequest() {
  const { requests } = await runWithReplies([GOOD_REPLY]);
  return requests[0];
}

/** The prompt line that introduces one of the summary's fields. */
function fieldLine(prompt: string, field: string): string {
  const line = prompt.split("\n").find((l) => l.includes(`- a '${field}':`));
  if (!line) throw new Error(`the prompt has no '${field}' instruction`);
  return line;
}

test("the prompt asks for a focus, a short headline and a longer description", async () => {
  const { body } = await captureGeminiRequest();
  const prompt = body.contents[0].parts[0].text;

  expect(fieldLine(prompt, "focus")).toContain(
    "the headline and description are both about it and nothing else",
  );

  const headline = fieldLine(prompt, "headline");
  expect(headline).toContain("one sentence, under 90 characters");
  expect(headline).toContain("with no figures");
  expect(headline).toContain("the single most important takeaway");

  const description = fieldLine(prompt, "description");
  expect(description).toContain("longer than the headline");
  expect(description).toContain("under 350 characters together with it");
  // The description quotes this match's own figures inline — without this
  // flash-lite wrote summaries with no numbers at all.
  expect(description).toContain(
    "Quote the one or two percentages from THIS match that prove the headline",
  );
  // The stat cards round, so the summary must too, or the two disagree by 1.
  expect(description).toContain("rounded to the nearest whole number");
  expect(description).toContain("as digits with a percent sign");
  expect(description).toContain("Stay on the focus: no second topic");
  expect(description).toContain("Do not greet them");
  expect(description).toContain("do not use markdown headers or bullet points");
  expect(description).toContain("do not list stats one after another");

  expect(prompt).not.toContain("a 'summary':");
  expect(prompt).not.toContain("WITHOUT printing raw numbers");
  expect(prompt).not.toContain("600");
  expect(prompt).not.toContain("4-5");
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
    properties: {
      player1: {
        required: [
          "focus",
          "headline",
          "description",
          "strengths",
          "weaknesses",
        ],
        // The model names its subject before writing about it.
        propertyOrdering: [
          "focus",
          "headline",
          "description",
          "strengths",
          "weaknesses",
        ],
      },
    },
  });
});

test("a valid reply is saved after one call, its summary split exactly on the headline", async () => {
  const { requests, saved } = await runWithReplies([GOOD_REPLY]);
  expect(requests).toHaveLength(1);
  for (const key of ["player1", "player2"] as const) {
    const player = saved?.[key];
    expect(player?.summary).toBe(
      `${GOOD_REPLY[key]!.headline} ${GOOD_REPLY[key]!.description}`,
    );
    // The card's own splitter recovers the two fields.
    expect(splitInsight(player!.summary!)).toEqual({
      claim: GOOD_REPLY[key]!.headline,
      evidence: GOOD_REPLY[key]!.description,
    });
  }
});

test("a headline that quotes a figure is asked for again, and the retry is saved", async () => {
  const bad: Reply = {
    ...GOOD_REPLY,
    player1: {
      ...GOOD_REPLY.player1,
      headline: "You won 67% of second-serve points under pressure.",
    },
  };
  const { requests, saved } = await runWithReplies([bad, GOOD_REPLY]);
  expect(requests).toHaveLength(2);
  expect(requests[1].body.contents[0].parts[0].text).toContain(
    "A previous answer was rejected because player1: a headline quotes a figure",
  );
  expect(saved?.player1?.headline).toBe(GOOD_REPLY.player1!.headline);
});

test("a reply still off after the retry is saved anyway, never dropped", async () => {
  const twoSentences: Reply = {
    ...GOOD_REPLY,
    player2: {
      ...GOOD_REPLY.player2,
      headline: "Strong serving. It carried you.",
    },
  };
  const { requests, saved } = await runWithReplies([twoSentences]);
  expect(requests).toHaveLength(2);
  expect(saved?.player2?.summary).toBe(
    `Strong serving. It carried you. ${GOOD_REPLY.player2!.description}`,
  );
});
