import { expect, test } from "@playwright/test";

import type { AskQuestionInput, AskRpcResult } from "@/lib/services/ask/ask";
import { askCacheKey } from "@/lib/services/ask/cache";
import type { AskEvent } from "@/lib/services/ask/events";
import type { AskRunOptions, AskRunRecord } from "@/lib/services/ask/runs";
import { PERSONAL_ASK_SCOPE } from "@/lib/services/ask/scope";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Ask on arrival (`src/lib/services/ask/arrival.ts`): the first question
 * about a match, asked for its uploader with no session behind it. Offline:
 * the service-role client is a fake that records every call, the LLM
 * adapter is stubbed (never reached — the stream is a script), and the
 * cookie client throws if anything touches it.
 */

const MATCH = "aaaaaaaa-0000-4000-8000-000000000001";
const UPLOADER = "bbbbbbbb-0000-4000-8000-000000000002";
const CLAIMED = "cccccccc-0000-4000-8000-000000000003";
const CONVERSATION = "dddddddd-0000-4000-8000-000000000004";
const ANSWER = "eeeeeeee-0000-4000-8000-000000000005";
const JOB = "job-1";

type Row = Record<string, unknown>;

function matchRow(overrides: Row = {}): Row {
  return {
    id: MATCH,
    date: "2026-10-01T00:00:00.000Z",
    player1_id: UPLOADER,
    player2_id: null,
    player1_name: "Alex Rivera",
    player2_name: "Anna Lee",
    created_by: UPLOADER,
    score: { player1: [6, 6], player2: [4, 3] },
    tournament_name: null,
    round: null,
    result: null,
    match_type: null,
    court_type: null,
    verified: null,
    duration: null,
    opponent_hand: "left",
    opponent_backhand: null,
    program_id: null,
    ...overrides,
  };
}

interface FakeOptions {
  match?: Row | null;
  matchError?: string;
  claimed?: string[];
  /** Somebody already asked for this match: the claim's insert is a no-op. */
  alreadyClaimed?: boolean;
  dataVersion?: string | null;
  /** The job's creator; the match's creator when omitted. */
  jobOwner?: string | null;
}

/** The parts of the service-role client the module touches, as a fake that records. */
function fakeAdmin(opts: FakeOptions = {}) {
  const rpc: { fn: string; args?: Record<string, unknown> }[] = [];
  const claims: string[] = [];
  const client = {
    from(table: string) {
      if (table === "matches") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                opts.matchError
                  ? { data: null, error: { message: opts.matchError } }
                  : {
                      data: opts.match === undefined ? matchRow() : opts.match,
                      error: null,
                    },
            }),
          }),
        };
      }
      if (table === "processing_jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  created_by:
                    opts.jobOwner === undefined
                      ? ((opts.match === undefined ? matchRow() : opts.match)
                          ?.created_by ?? null)
                      : opts.jobOwner,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "program_players") {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({
                data: (opts.claimed ?? []).map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "notification_sends") {
        return {
          upsert: (row: { dedupe_key: string }) => ({
            select: async () => {
              claims.push(row.dedupe_key);
              return {
                data: opts.alreadyClaimed ? [] : [row],
                error: null,
              };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(
      fn: string,
      args?: Record<string, unknown>,
    ): Promise<AskRpcResult> {
      rpc.push({ fn, args });
      switch (fn) {
        case "ask_data_version_as":
          return {
            data: opts.dataVersion === undefined ? "v1" : opts.dataVersion,
            error: null,
          };
        case "ask_save_exchange_as":
          return {
            data: { conversation_id: CONVERSATION, answer_id: ANSWER },
            error: null,
          };
        case "ask_record_run_as":
          return { data: "run-1", error: null };
        case "ask_cache_put_as":
          return { data: null, error: null };
        default:
          return { data: null, error: null };
      }
    },
  };
  return { client, rpc, claims };
}

const loader = createLoader({
  // `AbortSignal.timeout` and `err instanceof Error` at call time.
  globals: { AbortSignal, Error, URL },
  stubs: {
    "@/lib/llm/adapter": {
      isLLMConfigured: () => true,
      getLLMStream: async () => {
        throw new Error("the adapter is never reached: the stream is a script");
      },
      createLLMObservabilityContext: () => ({}),
      getPostHogServerClient: () => null,
      flushPostHogAfterResponse: () => undefined,
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        throw new Error("no cookie client in the webhook");
      },
    },
  },
});

type Ask = (
  input: AskQuestionInput,
  options: AskRunOptions,
) => AsyncGenerator<AskEvent, void, undefined>;

const mod = loader.load("src/lib/services/ask/arrival.ts") as {
  askOnArrival: (
    params: {
      supabase: unknown;
      jobId: string;
      matchId: string;
      deadline?: number;
    },
    deps?: {
      ask?: Ask;
      model?: { configured: boolean; stream: () => Promise<never> };
      now?: () => number;
    },
  ) => Promise<{
    conversationId: string;
    answerId: string | null;
    headline: string;
    question: string;
  } | null>;
  arrivalUserClient: (
    service: {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<AskRpcResult>;
    },
    userId: string,
  ) => {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<AskRpcResult>;
  };
};

const MODEL = {
  configured: true,
  stream: async () => {
    throw new Error("not called");
  },
};

function run(record: Partial<AskRunRecord> = {}): AskRunRecord {
  return {
    question: "q",
    programId: null,
    conversationId: CONVERSATION,
    outcome: "done",
    route: "review",
    planAttempts: 1,
    modelCalls: 2,
    queryCount: 1,
    preStreamMs: null,
    planMs: 100,
    queryMs: 10,
    answerMs: 200,
    toHeadlineMs: 150,
    totalMs: 400,
    visualKind: null,
    rowCount: 1,
    matchCount: 1,
    asksForAdvice: false,
    planModel: null,
    answerModel: null,
    mock: false,
    ...record,
  };
}

/** A stream that answers like a review: saves through `db`, reaches `done`, records its run. */
function answered(seen: { input?: AskQuestionInput } = {}): Ask {
  return async function* (input, options) {
    seen.input = input;
    yield { type: "status", stage: "planning" };
    yield { type: "sources", matches: [] };
    yield { type: "headline", text: "You held serve all the way through." };
    yield { type: "text", delta: "Every service game was yours." };
    await input.db.rpc("ask_save_exchange_ids", {
      p_conversation_id: null,
      p_question: { text: input.question, tags: input.tags.saved },
      p_answer: { headline: "h", body: "b" },
    });
    yield {
      type: "done",
      conversationId: CONVERSATION,
      answerId: ANSWER,
      used: 0,
      cap: 0,
    };
    await options.onRun(run({ question: input.question }));
  };
}

function quiet() {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  test.beforeEach(() => {
    console.log = console.warn = console.error = () => undefined;
  });
  test.afterEach(() => Object.assign(console, saved));
}

test.describe("askOnArrival", () => {
  quiet();

  test("asks the match starter for the uploader, writes every user-side call as the named user, puts the answer away under the starter's key, and returns the headline", async () => {
    const { client, rpc, claims } = fakeAdmin();
    const seen: { input?: AskQuestionInput } = {};
    const result = await mod.askOnArrival(
      { supabase: client, jobId: JOB, matchId: MATCH },
      { ask: answered(seen), model: MODEL },
    );

    expect(result).toEqual({
      conversationId: CONVERSATION,
      answerId: ANSWER,
      headline: "You held serve all the way through.",
      question: "How did my match against Anna Lee go?",
    });

    // The question is the starter's, with the match tagged and nothing spent.
    expect(seen.input?.question).toBe("How did my match against Anna Lee go?");
    expect(seen.input?.tags.matchIds).toEqual([MATCH]);
    expect(seen.input?.tags.saved).toEqual([
      { kind: "match", id: MATCH, label: "Oct 1, 2026 · Anna Lee" },
    ]);
    expect(seen.input?.reservation).toBeNull();
    expect(seen.input?.scope).toEqual(PERSONAL_ASK_SCOPE);
    expect(seen.input?.conversationId).toBeNull();

    // Once per match.
    expect(claims).toEqual([`ask_arrival:${MATCH}`]);

    // Every user-side write went to its `_as` form, as the uploader.
    const named = rpc.filter((call) => call.fn.endsWith("_as"));
    for (const call of named) expect(call.args?.p_user_id).toBe(UPLOADER);
    expect(named.map((call) => call.fn)).toEqual([
      "ask_data_version_as",
      "ask_save_exchange_as",
      "ask_record_run_as",
      "ask_cache_put_as",
    ]);
    expect(rpc.find((c) => c.fn === "ask_data_version_as")?.args).toEqual({
      p_program_id: null,
      p_user_id: UPLOADER,
    });
    expect(rpc.find((c) => c.fn === "ask_save_exchange_as")?.args).toEqual({
      p_conversation_id: null,
      p_question: {
        text: "How did my match against Anna Lee go?",
        tags: [{ kind: "match", id: MATCH, label: "Oct 1, 2026 · Anna Lee" }],
      },
      p_answer: { headline: "h", body: "b" },
      p_user_id: UPLOADER,
    });
    const put = rpc.find((c) => c.fn === "ask_cache_put_as")?.args;
    expect(put).toMatchObject({
      p_user_id: UPLOADER,
      p_data_version: "v1",
      p_program_id: null,
      // The key the page's first starter computes for this match.
      p_cache_key: askCacheKey({
        question: "How did my match against Anna Lee go?",
        tags: { prompt: [], saved: [], matchIds: [MATCH] },
        scope: PERSONAL_ASK_SCOPE,
      }),
    });
    // Nothing reached the service-only functions by their user-side names.
    expect(rpc.some((c) => c.fn === "ask_save_exchange_ids")).toBe(false);
    expect(rpc.some((c) => c.fn === "ask_quota")).toBe(false);
  });

  test("a claimed roster profile seats the uploader too", async () => {
    const { client } = fakeAdmin({
      match: matchRow({ player1_id: "stranger", player2_id: CLAIMED }),
      claimed: [CLAIMED],
    });
    const seen: { input?: AskQuestionInput } = {};
    const result = await mod.askOnArrival(
      { supabase: client, jobId: JOB, matchId: MATCH },
      { ask: answered(seen), model: MODEL },
    );
    // Player two's opponent is player one.
    expect(result?.question).toBe("How did my match against Alex Rivera go?");
  });

  test("no question for a program's match, a job someone else sent, a match the uploader is not in, a match already asked about, mock mode, a match that cannot be read, or no time left", async () => {
    let asked = 0;
    const counting: Ask = async function* () {
      asked += 1;
    };
    const cases: {
      opts: FakeOptions;
      deps?: Record<string, unknown>;
      deadline?: number;
    }[] = [
      {
        opts: {
          match: matchRow({
            program_id: "pppppppp-0000-4000-8000-000000000001",
          }),
        },
      },
      // The job was sent by someone else: the mail would go to them.
      { opts: { jobOwner: "99999999-0000-4000-8000-000000000009" } },
      {
        opts: {
          match: matchRow({ player1_id: "stranger", player2_id: "other" }),
        },
      },
      { opts: { match: matchRow({ created_by: null, player1_id: null }) } },
      { opts: { alreadyClaimed: true } },
      { opts: {}, deps: { model: { ...MODEL, configured: false } } },
      { opts: { match: null } },
      { opts: { matchError: "boom" } },
      // 5 s left is under the floor: not started.
      { opts: {}, deadline: Date.now() + 5_000 },
    ];
    for (const c of cases) {
      const { client, claims } = fakeAdmin(c.opts);
      const result = await mod.askOnArrival(
        { supabase: client, jobId: JOB, matchId: MATCH, deadline: c.deadline },
        { ask: counting, model: MODEL, ...(c.deps ?? {}) },
      );
      expect(result).toBeNull();
      // The claim is only made once a question is about to be asked.
      if (c.opts.alreadyClaimed) expect(claims).toHaveLength(1);
      else expect(claims).toHaveLength(0);
    }
    expect(asked).toBe(0);
  });

  test("a question that fails, or a stream that throws, is no answer and never throws", async () => {
    const failed: Ask = async function* () {
      yield { type: "status", stage: "planning" };
      yield { type: "error", code: "no_data", error: "nothing" };
    };
    const first = fakeAdmin();
    expect(
      await mod.askOnArrival(
        { supabase: first.client, jobId: JOB, matchId: MATCH },
        { ask: failed, model: MODEL },
      ),
    ).toBeNull();

    const throwing: Ask = async function* () {
      yield { type: "status", stage: "planning" };
      throw new Error("provider down");
    };
    const second = fakeAdmin();
    expect(
      await mod.askOnArrival(
        { supabase: second.client, jobId: JOB, matchId: MATCH },
        { ask: throwing, model: MODEL },
      ),
    ).toBeNull();
  });

  test("without a data version the answer is still written, just not cached", async () => {
    const { client, rpc } = fakeAdmin({ dataVersion: null });
    const result = await mod.askOnArrival(
      { supabase: client, jobId: JOB, matchId: MATCH },
      { ask: answered(), model: MODEL },
    );
    expect(result?.conversationId).toBe(CONVERSATION);
    expect(rpc.some((c) => c.fn === "ask_cache_put_as")).toBe(false);
    expect(rpc.some((c) => c.fn === "ask_save_exchange_as")).toBe(true);
  });
});

test.describe("arrivalUserClient", () => {
  test("sends each user-side call to its `_as` form with the user written last, answers the meter with nothing, and refuses the rest", async () => {
    const calls: { fn: string; args?: Record<string, unknown> }[] = [];
    const service = {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: null, error: null };
      },
    };
    const user = mod.arrivalUserClient(service, UPLOADER);

    await user.rpc("ask_save_exchange_ids", {
      p_conversation_id: null,
      p_question: {},
      p_answer: {},
      // A caller naming another user is overwritten, never forwarded.
      p_user_id: "somebody-else",
    });
    await user.rpc("ask_record_run", { p_run: { outcome: "done" } });
    await user.rpc("ask_cache_put", { p_cache_key: "k" });
    await user.rpc("ask_data_version", { p_program_id: null });
    expect(calls).toEqual([
      {
        fn: "ask_save_exchange_as",
        args: {
          p_conversation_id: null,
          p_question: {},
          p_answer: {},
          p_user_id: UPLOADER,
        },
      },
      {
        fn: "ask_record_run_as",
        args: { p_run: { outcome: "done" }, p_user_id: UPLOADER },
      },
      {
        fn: "ask_cache_put_as",
        args: { p_cache_key: "k", p_user_id: UPLOADER },
      },
      {
        fn: "ask_data_version_as",
        args: { p_program_id: null, p_user_id: UPLOADER },
      },
    ]);

    expect(await user.rpc("ask_quota")).toEqual({ data: null, error: null });
    const refused = await user.rpc("ask_reserve_question");
    expect(refused.data).toBeNull();
    expect(refused.error?.code).toBe("42501");
    const feedback = await user.rpc("ask_rate_answer", { p_answer_id: "x" });
    expect(feedback.error?.code).toBe("42501");
    expect(calls).toHaveLength(4);
  });
});
