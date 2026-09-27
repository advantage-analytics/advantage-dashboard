import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import {
  ANON_KEY,
  MATCH,
  OWNER,
  SERVICE_ROLE_KEY,
  STRANGER,
  USER_TOKENS,
} from "./fixtures/edge-function-guard-identities";

/**
 * process-match writes under a service-role client, and `verify_jwt` is
 * satisfied by the public anon key — so the function has to decide for itself
 * who is calling, which files it may read and whether the match was already
 * processed. The edge function runs in a vm with a stubbed client, and every
 * guard is observed from what that client is asked to do, in order.
 */
const OWN_FILE = `${OWNER}/swing-vision/${MATCH}/match.xlsx`;

// Transpiled once — the source never changes between tests, only the vm
// context each `invoke()` call runs it in.
const SOURCE = ts.transpileModule(
  readFileSync("supabase/functions/process-match/index.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

async function invoke({
  bearer,
  body,
  existingPoints = [],
  createdBy = OWNER,
}: {
  bearer?: string;
  body: Record<string, unknown>;
  existingPoints?: { id: string }[];
  createdBy?: string | null;
}) {
  let handler!: (request: Request) => Promise<Response>;
  const events: string[] = [];

  const from = (table: string) => {
    const resolve = () => {
      if (table === "matches") {
        return {
          data: {
            source_provider: "swing-vision",
            format: { best_of: 3 },
            created_by: createdBy,
          },
          error: null,
        };
      }
      if (table === "points") return { data: existingPoints, error: null };
      return { data: [], error: null };
    };
    const query: Record<string, unknown> = {};
    Object.assign(query, {
      select: () => {
        events.push(`read:${table}`);
        return query;
      },
      eq: () => query,
      limit: () => query,
      insert: () => {
        events.push(`insert:${table}`);
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
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          events.push(`download:${bucket}/${path}`);
          return { data: null, error: { message: "no such object" } };
        },
      }),
    },
    functions: {
      invoke: async (name: string) => {
        events.push(`invoke:${name}`);
        return { data: null, error: null };
      },
    },
    rpc: async (name: string) => {
      events.push(`rpc:${name}`);
      return { error: null };
    },
  });

  const env: Record<string, string> = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  };
  runInNewContext(SOURCE, {
    exports: {},
    require: (id: string) =>
      id.includes("supabase-js") ? { createClient } : {},
    Deno: {
      serve: (callback: typeof handler) => {
        handler = callback;
      },
      env: { get: (key: string) => env[key] },
    },
    Request,
    Response,
    console: { ...console, log: () => {}, error: () => {} },
  });

  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json()) as { success: boolean; error?: string };
  return { status: response.status, json, events };
}

test("no bearer is answered 401 before anything is read", async () => {
  const { status, json, events } = await invoke({
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(status).toBe(401);
  expect(json).toEqual({ success: false, error: expect.any(String) });
  expect(events).toEqual([]);
});

test("a garbage bearer is answered 401 after getUser rejects it", async () => {
  const { status, events } = await invoke({
    bearer: "not-a-user",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(status).toBe(401);
  expect(events).toEqual(["getUser:anon"]);
});

test("a signed-in user who is not the uploader is answered 403", async () => {
  // The body still names the owner: it must be ignored in favour of the token.
  const { status, json, events } = await invoke({
    bearer: "stranger-token",
    body: { matchId: MATCH, userId: OWNER, fileNames: [OWN_FILE] },
  });
  expect(status).toBe(403);
  expect(json.success).toBe(false);
  expect(events).toEqual(["getUser:anon", "read:matches"]);
});

test("a file outside the caller's folder is answered 400 with no download", async () => {
  for (const fileNames of [
    [`${STRANGER}/swing-vision/${MATCH}/match.xlsx`],
    [OWN_FILE, `${OWNER}/../${STRANGER}/swing-vision/${MATCH}/match.xlsx`],
    [`/${OWNER}/match.xlsx`],
  ]) {
    const { status, json, events } = await invoke({
      bearer: "owner-token",
      body: { matchId: MATCH, fileNames },
    });
    expect(status, fileNames.join()).toBe(400);
    expect(json.success).toBe(false);
    expect(events).toEqual(["getUser:anon", "read:matches"]);
  }
});

test("a match that already has points is answered 409 and nothing runs", async () => {
  const { status, json, events } = await invoke({
    bearer: "owner-token",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    existingPoints: [{ id: "existing-point" }],
  });
  expect(status).toBe(409);
  expect(json).toEqual({
    success: false,
    error: "This match has already been processed",
  });
  expect(events).toEqual(["getUser:anon", "read:matches", "read:points"]);
});

test("the service role with in-folder paths clears every guard", async () => {
  // bucketId is no longer honoured: the download must hit match-data.
  const { status, json, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: {
      matchId: MATCH,
      bucketId: "other-bucket",
      fileNames: [OWN_FILE, "legacy.xlsx"],
    },
  });
  expect(events).toEqual([
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    `download:match-data/${OWNER}/legacy.xlsx`,
  ]);
  // The stub bucket is empty, so processing itself fails — after the guards.
  expect(status).toBe(500);
  expect(json.error).toContain("No Points sheet data");
});

test("the uploader's own token clears every guard", async () => {
  const { events } = await invoke({
    bearer: "owner-token",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(events).toEqual([
    "getUser:anon",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
  ]);
});

test("the service role cannot process a match with no uploader", async () => {
  const { status, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    createdBy: null,
  });
  expect(status).toBe(403);
  expect(events).toEqual(["read:matches"]);
});
