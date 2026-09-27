import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

async function historyFilters(programId: string | null | undefined) {
  const filters: unknown[][] = [];
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync(
    "supabase/functions/generate-insights/index.ts",
    "utf8",
  );
  const supabase = {
    from(table: string) {
      let selection = "";
      const query = {
        select(fields: string) {
          selection = fields;
          return query;
        },
        eq(field: string, value: unknown) {
          if (table === "matches" && selection === "id, date")
            filters.push(["eq", field, value]);
          return query;
        },
        is(field: string, value: unknown) {
          filters.push(["is", field, value]);
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
            player1_id: "athlete",
            date: "2026-09-16",
            program_id: programId,
          },
        }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({
            data:
              table === "match_stats_with_percentages"
                ? [{ is_player1: true }, { is_player1: false }]
                : [],
            error: null,
          }).then(resolve);
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
      Deno: { env: { get: () => "stub" } },
      Response,
      console,
      fetch: async () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
        }),
    },
  );
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ matchId: "match" }),
    }),
  );
  expect(response.status).toBe(200);
  return filters;
}

test("team insights limit athlete history to the match's program", async () => {
  expect(await historyFilters("team-a")).toEqual([
    ["eq", "player1_id", "athlete"],
    ["eq", "program_id", "team-a"],
  ]);
});

test("personal insights exclude every team from athlete history", async () => {
  expect(await historyFilters(null)).toEqual([
    ["eq", "player1_id", "athlete"],
    ["is", "program_id", null],
  ]);
});

test("unresolved workspace omits comparison history", async () => {
  expect(await historyFilters(undefined)).toEqual([]);
});
