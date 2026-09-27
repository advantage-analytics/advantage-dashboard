import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

/**
 * generate-key-moments runs the `key_moments` RPC and writes
 * `matches.key_moments` under a service-role client, and `verify_jwt` is
 * satisfied by the public anon key — so the function has to decide for itself
 * who is calling, the same way process-match and generate-insights do. The
 * edge function runs in a vm with a stubbed `Deno.serve`, env and client, and
 * every guard is observed from what the client is asked to do, in order.
 *
 * The function's own logic is not exercised: the RPC returns no rows, so the
 * write is an empty array. What matters is that nothing reaches the RPC or the
 * write until the caller has been verified, and that both stay filtered to the
 * body's `match_id`.
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
    const resolve = () =>
      table === "matches"
        ? { data: { created_by: createdBy }, error: null }
        : { data: [], error: null };
    const query: Record<string, unknown> = {};
    Object.assign(query, {
      select: (fields: string) => {
        events.push(`read:${table}:${fields}`);
        return query;
      },
      eq: (column: string, value: unknown) => {
        events.push(`eq:${table}:${column}:${String(value)}`);
        return query;
      },
      update: (value: Record<string, unknown>) => {
        events.push(`update:${table}:${Object.keys(value).join(",")}`);
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      events.push(
        `rpc:${name}:${key === SERVICE_ROLE_KEY ? "service" : "anon"}:${Object.entries(
          args,
        )
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(",")}`,
      );
      return { data: [], error: null };
    },
  });

  // Distinct per key, so the service-role check compares the bearer against
  // the real key rather than a value every key shares.
  const env: Record<string, string> = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  };
  const source = readFileSync(
    "supabase/functions/generate-key-moments/index.ts",
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
      // The live function imports two `jsr:` specifiers: the edge-runtime
      // types (side-effect only) and supabase-js.
      require: (id: string) =>
        id.includes("supabase-js") ? { createClient } : {},
      Deno: {
        serve: (callback: typeof handler) => {
          handler = callback;
        },
        env: { get: (key: string) => env[key] },
      },
      Response,
      console: { ...console, log: () => {}, warn: () => {}, error: () => {} },
    },
  );

  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      // The body contract process-match sends on its chained invoke.
      body: JSON.stringify({ match_id: MATCH }),
    }),
  );
  const json = (await response.json()) as {
    success?: boolean;
    error?: string;
    updated_data?: unknown;
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
  expect(events).toEqual([
    "getUser:anon",
    "read:matches:created_by",
    `eq:matches:id:${MATCH}`,
  ]);
});

test("a user cannot rewrite the key moments of a match with no uploader", async () => {
  const { status, events } = await invoke({
    bearer: "owner-token",
    createdBy: null,
  });
  expect(status).toBe(403);
  expect(events).toEqual([
    "getUser:anon",
    "read:matches:created_by",
    `eq:matches:id:${MATCH}`,
  ]);
});

test("the service role reaches the key_moments RPC and writes the match", async () => {
  const { status, json, events } = await invoke({ bearer: SERVICE_ROLE_KEY });
  expect(status).toBe(200);
  expect(json).toEqual({ success: true, updated_data: [] });
  // No getUser and no ownership read: the RPC is the first database call,
  // filtered to the body's match_id, and the write is filtered the same way.
  expect(events).toEqual([
    `rpc:key_moments:service:target_match_id=${MATCH}`,
    "update:matches:key_moments",
    `eq:matches:id:${MATCH}`,
  ]);
});

test("the uploader's own token reaches the RPC and writes the match", async () => {
  const { status, json, events } = await invoke({ bearer: "owner-token" });
  expect(status).toBe(200);
  expect(json.success).toBe(true);
  expect(events).toEqual([
    "getUser:anon",
    "read:matches:created_by",
    `eq:matches:id:${MATCH}`,
    `rpc:key_moments:service:target_match_id=${MATCH}`,
    "update:matches:key_moments",
    `eq:matches:id:${MATCH}`,
  ]);
});
