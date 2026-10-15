import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  ASK_EMBEDDING_DIMENSIONS,
  ASK_EMBEDDING_MODEL,
  embedText,
  embedTextWith,
  normaliseEmbedding,
} from "@/lib/llm/embeddings";
import { compareSql } from "@/lib/services/ask/compare";
import type { AskRpcClient } from "@/lib/services/ask/database";
import {
  ASK_EXAMPLE_MATCH_ID,
  MAX_ASK_RETRIEVED_EXAMPLES,
  addAskFeedbackExample,
  anonymiseAskExample,
  examplePlanReply,
  readAskExampleRows,
  readAskFeedbackPair,
  retrieveAskExamples,
} from "@/lib/services/ask/examples";
import { ASK_PLAN_EXAMPLE_NAMES } from "@/lib/services/ask/prompts";
import { ASK_REVIEW_SQL } from "@/lib/services/ask/review";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { withEnv } from "./fixtures/with-env";

/**
 * Offline spec for dynamic few-shot from rated answers (roadmap 1.6):
 * `src/lib/llm/embeddings.ts`, `src/lib/services/ask/examples.ts` and the
 * migration that holds the example store. No network, no database: the
 * embeddings client and the two Supabase clients are faked at `.rpc()` /
 * `.embeddings.create()`.
 *
 * What is pinned: an embedding is made only on the Gemini path, is unit
 * length and 768 wide whatever the endpoint answered, and never throws; a
 * saved plan maps back to the reply shape the planner wrote; a shared pair
 * loses its names; retrieval pins the session viewer and answers empty on
 * every failure; the feedback ingest never fails a rating; and the
 * migration grants the retrieval and upsert functions to service_role alone.
 */

const VIEWER = "11111111-0000-4000-8000-000000000001";
const MESSAGE = "00000000-0000-4000-8000-0000000000a1";
const TEAM: AskScope = {
  kind: "team",
  programId: "eeeeeeee-0000-4000-8000-000000000005",
  programName: "Westbrook College",
};

const unit = (seed: number): number[] =>
  normaliseEmbedding(
    Array.from({ length: ASK_EMBEDDING_DIMENSIONS }, (_, i) =>
      Math.sin(seed + i),
    ),
  )!;

type RpcCall = { fn: string; args: Record<string, unknown> | undefined };

function fakeRpc(
  answers: Record<
    string,
    (args: Record<string, unknown> | undefined) => unknown
  >,
) {
  const calls: RpcCall[] = [];
  const client: AskRpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      const answer = answers[fn];
      if (!answer) throw new Error(`unexpected rpc ${fn}`);
      const result = answer(args);
      return result instanceof Error
        ? { data: null, error: { code: "XX000", message: result.message } }
        : { data: result, error: null };
    },
  };
  return { client, calls };
}

// ── Embeddings ──────────────────────────────────────────────────────────────

test.describe("embeddings", () => {
  test("normaliseEmbedding cuts to 768 and scales to unit length; too short or all zero is none", () => {
    const long = Array.from({ length: 3072 }, (_, i) => (i % 7) - 3);
    const cut = normaliseEmbedding(long);
    expect(cut).toHaveLength(ASK_EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(cut!.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 9);
    expect(normaliseEmbedding(long.slice(0, 767))).toBeNull();
    expect(normaliseEmbedding(new Array(768).fill(0))).toBeNull();
    expect(normaliseEmbedding([...new Array(767).fill(1), NaN])).toBeNull();
  });

  test("embedTextWith asks the model for 768 dimensions over one line of text, and normalises what comes back", async () => {
    const seen: unknown[] = [];
    const client = {
      embeddings: {
        create: async (body: unknown) => {
          seen.push(body);
          return {
            data: [{ embedding: Array.from({ length: 1536 }, () => 2) }],
          };
        },
      },
    };
    const vector = await embedTextWith(client, "  How is\n my   serve? ");
    expect(seen).toEqual([
      {
        model: ASK_EMBEDDING_MODEL,
        input: "How is my serve?",
        dimensions: ASK_EMBEDDING_DIMENSIONS,
      },
    ]);
    expect(ASK_EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(vector).toHaveLength(768);
    expect(vector![0]).toBeCloseTo(1 / Math.sqrt(768), 12);
  });

  test("no client, empty text, a short vector or a thrown call is null, never a throw", async () => {
    const warned = console.warn;
    console.warn = () => {};
    try {
      expect(await embedTextWith(null, "x")).toBeNull();
      const short = {
        embeddings: {
          create: async () => ({ data: [{ embedding: [1, 2, 3] }] }),
        },
      };
      expect(await embedTextWith(short, "x")).toBeNull();
      expect(await embedTextWith(short, "   ")).toBeNull();
      const down = {
        embeddings: {
          create: async () => {
            throw new Error("429");
          },
        },
      };
      expect(await embedTextWith(down, "x")).toBeNull();
    } finally {
      console.warn = warned;
    }
  });

  test("embedText is null unless the provider is Gemini with a key: the Anthropic path and mock mode make no call", async () => {
    const keys = [
      "LLM_PROVIDER",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
    ] as const;
    await withEnv(keys, {}, async () => {
      expect(await embedText("How is my serve?")).toBeNull();
    });
    await withEnv(
      keys,
      { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-x" },
      async () => {
        expect(await embedText("How is my serve?")).toBeNull();
      },
    );
    // The openai provider named without its key is mock mode too.
    await withEnv(keys, { LLM_PROVIDER: "openai" }, async () => {
      expect(await embedText("How is my serve?")).toBeNull();
    });
  });
});

// ── The pair ────────────────────────────────────────────────────────────────

test.describe("examplePlanReply", () => {
  test("a planner's own query is shape A; the app's comparisons and the review name their kind and write no sql", () => {
    expect(
      examplePlanReply({
        scopeSql: "select match_id\n  from ask.matches",
        sql: "select  count(*) as n\nfrom scope",
      }),
    ).toBe(
      '{"scope_sql":"select match_id from ask.matches","sql":"select count(*) as n from scope"}',
    );
    for (const [kind, team] of [
      ["opponent", false],
      ["baseline", false],
      ["players", true],
      ["baseline", true],
    ] as const) {
      expect(
        JSON.parse(
          examplePlanReply({
            scopeSql: "select match_id from ask.matches",
            sql: compareSql(kind, team),
          }),
        ),
      ).toEqual({
        compare: kind,
        scope_sql: "select match_id from ask.matches",
      });
    }
    expect(
      JSON.parse(
        examplePlanReply({
          scopeSql: "select match_id from ask.matches",
          sql: ASK_REVIEW_SQL,
        }),
      ),
    ).toEqual({ review: true, scope_sql: "select match_id from ask.matches" });
  });
});

test.describe("anonymiseAskExample", () => {
  test("a name filter and the word it came from become the prompt's placeholders; ids become the worked example's", () => {
    const [playerA, playerB, opponentX] = ASK_PLAN_EXAMPLE_NAMES;
    const out = anonymiseAskExample({
      question:
        "How did Rudy Quan serve against Marek Dvorsky's team, and Emon van Loben Sels?",
      sql: `{"compare":"opponent","scope_sql":"select match_id from ask.matches where player_name ilike '%rudy%' and opponent_name ilike '%marek%' or player_name ilike '%emon%' or match_id in ('3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f', '8a7b6c5d-4e3f-4a2b-8c1d-9e8f7a6b5c4d')"}`,
    });
    expect(out.question).toBe(
      `How did ${playerA} serve against ${opponentX}'s team, and ${playerB}?`,
    );
    expect(out.sql).toBe(
      `{"compare":"opponent","scope_sql":"select match_id from ask.matches where player_name ilike '%${playerA.toLowerCase()}%' and opponent_name ilike '%${opponentX.toLowerCase()}%' or player_name ilike '%${playerB.toLowerCase()}%' or match_id in ('${ASK_EXAMPLE_MATCH_ID}')"}`,
    );
    expect(out.sql).not.toMatch(/rudy|marek|emon|3f1c2a9e|8a7b6c5d/);
  });

  test("a pair that names nobody is returned as it is", () => {
    const pair = {
      question: "How is my second serve this season?",
      sql: '{"scope_sql":"select match_id from ask.matches","sql":"select 1 as n from scope"}',
      source: "eval" as const,
    };
    expect(anonymiseAskExample(pair)).toEqual(pair);
  });
});

test("readAskExampleRows keeps well-formed rows, flattened, and drops the rest", () => {
  expect(
    readAskExampleRows([
      {
        question: " Why\ndid I lose? ",
        sql: '{"review":true}',
        source: "feedback",
      },
      { question: "No source", sql: "{}", source: "elsewhere" },
      { question: "", sql: "{}" },
      { question: "x".repeat(1001), sql: "{}" },
      { question: "No sql" },
      "not a row",
      null,
    ]),
  ).toEqual([
    { question: "Why did I lose?", sql: '{"review":true}', source: "feedback" },
    { question: "No source", sql: "{}" },
  ]);
  expect(readAskExampleRows(null)).toEqual([]);
  expect(readAskExampleRows({ question: "q", sql: "s" })).toEqual([]);
});

// ── Retrieval ───────────────────────────────────────────────────────────────

test.describe("retrieveAskExamples", () => {
  test("calls ask_similar_examples with the scope, the limit and the session viewer pinned", async () => {
    const vector = unit(1);
    const { client, calls } = fakeRpc({
      ask_similar_examples: () => [
        { question: "A?", sql: "{}", source: "seed", similarity: 0.9 },
        { question: "B?", sql: "{}", source: "feedback", similarity: 0.8 },
      ],
    });
    const examples = await retrieveAskExamples({
      service: client,
      viewerId: VIEWER,
      scope: TEAM,
      embedding: Promise.resolve(vector),
    });
    expect(examples).toEqual([
      { question: "A?", sql: "{}", source: "seed" },
      { question: "B?", sql: "{}", source: "feedback" },
    ]);
    expect(calls).toEqual([
      {
        fn: "ask_similar_examples",
        args: {
          p_embedding: vector,
          p_scope: "team",
          p_limit: MAX_ASK_RETRIEVED_EXAMPLES,
          p_viewer: VIEWER,
        },
      },
    ]);
    expect(MAX_ASK_RETRIEVED_EXAMPLES).toBe(3);
  });

  test("no embedding, a rejected embedding, a refused function or a thrown call: empty, and no call where there is nothing to send", async () => {
    const warned = console.warn;
    console.warn = () => {};
    try {
      const none = fakeRpc({});
      for (const embedding of [
        null,
        Promise.resolve(null),
        Promise.reject(new Error("embedding down")),
      ]) {
        expect(
          await retrieveAskExamples({
            service: none.client,
            viewerId: VIEWER,
            scope: PERSONAL_ASK_SCOPE,
            embedding,
          }),
        ).toEqual([]);
      }
      expect(none.calls).toEqual([]);

      const refused = fakeRpc({
        ask_similar_examples: () => new Error("permission denied"),
      });
      expect(
        await retrieveAskExamples({
          service: refused.client,
          viewerId: VIEWER,
          scope: PERSONAL_ASK_SCOPE,
          embedding: unit(2),
        }),
      ).toEqual([]);

      const thrown: AskRpcClient = {
        rpc: async () => {
          throw new Error("connection reset");
        },
      };
      expect(
        await retrieveAskExamples({
          service: thrown,
          viewerId: VIEWER,
          scope: PERSONAL_ASK_SCOPE,
          embedding: unit(2),
        }),
      ).toEqual([]);
    } finally {
      console.warn = warned;
    }
  });

  test("a viewer that is not a uuid stops here, before anything is sent", async () => {
    const { client, calls } = fakeRpc({});
    await expect(
      retrieveAskExamples({
        service: client,
        viewerId: "me",
        scope: PERSONAL_ASK_SCOPE,
        embedding: unit(3),
      }),
    ).rejects.toThrow(/session user id/);
    expect(calls).toEqual([]);
  });
});

// ── The feedback ingest ─────────────────────────────────────────────────────

test.describe("addAskFeedbackExample", () => {
  test("reads the pair as the user, embeds the question, writes the example as the user's own", async () => {
    const vector = unit(4);
    const { client, calls } = fakeRpc({
      ask_feedback_pair: () => ({
        question: "Why do I keep losing to Marek?",
        sql: ASK_REVIEW_SQL,
        scope_sql: "select match_id from ask.matches",
        program_id: null,
      }),
      ask_example_from_feedback: () => MESSAGE,
    });
    const embedded: string[] = [];
    const outcome = await addAskFeedbackExample({
      user: client,
      messageId: MESSAGE,
      embed: async (text) => {
        embedded.push(text);
        return vector;
      },
    });
    expect(outcome).toBe("added");
    expect(embedded).toEqual(["Why do I keep losing to Marek?"]);
    expect(calls).toEqual([
      { fn: "ask_feedback_pair", args: { p_message_id: MESSAGE } },
      {
        fn: "ask_example_from_feedback",
        args: {
          p_message_id: MESSAGE,
          p_sql:
            '{"review":true,"scope_sql":"select match_id from ask.matches"}',
          p_embedding: vector,
        },
      },
    ]);
  });

  test("nothing to learn from is skipped; a refused read or write is failed; neither throws", async () => {
    const warned = console.warn;
    console.warn = () => {};
    try {
      const nothing = fakeRpc({ ask_feedback_pair: () => null });
      expect(
        await addAskFeedbackExample({
          user: nothing.client,
          messageId: MESSAGE,
          embed: async () => unit(5),
        }),
      ).toBe("skipped");
      expect(nothing.calls.map((call) => call.fn)).toEqual([
        "ask_feedback_pair",
      ]);

      const noEmbedding = fakeRpc({
        ask_feedback_pair: () => ({
          question: "Q?",
          sql: "select 1 as n from scope",
          scope_sql: "select match_id from ask.matches",
        }),
      });
      expect(
        await addAskFeedbackExample({
          user: noEmbedding.client,
          messageId: MESSAGE,
          embed: async () => null,
        }),
      ).toBe("skipped");

      const refused = fakeRpc({
        ask_feedback_pair: () => new Error("permission denied"),
      });
      expect(
        await addAskFeedbackExample({
          user: refused.client,
          messageId: MESSAGE,
          embed: async () => unit(5),
        }),
      ).toBe("failed");

      const thrown: AskRpcClient = {
        rpc: async () => {
          throw new Error("connection reset");
        },
      };
      expect(
        await addAskFeedbackExample({
          user: thrown,
          messageId: MESSAGE,
          embed: async () => unit(5),
        }),
      ).toBe("failed");
    } finally {
      console.warn = warned;
    }
  });

  test("readAskFeedbackPair needs the question and both queries", () => {
    expect(
      readAskFeedbackPair({
        question: " Q? ",
        sql: "select 1",
        scope_sql: "select 2",
        program_id: null,
      }),
    ).toEqual({ question: "Q?", sql: "select 1", scopeSql: "select 2" });
    for (const value of [
      null,
      { question: "", sql: "s", scope_sql: "t" },
      { question: "q", sql: " ", scope_sql: "t" },
      { question: "q", sql: "s" },
    ]) {
      expect(readAskFeedbackPair(value)).toBeNull();
    }
  });
});

// ── The migration ───────────────────────────────────────────────────────────

test("the migration keeps the store reachable only through its functions, service_role alone for retrieval and upsert", () => {
  const sql = readFileSync(
    "supabase/migrations/20261015094614_ask_examples.sql",
    "utf8",
  );
  expect(sql).toContain(
    "create extension if not exists vector with schema extensions",
  );
  expect(sql).toContain("embedding extensions.vector(768) not null");
  expect(sql).toMatch(/using hnsw \(embedding extensions\.vector_cosine_ops\)/);
  expect(sql).toContain(
    "alter table public.ask_examples enable row level security;",
  );
  expect(sql).toContain(
    "revoke all on table public.ask_examples from public, anon, authenticated, service_role;",
  );
  expect(sql).not.toMatch(/create policy/);
  for (const fn of [
    "ask_similar_examples(extensions.vector, text, integer, uuid)",
    "ask_example_upsert(text, text, text, text, integer, extensions.vector, uuid, uuid)",
  ]) {
    expect(sql).toContain(
      `revoke execute on function public.${fn}\n  from public, anon, authenticated;`,
    );
    expect(sql).toContain(
      `grant execute on function public.${fn}\n  to service_role;`,
    );
  }
  // Retrieval is the viewer's own rows and the shared ones, nobody else's.
  expect(sql).toContain("and (e.user_id is null or e.user_id = p_viewer)");
  // The user-run pair functions check the caller.
  expect(sql.match(/\(select auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(
    2,
  );
  expect(sql).toContain(
    "after update of rating or delete on public.ask_feedback",
  );
  expect(sql).toMatch(/-- VERIFIED 2026-10-15/);
});
