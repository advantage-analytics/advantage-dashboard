import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

/**
 * generate-insights writes `matches.insights` under a service-role client, and
 * `verify_jwt` is satisfied by the public anon key — so the function has to
 * decide for itself who is calling, the same way process-match does. The edge
 * function runs in a vm with a stubbed client and Gemini, and every guard is
 * observed from what those stubs are asked to do, in order.
 */
const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const ANON_KEY = "anon-key";
const SERVICE_ROLE_KEY = "service-role-key";
const USER_TOKENS: Record<string, string> = {
  "owner-token": OWNER,
  "stranger-token": STRANGER,
};

async function invoke({
  bearer,
  createdBy = OWNER,
}: {
  bearer?: string;
  createdBy?: string | null;
}) {
  let handler!: (request: Request) => Promise<Response>;
  const events: string[] = [];

  const from = (table: string) => {
    const resolve = () => {
      if (table === "matches") {
        return { data: { created_by: createdBy }, error: null };
      }
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
      select: (fields: string) => {
        events.push(`read:${table}:${fields}`);
        return query;
      },
      eq: () => query,
      is: () => query,
      lt: () => query,
      in: () => query,
      order: () => query,
      update: () => {
        events.push(`update:${table}`);
        return query;
      },
      single: async () => resolve(),
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled),
    });
    return query;
  };

  const createClient = (_url: string, key: string) => ({
    auth: {
      getUser: async (token: string) => {
        events.push(`getUser:${key === ANON_KEY ? "anon" : "service"}`);
        const id = USER_TOKENS[token];
        return id
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
    from,
  });

  const env: Record<string, string> = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    GEMINI_KEY: "gemini-key",
  };
  const source = readFileSync(
    "supabase/functions/generate-insights/index.ts",
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
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
          : { createClient },
      Deno: { env: { get: (key: string) => env[key] } },
      Response,
      console: { ...console, warn: () => {}, error: () => {} },
      fetch: async (url: string) => {
        events.push(
          url.startsWith("https://generativelanguage.googleapis.com/")
            ? "fetch:gemini"
            : `fetch:${url}`,
        );
        return Response.json({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
        });
      },
    },
  );

  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body: JSON.stringify({ matchId: MATCH }),
    }),
  );
  const json = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  return { status: response.status, json, events };
}

test("no bearer is answered 401 before anything is read", async () => {
  const { status, json, events } = await invoke({});
  expect(status).toBe(401);
  expect(json).toEqual({ success: false, error: expect.any(String) });
  expect(events).toEqual([]);
});

test("a garbage bearer is answered 401 after getUser rejects it", async () => {
  // The anon key itself is the bearer an unauthenticated caller would send.
  for (const bearer of ["not-a-user", ANON_KEY]) {
    const { status, json, events } = await invoke({ bearer });
    expect(status, bearer).toBe(401);
    expect(json.success).toBe(false);
    expect(events).toEqual(["getUser:anon"]);
  }
});

test("a signed-in user who is not the uploader is answered 403", async () => {
  const { status, json, events } = await invoke({ bearer: "stranger-token" });
  expect(status).toBe(403);
  expect(json).toEqual({
    success: false,
    error: "You do not have access to this match",
  });
  expect(events).toEqual(["getUser:anon", "read:matches:created_by"]);
});

test("a user cannot write the review of a match with no uploader", async () => {
  const { status, events } = await invoke({
    bearer: "owner-token",
    createdBy: null,
  });
  expect(status).toBe(403);
  expect(events).toEqual(["getUser:anon", "read:matches:created_by"]);
});

test("the service role reaches Gemini and writes the review", async () => {
  const { status, json, events } = await invoke({ bearer: SERVICE_ROLE_KEY });
  expect(status).toBe(200);
  expect(json.success).toBe(true);
  // No getUser and no ownership read: the stats read is the first query.
  expect(events[0]).toBe("read:match_stats_with_percentages:*");
  expect(events).not.toContain("read:matches:created_by");
  expect(events).toContain("fetch:gemini");
  expect(events.at(-1)).toBe("update:matches");
});

test("the uploader's own token reaches Gemini and writes the review", async () => {
  const { status, events } = await invoke({ bearer: "owner-token" });
  expect(status).toBe(200);
  expect(events.slice(0, 3)).toEqual([
    "getUser:anon",
    "read:matches:created_by",
    "read:match_stats_with_percentages:*",
  ]);
  expect(events).toContain("fetch:gemini");
  expect(events.at(-1)).toBe("update:matches");
});
