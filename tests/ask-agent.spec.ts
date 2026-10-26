import { expect, test } from "@playwright/test";

import {
  geminiToolRequestBody,
  type LLMTool,
  type LLMToolCall,
  type LLMToolMessage,
  type LLMToolTurn,
} from "@/lib/llm/adapter";
import {
  ASK_AGENT_BOUNDS,
  ASK_AGENT_FINISH_TOOL,
  runAskAgent,
  type AskAgentModelCall,
  type AskAgentOutcome,
  type AskAgentToolbox,
  type AskAgentToolResult,
} from "@/lib/services/ask/agent";
import {
  askQuestion,
  type AskDatabase,
  type AskModel,
  type AskRpcResult,
} from "@/lib/services/ask/ask";
import type { AskEvent, AskStatusEvent } from "@/lib/services/ask/events";
import { recordAskRun, type AskRunRecord } from "@/lib/services/ask/runs";
import { PERSONAL_ASK_SCOPE } from "@/lib/services/ask/scope";
import { createAskAgentToolbox } from "@/lib/services/mcp/server";
import type { McpUserReads } from "@/lib/services/mcp/user-reads";

/**
 * Offline spec for Ask's agent mode (`agent.ts`): the bounded tool loop,
 * its hand-over to `askQuestion()`, the toolbox built on the connector's
 * handlers, and the Gemini tool request. No network, no Supabase, no
 * provider: the model's turns and the database are scripted.
 */

const MATCH_A = "3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f";
const PROGRAM = "6c1e0f6a-1d2b-4c3d-9e4f-5a6b7c8d9e0f";
const VIEWER = "11111111-0000-4000-8000-000000000001";

const SCOPE_SQL = "select match_id from ask.matches";
const ZONES_SQL =
  "select pp.serve_zone as zone, count(*) as attempts from ask.point_plays pp join scope on scope.match_id = pp.match_id where pp.i_served group by pp.serve_zone";
const ZONES_WON_SQL =
  "select pp.serve_zone as zone, count(*) as attempts, round(100.0 * sum(case when pp.i_won then 1 else 0 end) / nullif(count(*), 0), 1) as points_won_pct from ask.point_plays pp join scope on scope.match_id = pp.match_id where pp.i_served group by pp.serve_zone order by points_won_pct desc nulls last";

const ZONE_ROWS = [
  { zone: "T", attempts: 40, points_won_pct: 62.5 },
  { zone: "Wide", attempts: 30, points_won_pct: 56.7 },
  { zone: "Body", attempts: 12, points_won_pct: 41.7 },
];

const MATCH_ROWS = [
  {
    match_id: MATCH_A,
    played_on: "2026-09-14",
    opponent_name: "Anna Lee",
    i_won: true,
    score_text: "6-4, 6-3",
  },
];

/** A scripted turn: the calls the model makes, or an Error it throws. */
type Script = (LLMToolCall[] | Error)[];

let callId = 0;
function call(name: string, input: Record<string, unknown> = {}): LLMToolCall {
  callId += 1;
  return { id: `c${callId}`, name, input };
}

function fakeTurns(script: Script) {
  const seen: {
    messages: LLMToolMessage[];
    tools: readonly LLMTool[];
    call: AskAgentModelCall;
  }[] = [];
  const toolTurn = async (
    _system: string,
    messages: LLMToolMessage[],
    tools: readonly LLMTool[],
    options: AskAgentModelCall,
  ): Promise<LLMToolTurn> => {
    seen.push({ messages: [...messages], tools, call: options });
    const next = script.shift();
    if (next === undefined) throw new Error("no scripted turn left");
    if (next instanceof Error) throw next;
    return {
      text: "",
      toolCalls: next,
      raw: { provider: "openai", message: {} },
    };
  };
  return { toolTurn, seen };
}

function fakeToolbox(
  answer: (name: string, args: Record<string, unknown>) => AskAgentToolResult,
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const toolbox: AskAgentToolbox = {
    definitions: [
      {
        name: "run_query",
        description: "",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    call: async (name, args) => {
      calls.push({ name, args });
      return answer(name, args);
    },
  };
  return { toolbox, calls };
}

const rowsResult = (rows: unknown[]): AskAgentToolResult => ({
  ok: true,
  text: JSON.stringify({ rows }),
  structured: { rows, matches_in_scope: 1 },
});

async function drive(
  generator: AsyncGenerator<AskStatusEvent, AskAgentOutcome, undefined>,
): Promise<{ statuses: AskStatusEvent[]; outcome: AskAgentOutcome }> {
  const statuses: AskStatusEvent[] = [];
  for (;;) {
    const step = await generator.next();
    if (step.done) return { statuses, outcome: step.value };
    statuses.push(step.value);
  }
}

test.describe("the agent loop", () => {
  test("runs several queries, streams a status per step, and finishes on a query_id", async () => {
    const { toolTurn, seen } = fakeTurns([
      [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_SQL })],
      [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_WON_SQL })],
      [call(ASK_AGENT_FINISH_TOOL, { query_id: "q2", asks_for_advice: false })],
    ]);
    const { toolbox, calls } = fakeToolbox(() => rowsResult(ZONE_ROWS));

    const { statuses, outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );

    expect(calls.map((one) => one.args.sql)).toEqual([
      ZONES_SQL,
      ZONES_WON_SQL,
    ]);
    expect(statuses).toEqual([
      { type: "status", stage: "querying", detail: "Running a query" },
      { type: "status", stage: "querying", detail: "Running query 2" },
    ]);
    expect(outcome.reply).not.toBeNull();
    expect(JSON.parse(outcome.reply as string)).toEqual({
      asks_for_advice: false,
      scope_sql: SCOPE_SQL,
      sql: ZONES_WON_SQL,
      cannot_answer: "",
      review: false,
    });
    expect(outcome.toolCalls).toBe(2);
    // The model read each result with its query id.
    const toolTurnMessages = seen[2].messages.filter(
      (message) => message.role === "tool",
    );
    expect(toolTurnMessages).toHaveLength(2);
    const last = toolTurnMessages[1];
    expect(
      last.role === "tool" && JSON.parse(last.results[0].content),
    ).toMatchObject({
      query_id: "q2",
      row_count: 3,
    });
    // Every turn must call a tool; finish ends it.
    expect(seen[0].call.toolChoice).toBe("required");
  });

  test("a query_id is shape A whatever else the finish filled in", async () => {
    const { toolTurn } = fakeTurns([
      [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_WON_SQL })],
      [
        call(ASK_AGENT_FINISH_TOOL, {
          query_id: "q1",
          compare: "baseline",
          measures: ["serve"],
          scope_sql: SCOPE_SQL,
          sql: "",
          asks_for_advice: false,
        }),
      ],
    ]);
    const { toolbox } = fakeToolbox(() => rowsResult(ZONE_ROWS));
    const { outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );
    const reply = JSON.parse(outcome.reply as string);
    expect(reply.sql).toBe(ZONES_WON_SQL);
    expect("compare" in reply).toBe(false);
    expect("measures" in reply).toBe(false);
  });

  test("a finish that writes sql is shape A, a stray compare beside it dropped", async () => {
    const { toolTurn } = fakeTurns([
      [
        call(ASK_AGENT_FINISH_TOOL, {
          scope_sql: SCOPE_SQL,
          sql: ZONES_WON_SQL,
          compare: "baseline",
          cannot_answer: "",
          review: false,
          asks_for_advice: false,
        }),
      ],
    ]);
    const { toolbox } = fakeToolbox(() => rowsResult(ZONE_ROWS));
    const { outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );
    const reply = JSON.parse(outcome.reply as string);
    expect(reply.sql).toBe(ZONES_WON_SQL);
    expect("compare" in reply).toBe(false);
  });

  test("a shape D finish keeps its compare", async () => {
    const { toolTurn } = fakeTurns([
      [
        call(ASK_AGENT_FINISH_TOOL, {
          scope_sql: SCOPE_SQL,
          sql: "",
          compare: "opponent",
          cannot_answer: "",
          review: false,
          asks_for_advice: false,
        }),
      ],
    ]);
    const { toolbox } = fakeToolbox(() => rowsResult(ZONE_ROWS));
    const { outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );
    expect(JSON.parse(outcome.reply as string).compare).toBe("opponent");
  });

  test("feeds a refusal back as an error result and lets the model recover", async () => {
    const { toolTurn, seen } = fakeTurns([
      [call("run_query", { sql: "select * from public.users" })],
      [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_WON_SQL })],
      [call(ASK_AGENT_FINISH_TOOL, { query_id: "q1", asks_for_advice: false })],
    ]);
    const { toolbox } = fakeToolbox((_name, args) =>
      args.sql === ZONES_WON_SQL
        ? rowsResult(ZONE_ROWS)
        : { ok: false, text: "sql_refused: reads public.users" },
    );

    const { outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );

    const refused = seen[1].messages.at(-1);
    expect(refused).toEqual({
      role: "tool",
      results: [
        expect.objectContaining({
          content: "sql_refused: reads public.users",
          isError: true,
        }),
      ],
    });
    // A refused query gets no id: q1 is the first that ran.
    expect(JSON.parse(outcome.reply as string).sql).toBe(ZONES_WON_SQL);
  });

  test("past the call budget the model may only finish", async () => {
    const max = ASK_AGENT_BOUNDS.maxToolCalls;
    const script: Script = Array.from({ length: max }, () => [
      call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_SQL }),
    ]);
    script.push([
      call(ASK_AGENT_FINISH_TOOL, {
        scope_sql: SCOPE_SQL,
        sql: ZONES_WON_SQL,
        asks_for_advice: false,
      }),
    ]);
    const { toolTurn, seen } = fakeTurns(script);
    const { toolbox, calls } = fakeToolbox(() => rowsResult(ZONE_ROWS));

    const { outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );

    expect(calls).toHaveLength(max);
    const final = seen[max];
    expect(final.tools.map((tool) => tool.name)).toEqual([
      ASK_AGENT_FINISH_TOOL,
    ]);
    expect(final.call.toolChoice).toEqual({ name: ASK_AGENT_FINISH_TOOL });
    expect(JSON.parse(outcome.reply as string).sql).toBe(ZONES_WON_SQL);
  });

  test("a spent deadline answers from the last query that returned rows", async () => {
    let clock = 0;
    const { toolTurn } = fakeTurns([
      [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_WON_SQL })],
      [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_SQL })],
    ]);
    const { toolbox } = fakeToolbox((_name, args) => {
      clock += 7_000;
      return rowsResult(args.sql === ZONES_SQL ? [] : ZONE_ROWS);
    });

    const { outcome } = await drive(
      runAskAgent({
        toolTurn,
        toolbox,
        systemPrompt: "plan",
        question: "?",
        now: () => clock,
      }),
    );

    // The second query returned nothing, so the first one is the answer.
    expect(JSON.parse(outcome.reply as string).sql).toBe(ZONES_WON_SQL);
  });

  test("a provider that fails with nothing to answer from hands back null", async () => {
    const { toolTurn } = fakeTurns([new Error("503")]);
    const { toolbox } = fakeToolbox(() => rowsResult(ZONE_ROWS));
    const { outcome } = await drive(
      runAskAgent({ toolTurn, toolbox, systemPrompt: "plan", question: "?" }),
    );
    expect(outcome).toMatchObject({ reply: null, stop: "unavailable" });
  });
});

// ── Through askQuestion ─────────────────────────────────────────────────────

const ANSWER = `Your serve to the T wins the most points.
FIGURE: Points won on T serves = {{r1.points_won_pct}}

You won {{r1.points_won_pct}} of points on {{r1.attempts}} serves to the T.`;

function fakeDb() {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const db: AskDatabase = {
    rpc: async (fn, args): Promise<AskRpcResult> => {
      calls.push({ fn, args });
      if (fn === "ask_run_query") {
        return { data: { matches: MATCH_ROWS, rows: ZONE_ROWS }, error: null };
      }
      if (fn === "ask_save_exchange_ids") {
        return {
          data: {
            conversation_id: "bbbbbbbb-0000-4000-8000-000000000002",
            answer_id: "00000000-0000-4000-8000-0000000000a1",
          },
          error: null,
        };
      }
      if (fn === "ask_quota") return { data: null, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
  return { db, calls };
}

function fakeModel(
  replies: string[],
  turns: Script,
): { model: AskModel; streamed: number } {
  const state = { streamed: 0 };
  const { toolTurn } = fakeTurns(turns);
  const model: AskModel = {
    configured: true,
    stream: async () => {
      state.streamed += 1;
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no scripted reply left");
      return (async function* () {
        yield reply;
      })();
    },
    toolTurn,
  };
  return {
    model,
    get streamed() {
      return state.streamed;
    },
  };
}

async function collect(events: AsyncIterable<AskEvent>): Promise<AskEvent[]> {
  const out: AskEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

test.describe("agent mode in askQuestion", () => {
  test("the agent's queries and the answer's run on the question's database, and the run records them", async () => {
    const { db, calls } = fakeDb();
    const fake = fakeModel(
      [ANSWER],
      [
        [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_SQL })],
        [call("run_query", { scope_sql: SCOPE_SQL, sql: ZONES_WON_SQL })],
        [
          call(ASK_AGENT_FINISH_TOOL, {
            query_id: "q2",
            asks_for_advice: false,
          }),
        ],
      ],
    );
    let run: AskRunRecord | null = null;

    const events = await collect(
      recordAskRun(
        {
          db,
          model: fake.model,
          now: () => new Date("2026-10-26T12:00:00Z"),
          question: "What is my best serve placement, by attempts too?",
          tags: { prompt: [], saved: [], matchIds: [] },
          conversation: [],
          conversationId: null,
          reservation: null,
          scope: PERSONAL_ASK_SCOPE,
          // The toolbox runs its queries through the database it is handed.
          agent: {
            toolbox: (questionDb) => ({
              definitions: [],
              call: async (_name, args) => {
                const ran = await questionDb.rpc("ask_run_query", {
                  scope_sql: args.scope_sql,
                  sql: args.sql,
                });
                const rows = (ran.data as { rows: unknown[] }).rows;
                return rowsResult(rows);
              },
            }),
          },
        },
        { onRun: (record) => void (run = record) },
      ),
    );

    // Two exploring queries, then the plan's own run.
    expect(
      calls
        .filter((one) => one.fn === "ask_run_query")
        .map((one) => one.args?.sql),
    ).toEqual([ZONES_SQL, ZONES_WON_SQL, ZONES_WON_SQL]);
    expect(
      events.flatMap((event) =>
        event.type === "status" ? [event.detail ?? event.stage] : [],
      ),
    ).toEqual([
      "planning",
      "Running a query",
      "Running query 2",
      "querying",
      "writing",
    ]);
    // The renderer substituted the cells: the model typed no number.
    expect(events.find((event) => event.type === "figure")).toMatchObject({
      value: "62.5%",
    });
    expect(events.at(-1)?.type).toBe("done");
    expect(run).toMatchObject({
      outcome: "done",
      route: "agent",
      queryCount: 3,
      // Three agent turns and the answer.
      modelCalls: 4,
    });
  });

  test("an agent that cannot reach the provider falls back to the one-shot planner", async () => {
    const { db } = fakeDb();
    const fake = fakeModel(
      [
        JSON.stringify({
          scope_sql: SCOPE_SQL,
          sql: ZONES_WON_SQL,
          asks_for_advice: false,
        }),
        ANSWER,
      ],
      [new Error("503")],
    );

    const events = await collect(
      askQuestion({
        db,
        model: fake.model,
        now: () => new Date("2026-10-26T12:00:00Z"),
        question: "What is my best serve placement?",
        tags: { prompt: [], saved: [], matchIds: [] },
        conversation: [],
        conversationId: null,
        reservation: null,
        scope: PERSONAL_ASK_SCOPE,
        agent: { toolbox: () => fakeToolbox(() => rowsResult([])).toolbox },
      }),
    );

    expect(fake.streamed).toBe(2);
    expect(events.at(-1)?.type).toBe("done");
  });
});

// ── The toolbox on the connector's handlers ─────────────────────────────────

function fakeReads(): McpUserReads {
  return {
    program: async (id) => (id === PROGRAM ? { id, name: "ZZ Test" } : null),
    programs: async () => [],
    ownMatch: async () => null,
    conversation: async () => null,
    matchReport: async () => null,
    personalOpponents: async () => {
      throw new Error("not read here");
    },
    teamOpponents: async () => {
      throw new Error("not read here");
    },
  };
}

test.describe("the agent toolbox", () => {
  test("a query the guard refuses never reaches the database", async () => {
    const { db, calls } = fakeDb();
    const toolbox = createAskAgentToolbox({
      db,
      reads: fakeReads(),
      userId: VIEWER,
      scope: PERSONAL_ASK_SCOPE,
    });
    const result = await toolbox.call("run_query", {
      sql: "select * from public.users",
    });
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/^sql_refused: /);
    expect(calls).toHaveLength(0);
  });

  test("a team question queries the program the route checked, whatever the model passes", async () => {
    const calls: { fn: string; args?: Record<string, unknown> }[] = [];
    const db: AskDatabase = {
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return { data: { matches: MATCH_ROWS, rows: ZONE_ROWS }, error: null };
      },
    };
    const toolbox = createAskAgentToolbox({
      db,
      reads: fakeReads(),
      userId: VIEWER,
      scope: { kind: "team", programId: PROGRAM, programName: "ZZ Test" },
    });
    const result = await toolbox.call("run_query", {
      sql: ZONES_WON_SQL,
      program_id: "99999999-0000-4000-8000-000000000009",
    });
    expect(result.ok).toBe(true);
    expect(result.structured?.rows).toEqual(ZONE_ROWS);
    expect(calls).toEqual([
      {
        fn: "ask_run_team_query",
        args: {
          p_program_id: PROGRAM,
          scope_sql: SCOPE_SQL,
          sql: ZONES_WON_SQL,
        },
      },
    ]);
    expect(toolbox.definitions.map((tool) => tool.name)).toEqual([
      "list_matches",
      "get_match",
      "opponent_scouting",
      "describe_views",
      "run_query",
    ]);
  });
});

// ── The Gemini tool request ─────────────────────────────────────────────────

test("a Gemini tool turn sends back the provider's own call, signature included", () => {
  const body = geminiToolRequestBody(
    "system",
    [
      { role: "user", content: "?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_1", name: "run_query", input: { sql: "select 1" } },
        ],
        raw: {
          provider: "openai",
          message: {
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "run_query",
                  arguments: '{"sql":"select 1"}',
                },
                extra_content: { google: { thought_signature: "sig" } },
              },
            ],
          },
        },
      },
      {
        role: "tool",
        results: [{ id: "call_1", name: "run_query", content: "{}" }],
      },
    ],
    [{ name: "run_query", description: "", inputSchema: { type: "object" } }],
    { toolChoice: { name: "finish" } },
  );
  expect(body.messages[2]).toMatchObject({
    role: "assistant",
    tool_calls: [
      {
        id: "call_1",
        extra_content: { google: { thought_signature: "sig" } },
      },
    ],
  });
  expect(body.messages[3]).toEqual({
    role: "tool",
    tool_call_id: "call_1",
    content: "{}",
  });
  expect(body.tool_choice).toEqual({
    type: "function",
    function: { name: "finish" },
  });
  expect("temperature" in body).toBe(false);
});
