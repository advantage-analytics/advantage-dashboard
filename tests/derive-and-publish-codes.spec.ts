import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `deriveAndPublish()`'s job bookkeeping, run against a fake Supabase client.
 *
 * The function takes its client as a parameter, so the fake below records
 * every `processing_jobs` update and answers the one read it makes (the
 * `derivation_quality` merge). Its three imports with side effects —
 * `persistTranscript`, the insights request and the analysis mail — are
 * stubbed through the vm loader, so nothing reaches Storage, a model or
 * Resend. Under test:
 *
 *  - a deterministic persist refusal writes `DERIVATION_REFUSED`, while a
 *    database error surfaced through the same `ok: false` writes
 *    `DERIVATION_ERROR` (it must stay rebuildable);
 *  - an RPC error and a throw write `DERIVATION_ERROR`;
 *  - success clears `error_code` alongside `error_message`;
 *  - an unreconciled fold merges `fold` into `derivation_quality` and keeps
 *    every key grading wrote — and a failed merge never fails the derivation.
 */

const JOB = "job-1";
const MATCH = "m-1";

type Update = Record<string, unknown>;

interface FakeOptions {
  rpcError?: { fn: string; message: string };
  derivationQuality?: Record<string, unknown> | null;
  qualityReadError?: string;
}

function fakeSupabase(opts: FakeOptions = {}) {
  const updates: Update[] = [];
  const rpcCalls: string[] = [];

  const client = {
    from(table: string) {
      if (table !== "processing_jobs")
        throw new Error(`unexpected table ${table}`);
      return {
        update(payload: Update) {
          updates.push(payload);
          const done = Promise.resolve({ error: null });
          return { eq: () => done };
        },
        select(cols: string) {
          if (cols !== "derivation_quality")
            throw new Error(`unexpected select ${cols}`);
          return {
            eq: () => ({
              single: async () =>
                opts.qualityReadError
                  ? { data: null, error: { message: opts.qualityReadError } }
                  : {
                      data: {
                        derivation_quality: opts.derivationQuality ?? null,
                      },
                      error: null,
                    },
            }),
          };
        },
      };
    },
    async rpc(fn: string) {
      rpcCalls.push(fn);
      return opts.rpcError?.fn === fn
        ? { error: { message: opts.rpcError.message } }
        : { error: null };
    },
  };

  return { client, updates, rpcCalls };
}

function transcript(reconciled: boolean) {
  return {
    ok: true,
    reason: reconciled ? null : undefined,
    points: [],
    reconciliation: reconciled
      ? { ok: true, player1Source: "fold", reason: null }
      : {
          ok: false,
          player1Source: "geometry",
          reason: "folded score does not match the entered score",
        },
  };
}

function load(persist: () => Promise<unknown>) {
  const mail: string[] = [];
  const loader = createLoader({
    // The module's `err instanceof Error` must see the realm the stubs throw in.
    globals: { Error },
    stubs: {
      "./persist-transcript": { persistTranscript: persist },
      "./request-insights": {
        insightsWaitMs: () => 0,
        requestMatchInsights: async () => undefined,
        waitForInsights: async () => true,
      },
      "@/lib/services/notifications/analysis-mail": {
        notifyAnalysisOutcome: async ({ outcome }: { outcome: string }) => {
          mail.push(outcome);
        },
      },
    },
  });
  const mod = loader.load("src/lib/services/splitstep/derive-and-publish.ts");
  return {
    deriveAndPublish: mod.deriveAndPublish as (p: {
      supabase: unknown;
      jobId: string;
    }) => Promise<{ ok: boolean; reason?: string }>,
    mail,
  };
}

/** The function logs every outcome; keep the run readable, then restore. */
function quietConsole() {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  test.beforeEach(() => {
    console.log = console.warn = console.error = () => undefined;
  });
  test.afterEach(() => Object.assign(console, saved));
}

const written =
  (reconciled = true) =>
  async () => ({
    ok: true,
    matchId: MATCH,
    pointsWritten: 10,
    shotsWritten: 40,
    transcript: transcript(reconciled),
  });

test.describe("deriveAndPublish error codes", () => {
  quietConsole();

  test("a deterministic persist refusal writes DERIVATION_REFUSED", async () => {
    const reason = "3 point(s) resolved no winner";
    const { deriveAndPublish, mail } = load(async () => ({
      ok: false,
      reason,
      transcript: null,
      failure: "refused",
    }));
    const fake = fakeSupabase();

    const out = await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(out).toEqual({ ok: false, reason });
    expect(fake.updates).toEqual([
      { status: "deriving" },
      {
        status: "derivation_failed",
        error_message: reason,
        error_code: "DERIVATION_REFUSED",
      },
    ]);
    expect(fake.rpcCalls).toEqual([]);
    expect(mail).toEqual(["failed"]);
  });

  test("a database error surfaced as a persist refusal writes DERIVATION_ERROR", async () => {
    const reason = "points insert failed: connection reset";
    const { deriveAndPublish } = load(async () => ({
      ok: false,
      reason,
      transcript: null,
      failure: "error",
    }));
    const fake = fakeSupabase();

    await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(fake.updates.at(-1)).toEqual({
      status: "derivation_failed",
      error_message: reason,
      error_code: "DERIVATION_ERROR",
    });
  });

  test("an RPC error writes DERIVATION_ERROR", async () => {
    const { deriveAndPublish, mail } = load(written());
    const fake = fakeSupabase({
      rpcError: { fn: "calculate_match_stats", message: "deadlock detected" },
    });

    const out = await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(out.ok).toBe(false);
    expect(fake.rpcCalls).toEqual(["calculate_match_stats"]);
    expect(fake.updates.at(-1)).toEqual({
      status: "derivation_failed",
      error_message: "calculate_match_stats failed: deadlock detected",
      error_code: "DERIVATION_ERROR",
    });
    expect(mail).toEqual(["failed"]);
  });

  test("a throw writes DERIVATION_ERROR", async () => {
    const { deriveAndPublish } = load(async () => {
      throw new Error("boom");
    });
    const fake = fakeSupabase();

    const out = await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(out).toEqual({ ok: false, reason: "boom" });
    expect(fake.updates.at(-1)).toEqual({
      status: "derivation_failed",
      error_message: "boom",
      error_code: "DERIVATION_ERROR",
    });
  });

  test("success clears error_code with error_message", async () => {
    const { deriveAndPublish, mail } = load(written());
    const fake = fakeSupabase();

    const out = await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(out.ok).toBe(true);
    expect(fake.rpcCalls).toEqual([
      "calculate_match_stats",
      "backfill_returns_in_and_net_points",
    ]);
    expect(fake.updates).toEqual([
      { status: "deriving" },
      { status: "completed", error_message: null, error_code: null },
    ]);
    expect(mail).toEqual(["ready"]);
  });
});

test.describe("deriveAndPublish unreconciled fold", () => {
  quietConsole();

  test("merges fold into derivation_quality and keeps grading's keys", async () => {
    const graded = {
      grade: "pass",
      checks: { rallies: true },
      failures: [],
      warnings: ["low stroke density"],
      gradedBy: "grade-results@3",
      rallyCount: 120,
      strokeCount: 900,
    };
    const { deriveAndPublish } = load(written(false));
    const fake = fakeSupabase({ derivationQuality: graded });

    const out = await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(out.ok).toBe(true);
    expect(fake.updates).toEqual([
      { status: "deriving" },
      { status: "completed", error_message: null, error_code: null },
      {
        derivation_quality: {
          ...graded,
          fold: {
            reconciled: false,
            reason: "folded score does not match the entered score",
          },
        },
      },
    ]);
  });

  test("writes just fold when derivation_quality is null", async () => {
    const { deriveAndPublish } = load(written(false));
    const fake = fakeSupabase({ derivationQuality: null });

    await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(fake.updates.at(-1)).toEqual({
      derivation_quality: {
        fold: {
          reconciled: false,
          reason: "folded score does not match the entered score",
        },
      },
    });
  });

  test("a reconciled fold writes nothing to derivation_quality", async () => {
    const { deriveAndPublish } = load(written(true));
    const fake = fakeSupabase({ derivationQuality: { grade: "pass" } });

    await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(fake.updates.some((u) => "derivation_quality" in u)).toBe(false);
  });

  test("a failed merge does not fail the derivation", async () => {
    const { deriveAndPublish } = load(written(false));
    const fake = fakeSupabase({ qualityReadError: "timeout" });

    const out = await deriveAndPublish({ supabase: fake.client, jobId: JOB });

    expect(out.ok).toBe(true);
    expect(fake.updates).toEqual([
      { status: "deriving" },
      { status: "completed", error_message: null, error_code: null },
    ]);
  });
});
