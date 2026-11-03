import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { normalizedPersonName } from "@/lib/data/person-name";
import { GENERATE_INSIGHTS_ENV as ENV } from "./fixtures/edge-function-guard-identities";

const COMPARISON = "Player 1 comparison context";

type Prior = {
  id: string;
  player1_name: string | null;
  first_serve_pct?: number;
};

/**
 * Runs the function with `history` as what the database returns for this
 * account and workspace, newest first, and reports what it then did with it:
 * the filters it asked for, the matches it read stats from, and its prompt.
 */
async function runInsights({
  programId,
  playerName = "Ana Castillo",
  history = [],
}: {
  programId: string | null | undefined;
  playerName?: string | null;
  history?: Prior[];
}) {
  const filters: unknown[][] = [];
  let statsReadFrom: string[] = [];
  const prompts: string[] = [];
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync(
    "supabase/functions/generate-insights/index.ts",
    "utf8",
  );
  const supabase = {
    from(table: string) {
      let selection = "";
      let priorStats: Prior[] | null = null;
      const query = {
        select(fields: string) {
          selection = fields;
          return query;
        },
        eq(field: string, value: unknown) {
          if (table === "matches" && selection.startsWith("id, date"))
            filters.push(["eq", field, value]);
          return query;
        },
        is(field: string, value: unknown) {
          filters.push(["is", field, value]);
          return query;
        },
        in(_field: string, ids: string[]) {
          statsReadFrom = [...ids];
          priorStats = history.filter((m) => ids.includes(m.id));
          return query;
        },
        lt() {
          return query;
        },
        order() {
          return query;
        },
        update() {
          return query;
        },
        single: async () => ({
          data: {
            player1_id: "account",
            player1_name: playerName,
            date: "2026-09-16",
            program_id: programId,
          },
        }),
        then(resolve: (value: unknown) => unknown) {
          let data: unknown[] = [];
          if (table === "matches") data = history;
          else if (priorStats)
            data = priorStats.map((m) => ({
              match_id: m.id,
              first_serve_pct: m.first_serve_pct,
            }));
          else if (table === "match_stats_with_percentages")
            data = [{ is_player1: true }, { is_player1: false }];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
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
          : { createClient: () => supabase },
      Deno: { env: { get: (key: string) => ENV[key] } },
      Response,
      AbortSignal,
      console,
      fetch: async (_url: string, init: { body: string }) => {
        prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
        return Response.json({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
        });
      },
    },
  );
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ matchId: "match" }),
    }),
  );
  expect(response.status).toBe(200);
  return { filters, statsReadFrom, prompt: prompts[0] };
}

test("team insights limit athlete history to the match's program", async () => {
  const { filters } = await runInsights({ programId: "team-a" });
  expect(filters).toEqual([
    ["eq", "player1_id", "account"],
    ["eq", "program_id", "team-a"],
  ]);
});

test("personal insights exclude every team from athlete history", async () => {
  const { filters } = await runInsights({ programId: null });
  expect(filters).toEqual([
    ["eq", "player1_id", "account"],
    ["is", "program_id", null],
  ]);
});

test("unresolved workspace omits comparison history", async () => {
  const { filters } = await runInsights({ programId: undefined });
  expect(filters).toEqual([]);
});

test("a shared account never compares a player with somebody else", async () => {
  const { statsReadFrom, prompt } = await runInsights({
    programId: null,
    playerName: "Ana Castillo",
    history: [
      { id: "bea", player1_name: "Bea Lund", first_serve_pct: 91 },
      { id: "cal", player1_name: "Cal Reyes", first_serve_pct: 92 },
    ],
  });
  expect(statsReadFrom).toEqual([]);
  expect(prompt).not.toContain(COMPARISON);
  expect(prompt).not.toContain("91");
  expect(prompt).not.toContain("92");
});

test("a shared account keeps the player's own earlier matches and only those", async () => {
  const { statsReadFrom, prompt } = await runInsights({
    programId: null,
    playerName: "Ana Castillo",
    history: [
      { id: "bea", player1_name: "Bea Lund", first_serve_pct: 91 },
      { id: "ana-2", player1_name: "Ana Castillo", first_serve_pct: 60 },
      { id: "cal", player1_name: "Cal Reyes", first_serve_pct: 92 },
      { id: "ana-1", player1_name: "Ana Castillo", first_serve_pct: 70 },
    ],
  });
  expect(statsReadFrom).toEqual(["ana-2", "ana-1"]);
  expect(prompt).toContain("across 2 prior matches");
  expect(prompt).toContain('"first_serve_pct":65');
  // The stranger's more recent match is not "the previous match".
  expect(prompt).toContain(
    'Immediately previous match: {"match_id":"ana-2","first_serve_pct":60',
  );
});

test("one earlier match of their own reads as the player's 2nd", async () => {
  const { statsReadFrom, prompt } = await runInsights({
    programId: null,
    playerName: "Ana Castillo",
    history: [
      { id: "bea", player1_name: "Bea Lund", first_serve_pct: 91 },
      { id: "ana-1", player1_name: "Ana Castillo", first_serve_pct: 70 },
    ],
  });
  expect(statsReadFrom).toEqual(["ana-1"]);
  expect(prompt).toContain("only the player's 2nd recorded match");
  expect(prompt).not.toContain("91");
});

test("an account with one player keeps its whole history", async () => {
  const { statsReadFrom, prompt } = await runInsights({
    programId: null,
    playerName: "Dee Park",
    history: [
      { id: "dee-3", player1_name: "Dee Park", first_serve_pct: 50 },
      { id: "dee-2", player1_name: "Dee Park", first_serve_pct: 60 },
      { id: "dee-1", player1_name: "Dee Park", first_serve_pct: 70 },
    ],
  });
  expect(statsReadFrom).toEqual(["dee-3", "dee-2", "dee-1"]);
  expect(prompt).toContain("across 3 prior matches");
  expect(prompt).toContain('"first_serve_pct":60');
});

test("the same name is the app's definition of the same name", async () => {
  const spellings = [
    "Ana Castillo",
    "ana castillo",
    "  ANA   CASTILLO ",
    "Ana\tCastillo",
    "Ana",
    "A. Castillo",
    "Ana Castilla",
  ];
  const { statsReadFrom } = await runInsights({
    programId: null,
    playerName: "Ana Castillo",
    history: spellings.map((name, i) => ({ id: `m${i}`, player1_name: name })),
  });
  const sameName = spellings.flatMap((name, i) =>
    normalizedPersonName(name) === normalizedPersonName("Ana Castillo")
      ? [`m${i}`]
      : [],
  );
  expect(sameName).toEqual(["m0", "m1", "m2", "m3"]);
  expect(statsReadFrom).toEqual(sameName);
});

for (const blank of [null, "", "   "]) {
  test(`a match whose player is named ${JSON.stringify(blank)} gets no comparison`, async () => {
    const { filters, statsReadFrom, prompt } = await runInsights({
      programId: null,
      playerName: blank,
      history: [
        { id: "blank", player1_name: blank, first_serve_pct: 91 },
        { id: "other", player1_name: "Ana Castillo", first_serve_pct: 92 },
      ],
    });
    expect(filters).toEqual([]);
    expect(statsReadFrom).toEqual([]);
    expect(prompt).not.toContain(COMPARISON);
  });
}
