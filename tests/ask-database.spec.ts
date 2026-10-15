import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  ASK_SERVICE_ROLE_CALLS,
  createAskDatabase,
} from "@/lib/services/ask/database";

/**
 * Offline spec for `src/lib/services/ask/database.ts` — the one place Ask
 * uses the service role.
 *
 * What is pinned: the routing table is exactly three function names; each
 * goes to the service client with the bound viewer in the argument the
 * function reads it from; an identity a caller put in `args` never survives;
 * every other call goes to the user's client with its arguments untouched;
 * and a database cannot be built without a viewer. No network, no Supabase.
 */

const VIEWER = "11111111-0000-4000-8000-000000000001";
const STRANGER = "22222222-0000-4000-8000-000000000002";
const PROGRAM = "eeeeeeee-0000-4000-8000-000000000005";
const USAGE = "aaaaaaaa-0000-4000-8000-000000000001";

type Call = { fn: string; args: Record<string, unknown> | undefined };

function clients(...given: [viewerId?: unknown]) {
  const viewerId = (given.length > 0 ? given[0] : VIEWER) as string;
  const user: Call[] = [];
  const service: Call[] = [];
  const db = createAskDatabase({
    user: {
      rpc: async (fn, args) => {
        user.push({ fn, args });
        return { data: "user", error: null };
      },
    },
    service: {
      rpc: async (fn, args) => {
        service.push({ fn, args });
        return { data: "service", error: null };
      },
    },
    viewerId,
  });
  return { db, user, service };
}

test.describe("createAskDatabase · the routing table", () => {
  test("is exactly the three server-only functions, and cannot be added to at run time", () => {
    expect(ASK_SERVICE_ROLE_CALLS).toEqual({
      ask_run_query: "p_viewer",
      ask_run_team_query: "p_viewer",
      ask_release_question: "p_user_id",
    });
    expect(Object.isFrozen(ASK_SERVICE_ROLE_CALLS)).toBe(true);
  });

  test("the module imports no client factory and touches no table", () => {
    const source = readFileSync("src/lib/services/ask/database.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/supabase\/(admin|server|client)/);
    expect(code).not.toMatch(/\.(from|storage|auth|schema)\b/);
    expect(code).not.toMatch(/process\.env/);
  });
});

test.describe("createAskDatabase · the three service-role calls", () => {
  test("ask_run_query goes to the service client with p_viewer", async () => {
    const { db, user, service } = clients();
    const result = await db.rpc("ask_run_query", {
      scope_sql: "select match_id from ask.matches",
      sql: "select 1",
    });
    expect(result.data).toBe("service");
    expect(user).toEqual([]);
    expect(service).toEqual([
      {
        fn: "ask_run_query",
        args: {
          scope_sql: "select match_id from ask.matches",
          sql: "select 1",
          p_viewer: VIEWER,
        },
      },
    ]);
  });

  test("ask_run_team_query goes to the service client with p_viewer and keeps its program", async () => {
    const { db, user, service } = clients();
    await db.rpc("ask_run_team_query", {
      p_program_id: PROGRAM,
      scope_sql: "s",
      sql: "q",
    });
    expect(user).toEqual([]);
    expect(service).toEqual([
      {
        fn: "ask_run_team_query",
        args: {
          p_program_id: PROGRAM,
          scope_sql: "s",
          sql: "q",
          p_viewer: VIEWER,
        },
      },
    ]);
  });

  test("ask_release_question goes to the service client with p_user_id", async () => {
    const { db, user, service } = clients();
    await db.rpc("ask_release_question", { usage_id: USAGE });
    expect(user).toEqual([]);
    expect(service).toEqual([
      {
        fn: "ask_release_question",
        args: { usage_id: USAGE, p_user_id: VIEWER },
      },
    ]);
  });

  test("an identity a caller put in args is dropped, under either name, for all three", async () => {
    for (const fn of Object.keys(ASK_SERVICE_ROLE_CALLS)) {
      const identityArg = ASK_SERVICE_ROLE_CALLS[fn];
      const { db, service } = clients();
      await db.rpc(fn, {
        p_viewer: STRANGER,
        p_user_id: STRANGER,
        sql: "q",
      });
      expect(service, fn).toEqual([
        { fn, args: { sql: "q", [identityArg]: VIEWER } },
      ]);
      expect(JSON.stringify(service), fn).not.toContain(STRANGER);
    }
  });

  test("the viewer is injected when no args are passed at all, and the caller's object is not mutated", async () => {
    const { db, service } = clients();
    await db.rpc("ask_run_query");
    expect(service[0].args).toEqual({ p_viewer: VIEWER });

    const args = { usage_id: USAGE, p_user_id: STRANGER };
    await db.rpc("ask_release_question", args);
    expect(args).toEqual({ usage_id: USAGE, p_user_id: STRANGER });
    expect(service[1].args).toEqual({ usage_id: USAGE, p_user_id: VIEWER });
  });
});

test.describe("createAskDatabase · everything else", () => {
  test("goes to the user's client with its arguments untouched", async () => {
    const { db, user, service } = clients();
    const saved = { p_question: { text: "q" }, p_answer: {} };
    const results = [
      await db.rpc("ask_reserve_question"),
      await db.rpc("ask_quota"),
      await db.rpc("ask_save_exchange", saved),
      await db.rpc("ask_delete_conversation", { p_conversation_id: USAGE }),
      await db.rpc("some_future_function", { a: 1 }),
    ];
    expect(results.every((result) => result.data === "user")).toBe(true);
    expect(service).toEqual([]);
    expect(user.map((call) => call.fn)).toEqual([
      "ask_reserve_question",
      "ask_quota",
      "ask_save_exchange",
      "ask_delete_conversation",
      "some_future_function",
    ]);
    expect(user[0].args).toBeUndefined();
    expect(user[2].args).toBe(saved);
  });

  test("a name that only resembles a server-only one, or an inherited key, is not routed to the service role", async () => {
    const { db, user, service } = clients();
    for (const fn of [
      "ASK_RUN_QUERY",
      "ask_run_query ",
      "public.ask_run_query",
      "ask_run_query_v2",
      "toString",
      "constructor",
      "__proto__",
      "hasOwnProperty",
    ]) {
      await db.rpc(fn, { sql: "q" });
    }
    expect(service).toEqual([]);
    expect(user).toHaveLength(8);
    expect(JSON.stringify(user)).not.toContain(VIEWER);
  });
});

test.describe("createAskDatabase · the viewer", () => {
  test("must be a uuid: no database is built for a missing or malformed one", () => {
    for (const bad of [
      "",
      "   ",
      "null",
      "not-a-uuid",
      undefined,
      null,
      7,
      {},
    ]) {
      expect(() => clients(bad), String(bad)).toThrow(/viewerId/);
    }
  });
});
