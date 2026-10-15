import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AskDatabase } from "@/lib/services/ask/ask";
import {
  ASK_NEEDS_SESSION_MESSAGE,
  type McpCaller,
} from "@/lib/services/mcp/auth";
import * as rateLimit from "@/lib/services/mcp/rate-limit";
import type { AskMcpContext } from "@/lib/services/mcp/server";
import { createLoader } from "./fixtures/vm-modules";
import { withEnv } from "./fixtures/with-env";

/**
 * Offline spec for `POST /api/mcp` (docs/ask-mcp-connector.md): the HTTP
 * ladder, the tools over JSON-RPC, and the service-role boundary.
 *
 * The route file is loaded through `createLoader` with only its edges
 * faked — token verification and the user's `.rpc()`
 * (`@/lib/supabase/bearer`), the service-role client's `.rpc()`
 * (`@/lib/supabase/admin` — anything else read off it throws), the provider
 * and PostHog (`@/lib/llm/adapter`), the two user-side table reads
 * (`@/lib/services/mcp/user-reads`) and the shared rate limiter. Everything
 * between them is the real code: the MCP SDK's transport and server,
 * `checkAskSql()`, `createAskDatabase()`, `askQuestion()` in mock mode, the
 * cache and the run record. No network, no Supabase, no provider.
 *
 * What is pinned: a missing token and a refused one are 401s carrying the
 * `WWW-Authenticate` the MCP spec wants, before anything is built; a good
 * token lists the four tools; a query the guard refuses never reaches the
 * database; a query that runs goes to the service client with the TOKEN's
 * user as the viewer and nothing else; membership is checked before a
 * program's rows are read; the two limits refuse by name; `ask` runs the
 * whole question and spends nothing in mock mode; and a personal-access-
 * token caller is refused `ask` and nothing else.
 */

const ROUTE = "src/app/api/mcp/route.ts";
const SERVER = "src/lib/services/mcp/server.ts";
const URL_ = "http://localhost/api/mcp";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.good.token";

const USER_ID = "11111111-0000-4000-8000-000000000001";
const USAGE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const SAVED_ID = "cccccccc-0000-4000-8000-000000000003";
const ANSWER_ID = "00000000-0000-4000-8000-0000000000a1";
const MATCH_A = "3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f";
const MATCH_B = "8a7b6c5d-4e3f-4a2b-8c1d-9e8f7a6b5c4d";
const PROGRAM_ID = "eeeeeeee-0000-4000-8000-000000000005";
const OTHER_PROGRAM_ID = "ffffffff-0000-4000-8000-000000000006";

const LIMIT_ERROR = {
  code: "54000",
  message: "ask_limit_reached: 20 questions this month, resets on 2026-11-01",
};

/** What `ask_run_query` answers: two matches in scope and one aggregate row. */
const QUERY_ANSWER = {
  matches: [
    {
      match_id: MATCH_A,
      opponent_name: "Anna Lee",
      played_on: "2026-09-14",
      i_won: true,
      score_text: "6-4 6-3",
    },
    {
      match_id: MATCH_B,
      opponent_name: "Bea Ortiz",
      played_on: "2026-08-02",
      i_won: false,
      score_text: "3-6 4-6",
    },
  ],
  rows: [{ matches: 2, wins: 1, losses: 1, second_serve_won_pct: 55.5 }],
};

/** What the `list_matches` query answers: the same two matches as rows. */
const LIST_ANSWER = {
  matches: QUERY_ANSWER.matches,
  rows: [
    {
      match_id: MATCH_A,
      played_on: "2026-09-14",
      opponent_name: "Anna Lee",
      score_text: "6-4 6-3",
      i_won: true,
      source: "video",
      tournament: null,
      match_type: "Tournament",
      has_stats: true,
    },
    {
      match_id: MATCH_B,
      played_on: "2026-08-02",
      opponent_name: "Bea Ortiz",
      score_text: "3-6 4-6",
      i_won: false,
      source: "swingvision",
      tournament: "Fall Open",
      match_type: null,
      has_stats: true,
    },
  ],
};

// ── The faked edges ─────────────────────────────────────────────────────────

type RpcResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

interface World {
  /** Which token `verifyBearerUser()` accepts; anything else is refused. */
  goodToken: string;
  configured: boolean;
  serviceKey: boolean;
  programs: { id: string; name: string }[];
  rpc: Record<string, (args: unknown) => RpcResult>;
  limiter: rateLimit.RateLimiter;
  llm: () => Promise<AsyncIterable<string>>;
}

interface Calls {
  rpc: { fn: string; args: unknown; via: "user" | "service" }[];
  verify: string[];
  adminBuilt: number;
  reads: string[];
  llm: number;
  captured: { event: string; properties: Record<string, unknown> }[];
}

/** The service's reply to any SQL: the `list_matches` query gets rows shaped as the view, anything else the aggregate. */
function answerQuery(args: unknown): RpcResult {
  const sql = (args as { sql?: string }).sql ?? "";
  return {
    data: /from ask\.matches m join scope/.test(sql)
      ? LIST_ANSWER
      : QUERY_ANSWER,
    error: null,
  };
}

function world(overrides: Partial<World> = {}): World {
  return {
    goodToken: TOKEN,
    configured: false,
    serviceKey: true,
    programs: [{ id: PROGRAM_ID, name: "Westbrook College" }],
    limiter: rateLimit.createRateLimiter(),
    rpc: {
      ask_mcp_count_call: () => ({ data: 1, error: null }),
      ask_run_query: answerQuery,
      ask_run_team_query: answerQuery,
      ask_reserve_question: () => ({
        data: { usage_id: USAGE_ID, used: 5, cap: 20, resets_on: "2026-11-01" },
        error: null,
      }),
      ask_release_question: () => ({ data: true, error: null }),
      ask_save_exchange_ids: () => ({
        data: { conversation_id: SAVED_ID, answer_id: ANSWER_ID },
        error: null,
      }),
      ask_quota: () => ({
        data: { used: 0, cap: 20, resets_on: "2026-11-01" },
        error: null,
      }),
      ask_record_run: () => ({ data: "run-1", error: null }),
      ask_data_version: () => ({ data: "v1", error: null }),
      ask_cache_get: () => ({ data: null, error: null }),
      ask_cache_put: () => ({ data: null, error: null }),
    },
    llm: async () => {
      throw new Error("provider down");
    },
    ...overrides,
  };
}

function fakes(state: World) {
  const calls: Calls = {
    rpc: [],
    verify: [],
    adminBuilt: 0,
    reads: [],
    llm: 0,
    captured: [],
  };
  const rpcVia =
    (via: "user" | "service") => async (fn: string, args: unknown) => {
      calls.rpc.push({ fn, args, via });
      const answer = state.rpc[fn];
      if (!answer) throw new Error(`unexpected rpc ${fn}`);
      return answer(args);
    };
  const userClient = {
    rpc: rpcVia("user"),
    from: () => {
      throw new Error("the user-side table reads are stubbed");
    },
  };
  const stubs: Record<string, unknown> = {
    "@/lib/supabase/bearer": {
      verifyBearerUser: async (token: string) => {
        calls.verify.push(token);
        return token === state.goodToken
          ? {
              client: userClient,
              user: { id: USER_ID, aud: "authenticated", email: "p@x.test" },
            }
          : null;
      },
      createBearerClient: () => {
        throw new Error(
          "the route verifies, it does not build a client itself",
        );
      },
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        if (!state.serviceKey) {
          throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY environment variable is required for admin operations",
          );
        }
        calls.adminBuilt += 1;
        return new Proxy(
          { rpc: rpcVia("service") },
          {
            get(target, property) {
              if (property === "rpc") return target.rpc;
              throw new Error(
                `the service-role client is for rpc() only, not .${String(property)}`,
              );
            },
          },
        );
      },
      lazyAdminClient: () => {
        throw new Error("the route builds the service-role client eagerly");
      },
    },
    "@/lib/llm/adapter": {
      isLLMConfigured: () => state.configured,
      createLLMObservabilityContext: () => ({}),
      getLLMStream: async () => {
        calls.llm += 1;
        return state.llm();
      },
      getPostHogServerClient: () => ({
        capture: (event: {
          event: string;
          properties: Record<string, unknown>;
        }) => {
          calls.captured.push({
            event: event.event,
            properties: event.properties,
          });
        },
      }),
      flushPostHogAfterResponse: () => undefined,
    },
    "@/lib/services/mcp/user-reads": {
      createMcpUserReads: (_client: unknown, userId: string) => ({
        program: async (id: string) => {
          calls.reads.push(`program:${id}:${userId}`);
          return state.programs.find((program) => program.id === id) ?? null;
        },
        conversation: async (id: string) => {
          calls.reads.push(`conversation:${id}`);
          return null;
        },
      }),
    },
    "@/lib/services/mcp/rate-limit": {
      ...rateLimit,
      sharedRateLimiter: () => state.limiter,
    },
  };
  const loader = createLoader({
    stubs,
    globals: {
      URL,
      Request,
      Response,
      Headers,
      ReadableStream,
      TextEncoder,
      TextDecoder,
      Error,
      AbortSignal,
    },
  });
  return { calls, loader, userClient };
}

function loadRoute(state: World) {
  const { calls, loader } = fakes(state);
  const route = loader.load(ROUTE) as {
    POST: (request: Request) => Promise<Response>;
    GET: () => Promise<Response>;
    DELETE: () => Promise<Response>;
    runtime: unknown;
    dynamic: unknown;
    maxDuration: unknown;
  };
  return { route, calls };
}

// ── JSON-RPC over HTTP ──────────────────────────────────────────────────────

function post(
  body: unknown,
  headers: Record<string, string | null> = {},
): Request {
  const merged: Record<string, string | null> = {
    // A real request always carries its host; the route reads its origin
    // from it (`originFromHeaders`) for the metadata URL in the 401.
    host: "localhost",
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    authorization: `Bearer ${TOKEN}`,
    "mcp-protocol-version": "2025-06-18",
    ...headers,
  };
  const sent = new Headers();
  for (const [name, value] of Object.entries(merged)) {
    if (value !== null) sent.set(name, value);
  }
  return new Request(URL_, {
    method: "POST",
    headers: sent,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
};

async function rpcResult<T>(response: Response): Promise<T> {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = (await response.json()) as
    { result?: T; error?: unknown } | { result?: T; error?: unknown }[];
  const message = Array.isArray(body) ? body[0] : body;
  expect(message.error).toBeUndefined();
  return message.result as T;
}

let nextId = 1;

async function callTool(
  route: { POST: (request: Request) => Promise<Response> },
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  return rpcResult<ToolResult>(
    await route.POST(
      post({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    ),
  );
}

async function listTools(route: {
  POST: (request: Request) => Promise<Response>;
}) {
  return rpcResult<{ tools: { name: string }[] }>(
    await route.POST(
      post({ jsonrpc: "2.0", id: nextId++, method: "tools/list" }),
    ),
  );
}

function textOf(result: ToolResult): string {
  return result.content.map((part) => part.text ?? "").join("\n");
}

async function refused(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return (await response.json()) as {
    error: string;
    code: string;
    detail?: unknown;
  };
}

const serviceCalls = (calls: Calls) =>
  calls.rpc.filter((call) => call.via === "service");
const userCalls = (calls: Calls) =>
  calls.rpc.filter((call) => call.via === "user");

// ── Segment config ──────────────────────────────────────────────────────────

test.describe("POST /api/mcp · the route file", () => {
  test("runs on node for a minute, never cached, and exports the three handlers", () => {
    const { route } = loadRoute(world());
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.maxDuration).toBe(60);
    expect(Object.keys(route).sort()).toEqual([
      "DELETE",
      "GET",
      "POST",
      "dynamic",
      "maxDuration",
      "runtime",
    ]);
  });

  test("GET and DELETE are 405: stateless, so no stream and no session", async () => {
    const { route } = loadRoute(world());
    for (const response of [await route.GET(), await route.DELETE()]) {
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect((await refused(response)).code).toBe("method_not_allowed");
    }
  });
});

// ── The auth ladder ─────────────────────────────────────────────────────────

test.describe("POST /api/mcp · the auth ladder", () => {
  test("no token: 401 with the resource metadata in WWW-Authenticate, nothing verified, nothing built", async () => {
    const { route, calls } = loadRoute(world());
    const response = await route.POST(
      post(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: null },
      ),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="Advantage Ask", resource_metadata="http://localhost/.well-known/oauth-protected-resource/api/mcp"',
    );
    const body = await refused(response);
    expect(body.code).toBe("unauthenticated");
    expect(body.error).toBe("Sign in to use the Advantage connector.");
    expect(body.detail).toBe("no_token");
    expect(calls.verify).toEqual([]);
    expect(calls.adminBuilt).toBe(0);
    expect(calls.rpc).toEqual([]);
  });

  test("a Basic header is no token", async () => {
    const { route, calls } = loadRoute(world());
    const response = await route.POST(
      post(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Basic abc" },
      ),
    );
    expect(response.status).toBe(401);
    expect(calls.verify).toEqual([]);
  });

  test("a token Supabase Auth refuses: 401 naming invalid_token, and the database is never reached", async () => {
    const { route, calls } = loadRoute(world());
    const response = await route.POST(
      post(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Bearer not.the.token" },
      ),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    );
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="http://localhost/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect((await refused(response)).detail).toBe("invalid_token");
    expect(calls.verify).toEqual(["not.the.token"]);
    expect(calls.adminBuilt).toBe(0);
    expect(calls.rpc).toEqual([]);
  });

  test("a token not shaped like a JWT: 401 invalid_token, and Supabase Auth is never asked", async () => {
    for (const authorization of [
      "Bearer junk",
      "Bearer a.b",
      "Bearer a.b.c.d",
      "Bearer a+b.c/d.e",
      `Bearer ${"a".repeat(4000)}.${"b".repeat(4000)}.${"c".repeat(200)}`,
    ]) {
      const { route, calls } = loadRoute(world());
      const response = await route.POST(
        post(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { authorization },
        ),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        'error="invalid_token"',
      );
      expect((await refused(response)).detail).toBe("invalid_token");
      expect(calls.verify).toEqual([]);
      expect(calls.adminBuilt).toBe(0);
    }
  });

  test("the 401 names the configured site, not a Host header the caller set", async () => {
    await withEnv(
      ["NEXT_PUBLIC_SITE_URL"],
      { NEXT_PUBLIC_SITE_URL: "https://app.example.com/" },
      async () => {
        const { route } = loadRoute(world());
        const response = await route.POST(
          post(
            { jsonrpc: "2.0", id: 1, method: "tools/list" },
            {
              authorization: null,
              host: "evil.example",
              "x-forwarded-host": "evil.example",
            },
          ),
        );
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toContain(
          'resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/mcp"',
        );
      },
    );
  });

  test("a good token with no service key: 500 before any tool runs", async () => {
    const { route, calls } = loadRoute(world({ serviceKey: false }));
    const response = await route.POST(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );
    expect(response.status).toBe(500);
    expect((await refused(response)).code).toBe("internal_error");
    expect(calls.verify).toEqual([TOKEN]);
    expect(calls.rpc).toEqual([]);
  });

  test("a good token: initialize names the server, and the four tools are listed", async () => {
    const { route, calls } = loadRoute(world());
    const initialized = await rpcResult<{
      serverInfo: { name: string };
      instructions?: string;
    }>(
      await route.POST(
        post(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "spec", version: "1" },
            },
          },
          { "mcp-protocol-version": null },
        ),
      ),
    );
    expect(initialized.serverInfo.name).toBe("advantage-ask");
    expect(initialized.instructions).toContain("describe_views");

    const listed = await listTools(route);
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "ask",
      "describe_views",
      "list_matches",
      "run_query",
    ]);
    expect(calls.verify).toEqual([TOKEN, TOKEN]);
    // Listing is not a tool call: nothing counted, nothing queried.
    expect(calls.rpc).toEqual([]);
  });
});

// ── describe_views and list_matches ─────────────────────────────────────────

test.describe("POST /api/mcp · describe_views and list_matches", () => {
  test("describe_views answers the schema text with no hidden column, and counts the call as the user", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "describe_views");
    expect(result.isError).toBeUndefined();
    const described = textOf(result);
    expect(described).toContain("ask.point_plays");
    expect(described).toContain("side");
    expect(described).not.toContain("video_time");
    expect(calls.rpc).toEqual([
      { fn: "ask_mcp_count_call", args: undefined, via: "user" },
    ]);
    expect(calls.captured.map((c) => c.event)).toEqual(["mcp_tool_call"]);
    expect(calls.captured[0].properties).toMatchObject({
      tool: "describe_views",
      ok: true,
      error_code: null,
      auth: "session",
    });
  });

  test("list_matches reads ask.matches through the service client with the token's user as viewer", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "list_matches");
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      scope: string;
      count: number;
      matches: Record<string, unknown>[];
    };
    expect(structured.scope).toBe("personal");
    expect(structured.count).toBe(2);
    expect(structured.matches[0]).toEqual({
      match_id: MATCH_A,
      played_on: "2026-09-14",
      opponent: "Anna Lee",
      score: "6-4 6-3",
      i_won: true,
      source: "video",
      tournament: null,
      match_type: "Tournament",
      has_stats: true,
    });
    expect(structured.matches[1].source).toBe("swingvision");

    const [query] = serviceCalls(calls);
    expect(query.fn).toBe("ask_run_query");
    expect(query.args).toMatchObject({
      p_viewer: USER_ID,
      scope_sql: "select match_id from ask.matches",
    });
    expect((query.args as { sql: string }).sql).toContain(
      "from ask.matches m join scope",
    );
    expect((query.args as { sql: string }).sql).not.toContain("player_name");
    expect(userCalls(calls).map((call) => call.fn)).toEqual([
      "ask_mcp_count_call",
    ]);
  });

  test("list_matches with a program the caller is in reads the team function with the program pinned", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "list_matches", {
      program_id: PROGRAM_ID,
    });
    expect(result.isError).toBeUndefined();
    expect(calls.reads).toEqual([`program:${PROGRAM_ID}:${USER_ID}`]);
    const [query] = serviceCalls(calls);
    expect(query.fn).toBe("ask_run_team_query");
    expect(query.args).toMatchObject({
      p_viewer: USER_ID,
      p_program_id: PROGRAM_ID,
    });
    expect((query.args as { sql: string }).sql).toContain("m.player_name");
  });

  test("a program the caller is not in is refused before a row of it is read", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "list_matches", {
      program_id: OTHER_PROGRAM_ID,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not_a_member");
    expect(serviceCalls(calls)).toEqual([]);
    expect(calls.captured[0].properties).toMatchObject({
      tool: "list_matches",
      ok: false,
      error_code: "not_a_member",
    });
  });
});

// ── run_query ───────────────────────────────────────────────────────────────

test.describe("POST /api/mcp · run_query", () => {
  test("a query the guard refuses never reaches the database", async () => {
    const { route, calls } = loadRoute(world());
    for (const sql of [
      "select count(*) from public.users",
      "delete from ask.matches",
      "select pg_sleep(1) from scope",
      "select sum(aces) from ask.match_stats join scope using (match_id)",
    ]) {
      const result = await callTool(route, "run_query", { sql });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("sql_refused");
    }
    expect(serviceCalls(calls)).toEqual([]);
    expect(
      calls.captured.every((c) => c.properties.error_code === "sql_refused"),
    ).toBe(true);
    expect(calls.captured.some((c) => "sql" in c.properties)).toBe(false);
  });

  test("a query sql must read scope", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "run_query", {
      sql: "select count(*) as matches from ask.matches",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("must read from scope");
    expect(serviceCalls(calls)).toEqual([]);
  });

  test("a good query runs as the token's user through the service client and answers its rows", async () => {
    const { route, calls } = loadRoute(world());
    const sql =
      "select count(*) as matches, sum(case when i_won then 1 else 0 end) as wins from ask.matches join scope using (match_id)";
    const result = await callTool(route, "run_query", {
      sql,
      scope_sql:
        "select match_id from ask.matches where played_on >= '2026-01-01'",
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({
      scope: "personal",
      program_id: null,
      row_count: 1,
      truncated: false,
      rows: [{ matches: 2, wins: 1, losses: 1, second_serve_won_pct: 55.5 }],
      matches_in_scope: 2,
    });
    expect((structured.matches as unknown[]).length).toBe(2);

    const service = serviceCalls(calls);
    expect(service).toHaveLength(1);
    expect(service[0].fn).toBe("ask_run_query");
    expect(service[0].args).toEqual({
      p_viewer: USER_ID,
      scope_sql:
        "select match_id from ask.matches where played_on >= '2026-01-01'",
      sql,
    });
    expect(userCalls(calls).map((call) => call.fn)).toEqual([
      "ask_mcp_count_call",
    ]);
  });

  test("the database's refusal comes back as query_failed with the hint the page gives", async () => {
    const { route } = loadRoute(
      world({
        rpc: {
          ...world().rpc,
          ask_run_query: () => ({
            data: null,
            error: {
              code: "42883",
              message:
                "function round(double precision, integer) does not exist",
            },
          }),
        },
      }),
    );
    const result = await callTool(route, "run_query", {
      sql: "select round(avg(aces), 1) as aces from ask.match_stats join scope using (match_id) where side = 'me'",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("query_failed");
    expect(textOf(result)).toContain("::numeric");
  });
});

// ── The limits ──────────────────────────────────────────────────────────────

test.describe("POST /api/mcp · the limits", () => {
  test("the in-memory window refuses the call past its limit, by name, before the count", async () => {
    const limiter = rateLimit.createRateLimiter({ limit: 1, windowMs: 60_000 });
    const { route, calls } = loadRoute(world({ limiter }));
    expect((await callTool(route, "describe_views")).isError).toBeUndefined();
    const result = await callTool(route, "describe_views");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("rate_limited");
    expect(
      calls.rpc.filter((call) => call.fn === "ask_mcp_count_call"),
    ).toHaveLength(1);
  });

  test("the day's count past the cap refuses by name", async () => {
    const { route } = loadRoute(
      world({
        rpc: {
          ...world().rpc,
          ask_mcp_count_call: () => ({
            data: rateLimit.MCP_DAILY_CALL_CAP + 1,
            error: null,
          }),
        },
      }),
    );
    const result = await callTool(route, "describe_views");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("daily_cap_reached");
  });

  test("a counter that cannot be read refuses the call as rate_limited, with a short retry", async () => {
    const { route, calls } = loadRoute(
      world({
        rpc: {
          ...world().rpc,
          ask_mcp_count_call: () => ({
            data: null,
            error: { message: "down" },
          }),
        },
      }),
    );
    const result = await callTool(route, "describe_views");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("rate_limited");
    expect(textOf(result)).toContain("Try again in 30 seconds");
    expect(serviceCalls(calls)).toEqual([]);
  });

  test("a counter that answers no number refuses the call too", async () => {
    const { route } = loadRoute(
      world({
        rpc: {
          ...world().rpc,
          ask_mcp_count_call: () => ({ data: null, error: null }),
        },
      }),
    );
    const result = await callTool(route, "describe_views");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("rate_limited");
  });
});

// ── ask ─────────────────────────────────────────────────────────────────────

test.describe("POST /api/mcp · ask", () => {
  test("mock mode: the whole question runs, the answer is drained into one result, and nothing is reserved", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "ask", {
      question: "How is my second serve holding up?",
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(typeof structured.headline).toBe("string");
    expect((structured.headline as string).length).toBeGreaterThan(0);
    expect(structured.conversation_id).toBe(SAVED_ID);
    expect(structured.answer_id).toBe(ANSWER_ID);
    expect(Array.isArray(structured.sources)).toBe(true);
    expect(textOf(result)).toContain(structured.headline as string);

    const fns = calls.rpc.map((call) => `${call.via}:${call.fn}`);
    expect(fns).not.toContain("user:ask_reserve_question");
    expect(fns).toContain("user:ask_save_exchange_ids");
    expect(fns).toContain("user:ask_record_run");
    // Every query — the match list and the question's own — went to the
    // service client with the token's user pinned, and only those.
    const service = serviceCalls(calls);
    expect(service.length).toBeGreaterThanOrEqual(2);
    expect(service.every((call) => call.fn === "ask_run_query")).toBe(true);
    expect(
      service.every(
        (call) => (call.args as { p_viewer: string }).p_viewer === USER_ID,
      ),
    ).toBe(true);

    const events = calls.captured.map((c) => c.event);
    expect(events).toContain("ask_run");
    expect(events).toContain("mcp_tool_call");
    const run = calls.captured.find((c) => c.event === "ask_run")!;
    expect(run.properties).toMatchObject({
      trigger: "mcp",
      scope: "personal",
      mock: true,
    });
    expect("question" in run.properties).toBe(false);
    const tool = calls.captured.find((c) => c.event === "mcp_tool_call")!;
    expect(tool.properties).toMatchObject({ tool: "ask", ok: true });
  });

  test("a match tag that is not in scope refuses the question before anything is spent", async () => {
    const { route, calls } = loadRoute(world({ configured: true }));
    const result = await callTool(route, "ask", {
      question: "How did that go?",
      match_ids: ["dddddddd-0000-4000-8000-000000000004"],
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("tag_not_resolved");
    expect(calls.rpc.map((call) => call.fn)).not.toContain(
      "ask_reserve_question",
    );
    expect(calls.llm).toBe(0);
  });

  test("a spent month is the reservation's refusal, by name, and the provider is never called", async () => {
    const { route, calls } = loadRoute(
      world({
        configured: true,
        rpc: {
          ...world().rpc,
          ask_reserve_question: () => ({ data: null, error: LIMIT_ERROR }),
        },
      }),
    );
    const result = await callTool(route, "ask", {
      question: "How is my serve?",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("ask_limit_reached");
    expect(textOf(result)).toContain("20 questions");
    expect(calls.llm).toBe(0);
    expect(calls.rpc.map((call) => call.fn)).not.toContain(
      "ask_save_exchange_ids",
    );
  });

  test("a scope with no match is refused before a question is reserved", async () => {
    const { route, calls } = loadRoute(
      world({
        configured: true,
        rpc: {
          ...world().rpc,
          ask_run_query: () => ({
            data: { matches: [], rows: [] },
            error: null,
          }),
        },
      }),
    );
    const result = await callTool(route, "ask", {
      question: "How is my serve?",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("no_matches");
    expect(calls.rpc.map((call) => call.fn)).not.toContain(
      "ask_reserve_question",
    );
  });
});

// ── The personal-access-token path, over an in-memory transport ─────────────

test.describe("createAskMcpServer · a token caller", () => {
  async function connect(caller: McpCaller, state: World) {
    const { calls, loader } = fakes(state);
    const { createAskMcpServer } = loader.load(SERVER) as {
      createAskMcpServer: (context: AskMcpContext) => McpServer;
    };
    const db: AskDatabase = {
      rpc: async (fn, args) => {
        calls.rpc.push({ fn, args, via: "service" });
        const answer = state.rpc[fn];
        if (!answer) throw new Error(`unexpected rpc ${fn}`);
        return answer(args);
      },
    };
    const server = createAskMcpServer({
      caller,
      db,
      reads: {
        program: async () => null,
        conversation: async () => null,
      },
      model: {
        configured: false,
        // Mock mode never reaches the model; typed as an empty stream.
        stream: async (): Promise<AsyncIterable<string>> =>
          (async function* () {})(),
      },
      stageModels: { plan: null, answer: null },
      limiter: rateLimit.createRateLimiter(),
      countCall: async () => 1,
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "spec", version: "1" });
    await client.connect(clientTransport);
    return { client, calls };
  }

  test("ask is refused with the sign-in-token sentence; list_matches and run_query still answer", async () => {
    const { client, calls } = await connect(
      { kind: "token", userId: USER_ID },
      world(),
    );
    const asked = (await client.callTool({
      name: "ask",
      arguments: { question: "How is my serve?" },
    })) as ToolResult;
    expect(asked.isError).toBe(true);
    expect(textOf(asked)).toContain("needs_session");
    expect(textOf(asked)).toContain(ASK_NEEDS_SESSION_MESSAGE);
    expect(calls.rpc).toEqual([]);

    const listed = (await client.callTool({
      name: "list_matches",
      arguments: {},
    })) as ToolResult;
    expect(listed.isError).toBeUndefined();
    expect((listed.structuredContent as { count: number }).count).toBe(2);
    expect(calls.rpc.map((call) => call.fn)).toEqual(["ask_run_query"]);
    await client.close();
  });

  test("a session caller is allowed ask", async () => {
    const { client } = await connect(
      { kind: "session", userId: USER_ID },
      world(),
    );
    const asked = (await client.callTool({
      name: "ask",
      arguments: { question: "How is my serve?" },
    })) as ToolResult;
    expect(asked.isError).toBeUndefined();
    expect(
      (asked.structuredContent as { conversation_id: string }).conversation_id,
    ).toBe(SAVED_ID);
    await client.close();
  });
});

// ── The discovery document ──────────────────────────────────────────────────

test.describe("GET /.well-known/oauth-protected-resource", () => {
  test("names this host as the resource and Supabase Auth as the authorization server", async () => {
    await withEnv(
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL", "NODE_ENV"],
      { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" },
      async () => {
        const { loader } = fakes(world());
        const route = loader.load(
          "src/app/.well-known/oauth-protected-resource/route.ts",
        ) as {
          GET: (request: Request) => Promise<Response>;
          OPTIONS: () => Promise<Response>;
        };
        const response = await route.GET(
          new Request("http://localhost/.well-known/oauth-protected-resource", {
            headers: { host: "localhost" },
          }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(await response.json()).toEqual({
          resource: "http://localhost/api/mcp",
          authorization_servers: ["https://proj.supabase.co/auth/v1"],
          bearer_methods_supported: ["header"],
          scopes_supported: ["email"],
          resource_name: "Advantage Ask",
          resource_documentation: "http://localhost/dashboard/help",
        });
        expect((await route.OPTIONS()).status).toBe(204);
      },
    );
  });

  test("a production build ignores the request's host and names the configured site", async () => {
    await withEnv(
      [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SITE_URL",
        "NODE_ENV",
        "VERCEL_ENV",
        "VERCEL_PROJECT_PRODUCTION_URL",
      ],
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "app.example.com",
      },
      async () => {
        const { loader } = fakes(world());
        const route = loader.load(
          "src/app/.well-known/oauth-protected-resource/route.ts",
        ) as { GET: (request: Request) => Promise<Response> };
        const response = await route.GET(
          new Request(
            "http://evil.example/.well-known/oauth-protected-resource",
            {
              headers: {
                host: "evil.example",
                "x-forwarded-host": "evil.example",
              },
            },
          ),
        );
        const body = (await response.json()) as { resource: string };
        expect(body.resource).toBe("https://app.example.com/api/mcp");
      },
    );
  });
});
