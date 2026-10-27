import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AskDatabase } from "@/lib/services/ask/ask";
import { renderAskSchemaBlock } from "@/lib/services/ask/prompts";
import {
  ASK_NEEDS_SESSION_MESSAGE,
  type McpCaller,
} from "@/lib/services/mcp/auth";
import * as rateLimit from "@/lib/services/mcp/rate-limit";
import type { AskMcpContext } from "@/lib/services/mcp/server";
import type {
  McpMatchReport,
  McpOwnMatch,
  McpUserReads,
} from "@/lib/services/mcp/user-reads";
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
 * token lists the nine tools; a query the guard refuses never reaches the
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

/** What `reads.matchReport()` answers: the caller sat in seat two, a summary per seat, one share link. */
const REPORT: McpMatchReport = {
  seat: "player2",
  insights: {
    player1: { summary: "Anna served big." },
    player2: { summary: "You returned deep.", strengths: [] },
  },
  keyMoments: [{ moment: "Set 2, 4-4", description: "Held from 0-30." }],
  shareToken: "tok_abc",
};

/** What `reads.ownMatch()` answers: a hand-scored personal match, not on a line. */
const OWN_MATCH: McpOwnMatch = {
  id: MATCH_A,
  programId: null,
  score: { player1: [6, 6], player2: [4, 3] },
  format: { best_of: 3 },
  linked: false,
  analyzed: false,
  teamMatch: false,
  matchType: "Tournament",
  round: null,
};

/** What the `get_match` stats query answers: both sides of one match. */
const STATS_ANSWER = {
  matches: [QUERY_ANSWER.matches[0]],
  rows: [
    { match_id: MATCH_A, side: "me", aces: 5, first_serve_pct: 61.2 },
    { match_id: MATCH_A, side: "opponent", aces: 2, first_serve_pct: 55.0 },
  ],
};

/** The two Opponents reads, as `opponents-load.ts` shapes them, cut to what the tool restates. */
const OPPONENTS = {
  personal: {
    season: "2026–27",
    totals: { opponents: 1, matches: 2, won: 1, analyzed: 2, unnamed: 0 },
    opponents: [
      {
        key: "name:anna lee",
        opponentPlayerId: null,
        name: "Anna Lee",
        hand: "right",
        backhand: "two-handed",
        played: 2,
        analyzed: 2,
        wins: 1,
        losses: 1,
        playedThisSeason: 2,
        form: ["loss", "win"],
        lastMatch: {
          id: MATCH_A,
          date: "2026-09-14",
          won: true,
          sets: [{ player1: 6, player2: 4 }],
        },
        recent: [
          {
            id: MATCH_A,
            date: "2026-09-14",
            won: true,
            sets: [{ player1: 6, player2: 4 }],
            event: null,
            inSeason: true,
            values: { total_points_won_pct: 53 },
          },
        ],
        measures: [
          {
            key: "total_points_won_pct",
            label: "Points won",
            value: 53,
            trend: 2,
          },
        ],
      },
    ],
  },
  team: {
    season: "2026–27",
    totals: {
      opponents: 1,
      programs: 1,
      matches: 1,
      analyzed: 1,
      unattributed: 0,
    },
    opponents: [
      {
        key: "name:bea ortiz",
        opponentPlayerId: null,
        name: "Bea Ortiz",
        hand: null,
        backhand: null,
        played: 1,
        analyzed: 1,
        wins: 0,
        losses: 1,
        playedThisSeason: 1,
        form: ["loss"],
        lastMatch: { id: MATCH_B, date: "2026-08-02", won: false, sets: [] },
        recent: [],
        measures: [],
        program: {
          id: OTHER_PROGRAM_ID,
          schoolName: "Eastbrook",
          shortCode: null,
          crestUrl: null,
          conference: "Big West",
          division: "I",
        },
        school: null,
        matchIds: [MATCH_B],
        editableMatchIds: [],
        facedBy: [
          {
            playerId: "pp-1",
            name: "Cal Reyes",
            firstName: "Cal",
            photoUrl: null,
            wins: 0,
            losses: 1,
          },
        ],
      },
    ],
  },
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
  /** What `reads.matchReport()` answers for any match, or null for "not yours". */
  report: McpMatchReport | null;
  /** What `reads.ownMatch()` answers for MATCH_A; MATCH_B is never the caller's. */
  ownMatch: McpOwnMatch | null;
  /** The one saved conversation `reads.conversation()` finds, if any. */
  conversation: { id: string; messages: [] } | null;
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
    data: /from ask\.match_stats s join scope/.test(sql)
      ? STATS_ANSWER
      : /from ask\.matches m join scope/.test(sql)
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
    report: REPORT,
    ownMatch: OWN_MATCH,
    conversation: null,
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
      ask_patch_match: () => ({ data: MATCH_A, error: null }),
      ask_seed_match_draft: (args) => ({
        data: (args as { p_id: string }).p_id,
        error: null,
      }),
    },
    llm: async () => {
      throw new Error("provider down");
    },
    ...overrides,
  };
}

/** `createMcpUserReads()` faked: every read is recorded, and answers what `state` says. */
function fakeReads(state: World, calls: Calls, userId: string): McpUserReads {
  return {
    program: async (id) => {
      calls.reads.push(`program:${id}:${userId}`);
      return state.programs.find((program) => program.id === id) ?? null;
    },
    programs: async () => {
      calls.reads.push(`programs:${userId}`);
      return state.programs.map((program) => ({
        ...program,
        role: "player",
        team: "mens" as const,
        status: "active",
      }));
    },
    conversation: async (id) => {
      calls.reads.push(`conversation:${id}`);
      return state.conversation?.id === id ? state.conversation : null;
    },
    matchReport: async (id) => {
      calls.reads.push(`report:${id}`);
      return state.report;
    },
    ownMatch: async (id) => {
      calls.reads.push(`own:${id}`);
      return id === MATCH_A ? state.ownMatch : null;
    },
    personalOpponents: async () => {
      calls.reads.push(`opponents:${userId}`);
      return OPPONENTS.personal as never;
    },
    teamOpponents: async (programId) => {
      calls.reads.push(`opponents:${programId}`);
      return OPPONENTS.team as never;
    },
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
      resolvedLLMModel: () => null,
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
      createMcpUserReads: (_client: unknown, userId: string) =>
        fakeReads(state, calls, userId),
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
  return rpcResult<{
    tools: {
      name: string;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    }[];
  }>(
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

/**
 * Run with `NEXT_PUBLIC_SITE_URL` and `NODE_ENV` cleared, so `mcpOrigin()`
 * falls back to the request's own origin (`http://localhost`) whatever CI or
 * `.env.local` configured.
 */
function withRequestOrigin<T>(fn: () => Promise<T>): Promise<T> {
  return withEnv(["NEXT_PUBLIC_SITE_URL", "NODE_ENV"], {}, fn);
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
    const response = await withRequestOrigin(() =>
      route.POST(
        post(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { authorization: null },
        ),
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
    const response = await withRequestOrigin(() =>
      route.POST(
        post(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { authorization: "Bearer not.the.token" },
        ),
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

  test("a good token: initialize names the server, and the nine tools are listed", async () => {
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
      "get_match",
      "list_matches",
      "list_workspaces",
      "opponent_scouting",
      "prepare_video_upload",
      "run_query",
      "update_match",
    ]);
    // The Connectors Directory checks these against behaviour: `ask` saves the
    // exchange and spends a question, so it is a write like the match writes.
    const writes = listed.tools.filter(
      (tool) => tool.annotations?.readOnlyHint !== true,
    );
    expect(writes.map((tool) => tool.name).sort()).toEqual([
      "ask",
      "prepare_video_upload",
      "update_match",
    ]);
    for (const tool of writes) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    }
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
    // The court positions are the MCP's alone, with how to read and bin them.
    expect(described).toContain(
      renderAskSchemaBlock("personal", { mcp: true }),
    );
    expect(described).toContain("# Court positions");
    expect(described).toContain("floor(s.landing_x / 2)");
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
    expect(textOf(result)).toMatch(/^not_a_member: /);
    expect(serviceCalls(calls)).toEqual([]);
    expect(calls.captured[0].properties).toMatchObject({
      tool: "list_matches",
      ok: false,
      error_code: "not_a_member",
    });
  });
});

// ── list_workspaces, get_match and opponent_scouting ────────────────────────

test.describe("POST /api/mcp · list_workspaces", () => {
  test("names the personal workspace and every program with its role, as the user, and queries nothing", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "list_workspaces");
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      personal: { id: USER_ID, label: "Your own matches (no program_id)" },
      programs: [
        {
          program_id: PROGRAM_ID,
          name: "Westbrook College",
          team: "mens",
          role: "player",
          status: "active",
        },
      ],
    });
    expect(calls.reads).toEqual([`programs:${USER_ID}`]);
    expect(serviceCalls(calls)).toEqual([]);
  });
});

test.describe("POST /api/mcp · get_match", () => {
  test("reads the match row and both stat sides through the one-match scope, orients the insights to the caller's seat, and prints the links", async () => {
    const { route, calls } = loadRoute(world());
    const result = await withEnv(
      ["NEXT_PUBLIC_SITE_URL"],
      { NEXT_PUBLIC_SITE_URL: "https://app.example.test" },
      () => callTool(route, "get_match", { match_id: MATCH_A }),
    );
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.match).toMatchObject({
      match_id: MATCH_A,
      opponent: "Anna Lee",
      score: "6-4 6-3",
      i_won: true,
      has_stats: true,
    });
    expect(structured.stats).toEqual({
      me: { match_id: MATCH_A, side: "me", aces: 5, first_serve_pct: 61.2 },
      opponent: {
        match_id: MATCH_A,
        side: "opponent",
        aces: 2,
        first_serve_pct: 55.0,
      },
    });
    // Seat two is the caller: their summary is `me`, seat one's the opponent's.
    expect(structured.insights).toEqual({
      me: { summary: "You returned deep.", strengths: [] },
      opponent: { summary: "Anna served big." },
    });
    expect(structured.key_moments).toEqual(REPORT.keyMoments);
    expect(structured.match_url).toBe(
      `https://app.example.test/dashboard/matches/${MATCH_A}`,
    );
    expect(structured.share_url).toBe("https://app.example.test/m/tok_abc");

    const queries = serviceCalls(calls);
    expect(queries.map((call) => call.fn)).toEqual([
      "ask_run_query",
      "ask_run_query",
    ]);
    for (const query of queries) {
      expect(query.args).toMatchObject({
        p_viewer: USER_ID,
        scope_sql: `select match_id from ask.matches where match_id = '${MATCH_A}'`,
      });
    }
    expect((queries[1].args as { sql: string }).sql).toContain(
      "from ask.match_stats s join scope",
    );
    expect(calls.reads).toEqual([`report:${MATCH_A}`]);
  });

  test("a match the scope does not hold is match_not_found, before the report columns are read", async () => {
    const { route, calls } = loadRoute(
      world({
        rpc: {
          ...world().rpc,
          ask_run_query: () => ({
            data: { matches: [], rows: [] },
            error: null,
          }),
        },
      }),
    );
    const result = await callTool(route, "get_match", { match_id: MATCH_B });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^match_not_found: /);
    expect(calls.reads).toEqual([]);
    expect(serviceCalls(calls)).toHaveLength(1);
  });

  test("no share link and no insights read as null, never as an empty link", async () => {
    const { route } = loadRoute(world({ report: null }));
    const result = await callTool(route, "get_match", { match_id: MATCH_A });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.insights).toBeNull();
    expect(structured.key_moments).toBeNull();
    expect(structured.share_url).toBeNull();
  });
});

test.describe("POST /api/mcp · opponent_scouting", () => {
  test("personal: the Opponents page's rows as the user, restated in the tool's names", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "opponent_scouting");
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      scope: string;
      season: string;
      count: number;
      opponents: Record<string, unknown>[];
    };
    expect(structured.scope).toBe("personal");
    expect(structured.season).toBe("2026–27");
    expect(structured.count).toBe(1);
    expect(structured.opponents[0]).toEqual({
      name: "Anna Lee",
      hand: "right",
      backhand: "two-handed",
      played: 2,
      analyzed: 2,
      wins: 1,
      losses: 1,
      played_this_season: 2,
      form: ["loss", "win"],
      last_match: {
        match_id: MATCH_A,
        played_on: "2026-09-14",
        won: true,
        sets: [{ me: 6, opponent: 4 }],
      },
      recent: [
        {
          match_id: MATCH_A,
          played_on: "2026-09-14",
          won: true,
          sets: [{ me: 6, opponent: 4 }],
          event: null,
          in_season: true,
          values: { total_points_won_pct: 53 },
        },
      ],
      measures: [
        {
          key: "total_points_won_pct",
          label: "Points won",
          value: 53,
          trend: 2,
        },
      ],
    });
    expect(calls.reads).toEqual([`opponents:${USER_ID}`]);
    expect(serviceCalls(calls)).toEqual([]);
  });

  test("team: membership first, then the program's rows with who faced them; a name filter narrows", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "opponent_scouting", {
      program_id: PROGRAM_ID,
      opponent: "ortiz",
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      scope: string;
      count: number;
      opponents: Record<string, unknown>[];
    };
    expect(structured.scope).toBe("team");
    expect(structured.count).toBe(1);
    expect(structured.opponents[0]).toMatchObject({
      name: "Bea Ortiz",
      program: {
        id: OTHER_PROGRAM_ID,
        school: "Eastbrook",
        conference: "Big West",
        division: "I",
      },
      match_ids: [MATCH_B],
      faced_by: [{ player_id: "pp-1", name: "Cal Reyes", wins: 0, losses: 1 }],
    });
    expect(calls.reads).toEqual([
      `program:${PROGRAM_ID}:${USER_ID}`,
      `opponents:${PROGRAM_ID}`,
    ]);

    const none = await callTool(route, "opponent_scouting", {
      program_id: PROGRAM_ID,
      opponent: "nobody",
    });
    expect((none.structuredContent as { count: number }).count).toBe(0);
  });
});

// ── update_match and prepare_video_upload ───────────────────────────────────

test.describe("POST /api/mcp · update_match", () => {
  test("normalises the fields through the dialog's rules, writes through ask_patch_match as the user, and reads the row back", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "update_match", {
      match_id: MATCH_A,
      opponent_name: "  Anna Lee-Park ",
      tournament_name: "Fall Open",
      date: "2026-09-14",
      opponent_hand: "left",
      court_type: null,
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.changed).toEqual([
      "tournament_name",
      "court_type",
      "opponent_name",
      "date",
      "opponent_hand",
    ]);
    expect(structured.match).toMatchObject({ match_id: MATCH_A });
    expect(calls.reads).toEqual([`own:${MATCH_A}`]);

    const write = userCalls(calls).find(
      (call) => call.fn === "ask_patch_match",
    );
    expect(write?.args).toEqual({
      p_match_id: MATCH_A,
      p_update: {
        tournament_name: "Fall Open",
        court_type: null,
        player2_name: "Anna Lee-Park",
        date: "2026-09-14T12:00:00",
        opponent_hand: "left",
      },
    });
    // Never the service role for a write; the read-back is the one query.
    expect(serviceCalls(calls).map((call) => call.fn)).toEqual([
      "ask_run_query",
    ]);
  });

  test("a match on a scheduled line refuses its event-owned fields as field_locked, before any write", async () => {
    const { route, calls } = loadRoute(
      world({ ownMatch: { ...OWN_MATCH, linked: true } }),
    );
    const result = await callTool(route, "update_match", {
      match_id: MATCH_A,
      date: "2026-09-15",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^field_locked: /);
    expect(textOf(result)).toContain("(date)");
    expect(userCalls(calls).map((call) => call.fn)).toEqual([
      "ask_mcp_count_call",
    ]);
  });

  test("a match the caller did not create, one in another workspace, and an empty patch are refused by name", async () => {
    const { route, calls } = loadRoute(world());
    const other = await callTool(route, "update_match", {
      match_id: MATCH_B,
      tournament_name: "x",
    });
    expect(textOf(other)).toMatch(/^match_not_found: /);

    const wrongWorkspace = await callTool(route, "update_match", {
      match_id: MATCH_A,
      program_id: PROGRAM_ID,
      tournament_name: "x",
    });
    expect(textOf(wrongWorkspace)).toMatch(/^match_not_found: /);

    const empty = await callTool(route, "update_match", { match_id: MATCH_A });
    expect(textOf(empty)).toMatch(/^nothing_to_change: /);
    expect(userCalls(calls).some((call) => call.fn === "ask_patch_match")).toBe(
      false,
    );
  });

  test("a round on a match with no tournament or dual type is refused rather than cleared", async () => {
    const { route, calls } = loadRoute(
      world({ ownMatch: { ...OWN_MATCH, matchType: null } }),
    );
    const result = await callTool(route, "update_match", {
      match_id: MATCH_A,
      round: "QF",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^invalid_field: .*\(round\)$/);
    expect(userCalls(calls).some((call) => call.fn === "ask_patch_match")).toBe(
      false,
    );
  });

  test("the score and the format are not arguments", async () => {
    const { route } = loadRoute(world());
    const listed = await listTools(route);
    const tool = listed.tools.find(
      (t) => t.name === "update_match",
    ) as unknown as {
      inputSchema: { properties: Record<string, unknown> };
    };
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([
      "court_type",
      "date",
      "match_id",
      "match_type",
      "opponent_backhand",
      "opponent_hand",
      "opponent_name",
      "opponent_school",
      "program_id",
      "round",
      "tournament_name",
    ]);
  });
});

test.describe("POST /api/mcp · prepare_video_upload", () => {
  test("the write guard's own 42501 is an internal error, not a membership refusal", async () => {
    const { route } = loadRoute(
      world({
        rpc: {
          ...world().rpc,
          ask_seed_match_draft: () => ({
            data: null,
            error: {
              code: "42501",
              message: "Apps connected to Advantage have read-only access.",
            },
          }),
        },
      }),
    );
    const result = await callTool(route, "prepare_video_upload", {
      opponent_name: "Anna Lee",
      date: "2026-10-18",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^internal_error: /);
  });

  test("seeds a draft through ask_seed_match_draft as the user and answers the resume link; nothing is queried", async () => {
    const { route, calls } = loadRoute(world());
    const result = await withEnv(
      ["NEXT_PUBLIC_SITE_URL"],
      { NEXT_PUBLIC_SITE_URL: "https://app.example.test" },
      () =>
        callTool(route, "prepare_video_upload", {
          opponent_name: "Anna Lee",
          date: "2026-10-18",
          score: "6-4 3-6 7-6(5)",
          tournament_name: "Fall Open",
        }),
    );
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      draft_id: string;
      url: string;
      provider: string;
      next_steps: string[];
    };
    expect(structured.provider).toBe("advantage_intelligence");
    expect(structured.url).toBe(
      `https://app.example.test/dashboard/matches/new?draft=${structured.draft_id}&return=ask`,
    );
    expect(textOf(result)).toContain(structured.url);
    expect(structured.next_steps.join(" ")).toContain("top of the frame");

    const seed = userCalls(calls).find(
      (call) => call.fn === "ask_seed_match_draft",
    );
    expect(seed?.args).toMatchObject({
      p_id: structured.draft_id,
      p_program_id: null,
      p_step: "file",
      p_provider: "splitstep",
      p_player_name: null,
      p_event_label: "Fall Open",
    });
    const payload = (
      seed?.args as { p_payload: { formData: Record<string, unknown> } }
    ).p_payload;
    expect(payload.formData).toMatchObject({
      opponentName: "Anna Lee",
      date: "2026-10-18",
      eventName: "Fall Open",
      playerScores: [6, 3, 7],
      opponentScores: [4, 6, 6],
    });
    expect(payload.formData.initialTopPlayerIsPlayer1).toBeUndefined();
    expect(serviceCalls(calls)).toEqual([]);
  });

  test("a program draft carries the program and the player's name; a score that is not sets is refused before the write", async () => {
    const { route, calls } = loadRoute(world());
    const result = await callTool(route, "prepare_video_upload", {
      program_id: PROGRAM_ID,
      provider: "swingvision",
      opponent_name: "Bea Ortiz",
      player_name: "Cal Reyes",
      date: "2026-10-18",
    });
    expect(result.isError).toBeUndefined();
    const seed = userCalls(calls).find(
      (call) => call.fn === "ask_seed_match_draft",
    );
    expect(seed?.args).toMatchObject({
      p_program_id: PROGRAM_ID,
      p_provider: "swing-vision",
      p_step_count: 3,
      p_player_name: "Cal Reyes",
    });

    const bad = await callTool(route, "prepare_video_upload", {
      opponent_name: "Bea Ortiz",
      date: "2026-10-18",
      score: "won easily",
    });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toMatch(/^invalid_score: /);
    const missing = await callTool(route, "prepare_video_upload", {
      opponent_name: "Bea Ortiz",
      date: "2026-02-30",
    });
    expect(textOf(missing)).toMatch(/^invalid_field: /);
    expect(
      userCalls(calls).filter((call) => call.fn === "ask_seed_match_draft"),
    ).toHaveLength(1);
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
      expect(textOf(result)).toMatch(/^sql_refused: /);
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
    expect(textOf(result)).toMatch(/^query_failed: /);
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
    expect(textOf(result)).toMatch(/^rate_limited: /);
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
    expect(textOf(result)).toMatch(/^daily_cap_reached: /);
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
    expect(textOf(result)).toMatch(/^rate_limited: /);
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
    expect(textOf(result)).toMatch(/^rate_limited: /);
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
    expect(textOf(result)).toMatch(/^tag_not_resolved: /);
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
    expect(textOf(result)).toMatch(/^ask_limit_reached: /);
    expect(textOf(result)).toContain("20 questions");
    expect(calls.llm).toBe(0);
    expect(calls.rpc.map((call) => call.fn)).not.toContain(
      "ask_save_exchange_ids",
    );
  });

  test("a standalone question reads the answer cache; a follow-up never touches it", async () => {
    const spent = {
      configured: true,
      rpc: {
        ...world().rpc,
        ask_reserve_question: () => ({ data: null, error: LIMIT_ERROR }),
      },
    };
    const cacheFns = (calls: Calls) =>
      calls.rpc
        .map((call) => call.fn)
        .filter(
          (fn) => fn.startsWith("ask_cache_") || fn === "ask_data_version",
        );

    const standalone = loadRoute(world(spent));
    await callTool(standalone.route, "ask", { question: "How is my serve?" });
    expect(cacheFns(standalone.calls)).toEqual([
      "ask_data_version",
      "ask_cache_get",
    ]);

    // Same question, but continuing a conversation: the key carries no
    // conversation, so a hit would replay an answer to a different question.
    const followUp = loadRoute(
      world({ ...spent, conversation: { id: SAVED_ID, messages: [] } }),
    );
    const result = await callTool(followUp.route, "ask", {
      question: "How is my serve?",
      conversation_id: SAVED_ID,
    });
    expect(followUp.calls.reads).toContain(`conversation:${SAVED_ID}`);
    expect(textOf(result)).toMatch(/^ask_limit_reached: /);
    expect(cacheFns(followUp.calls)).toEqual([]);
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
    expect(textOf(result)).toMatch(/^no_matches: /);
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
      reads: fakeReads(state, calls, caller.userId),
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
    expect(textOf(asked)).toMatch(/^needs_session: /);
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
