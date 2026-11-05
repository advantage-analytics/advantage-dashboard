import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  handleReprocess,
  MAX_ITEMS,
  type ReprocessAuth,
} from "@/app/api/admin/splitstep/reprocess/handler";
import {
  analyzeResults,
  buildTranscript,
  normalizeStroke,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";
import { deriveAndPublish } from "@/lib/services/splitstep/derive-and-publish";
import {
  hideInFlightReprocess,
  isReprocessChildIn,
  readReprocessParent,
} from "@/lib/services/splitstep/reprocess";
import type { ResubmitResult } from "@/lib/services/splitstep/resubmit-job";
import { notifyAnalysisOutcome } from "@/lib/services/notifications/analysis-mail";
import { resolveAnalysisStatus } from "@/lib/data/match-analysis";
import {
  liveAnalysisPatch,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";

/**
 * The admin reprocess path, offline: no Supabase, no vendor, no mail.
 *
 *  - which rows count as a reprocess child, and what the athlete's analysis
 *    state chooses from while one is in flight;
 *  - the child's `job_completed` over a HAND-LABELLED match, through the real
 *    `deriveAndPublish` → `persistTranscript` against the committed
 *    `clean-match.json`: nothing is written to points, shots or match_stats,
 *    no statistics RPC runs, the job ends `completed` and the labels' fold is
 *    carried across;
 *  - no athlete mail for a reprocess job;
 *  - the route's handler: admin gate, label-session refusal and `force`,
 *    match → newest completed job;
 *  - the parser's `ball_` prefix fallback.
 *
 * `resubmitJob`'s own reprocess ladder (quota untouched, completed parents
 * only in reprocess mode) is in resubmit-authorization.spec.ts beside the
 * fake it shares.
 */

// ── A chainable fake of the PostgREST shapes these paths use ──────────────

type Row = Record<string, unknown>;

interface Call {
  table: string;
  op: "select" | "update" | "insert" | "delete" | "upsert";
  columns?: string;
  eqs: Record<string, unknown>;
  neqs: Record<string, unknown>;
  ins?: Record<string, readonly unknown[]>;
  payload?: unknown;
  contains?: unknown;
}

type Answer = { data?: unknown; error?: unknown; count?: number };

function fakeDb(resolve: (call: Call, mode: "many" | "one") => Answer) {
  const calls: Call[] = [];
  const rpcs: string[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", eqs: {}, neqs: {} };
      calls.push(call);
      const run = (mode: "many" | "one") =>
        Promise.resolve({
          data: null,
          error: null,
          ...resolve(call, mode),
        });
      const b = {
        select(columns?: string) {
          if (call.op === "select") call.columns = columns;
          return b;
        },
        update(payload: unknown) {
          call.op = "update";
          call.payload = payload;
          return b;
        },
        insert(payload: unknown) {
          call.op = "insert";
          call.payload = payload;
          return b;
        },
        upsert(payload: unknown) {
          call.op = "upsert";
          call.payload = payload;
          return b;
        },
        delete() {
          call.op = "delete";
          return b;
        },
        eq(col: string, value: unknown) {
          call.eqs[col] = value;
          return b;
        },
        neq(col: string, value: unknown) {
          call.neqs[col] = value;
          return b;
        },
        in(col: string, values: readonly unknown[]) {
          call.ins = { ...call.ins, [col]: values };
          return b;
        },
        not: () => b,
        order: () => b,
        limit: () => b,
        contains(_col: string, value: unknown) {
          call.contains = value;
          return b;
        },
        single: () => run("one"),
        maybeSingle: () => run("one"),
        then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
          return run("many").then(ok, bad);
        },
      };
      return b;
    },
    async rpc(fn: string) {
      rpcs.push(fn);
      return { data: null, error: null };
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: { text: async () => JSON.stringify(clean) },
          error: null,
        }),
      }),
    },
  };
  return { calls, rpcs, client };
}

function quietConsole() {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  test.beforeEach(() => {
    console.log = console.warn = console.error = () => undefined;
  });
  test.afterEach(() => Object.assign(console, saved));
}

const clean = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "splitstep", "clean-match.json"),
    "utf8",
  ),
);

// ── Which rows are reprocess children ──────────────────────────────────────

test.describe("isReprocessChildIn / hideInFlightReprocess", () => {
  const parent = {
    id: "p",
    status: "completed",
    resubmitted_from_job_id: null,
  };
  const child = (status: string) => ({
    id: "c",
    status,
    resubmitted_from_job_id: "p",
  });

  test("a child of a completed job is a reprocess child; a retry of a failed one is not", () => {
    expect(isReprocessChildIn(child("queued"), [child("queued"), parent])).toBe(
      true,
    );
    const failedParent = { ...parent, status: "failed" };
    expect(
      isReprocessChildIn(child("queued"), [child("queued"), failedParent]),
    ).toBe(false);
    expect(isReprocessChildIn(parent, [parent])).toBe(false);
  });

  test("an in-flight or failed reprocess is hidden, so the completed parent stands", () => {
    for (const status of [
      "queued",
      "processing",
      "deriving",
      "failed",
      "derivation_failed",
    ]) {
      expect(hideInFlightReprocess([child(status), parent])).toEqual([parent]);
    }
  });

  test("a completed reprocess is kept — it is the newest finished analysis", () => {
    expect(hideInFlightReprocess([child("completed"), parent])).toEqual([
      child("completed"),
      parent,
    ]);
  });

  test("an ordinary retry chain is untouched", () => {
    const failed = { id: "p", status: "failed", resubmitted_from_job_id: null };
    expect(hideInFlightReprocess([child("queued"), failed])).toEqual([
      child("queued"),
      failed,
    ]);
  });
});

// ── The child's job_completed over hand labels ─────────────────────────────

const analysis = analyzeResults(clean, { startTimeSeconds: 0 });
/** The fixture's own folded score, so the transcript reconciles. */
const SCORE = (() => {
  const probe = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: { player1: [], player2: [] },
    initialTopIsPlayer1: null,
  });
  const [p1, p2] = analysis.players;
  const sets = probe.reconciliation.foldedSets;
  return {
    player1: sets.map((s) => s[p1] ?? 0),
    player2: sets.map((s) => s[p2] ?? 0),
  };
})();

const LABELS_FOLD = { reconciled: false, source: "labels" };

function reprocessWorld(opts: {
  labelled: number;
  resultsKey?: string | null;
}) {
  const jobs: Record<string, Row> = {
    child: {
      id: "child",
      match_id: "match",
      status: "graded",
      resubmitted_from_job_id: "parent",
      results_object_key:
        opts.resultsKey === undefined
          ? "results/u/match/child.json"
          : opts.resultsKey,
      start_time_seconds: 0,
      initial_top_player_is_player1: null,
      ad_scoring: true,
      trajectories_object_key: null,
      vendor_request: null,
      derivation_quality: { grade: "A" },
    },
    parent: {
      id: "parent",
      match_id: "match",
      status: "completed",
      resubmitted_from_job_id: null,
      derivation_version: "v-parent",
      derivation_quality: { grade: "B", fold: LABELS_FOLD },
    },
  };
  const db = fakeDb((call) => {
    if (call.table === "processing_jobs") {
      const row = jobs[call.eqs.id as string];
      if (call.op === "update") {
        if (
          row &&
          !(call.neqs.status !== undefined && row.status === call.neqs.status)
        ) {
          Object.assign(row, call.payload);
          return { data: [{ id: row.id }] };
        }
        return { data: [] };
      }
      return { data: row ?? null };
    }
    if (call.table === "matches") {
      return {
        data: {
          id: "match",
          score: SCORE,
          initial_top_player_is_player1: null,
          format: { ad_scoring: true, best_of: 3 },
          player1_name: "A",
          player2_name: "B",
        },
      };
    }
    if (call.table === "points" && call.op === "select") {
      return { count: call.contains ? opts.labelled : 0 };
    }
    return { data: null };
  });
  return { ...db, jobs };
}

/** Anything that would change the published match. */
function publishedWrites(calls: Call[]) {
  return calls.filter(
    (c) =>
      ["points", "shots", "match_stats", "matches"].includes(c.table) &&
      c.op !== "select",
  );
}

test.describe("a reprocess child's completion over a hand-labelled match", () => {
  quietConsole();

  test("leaves points, shots and match_stats untouched and the job completed", async () => {
    const world = reprocessWorld({ labelled: 87 });
    let arrivals = 0;

    const out = await deriveAndPublish({
      supabase: world.client as never,
      jobId: "child",
      onArrival: async () => {
        arrivals += 1;
        return null;
      },
    });

    expect(out).toMatchObject({ ok: false, kept: true });
    expect(publishedWrites(world.calls)).toEqual([]);
    // No calculate_match_stats, no backfill: the stats rows stay as they were.
    expect(world.rpcs).toEqual([]);
    // It did check, against the right flag.
    expect(
      world.calls.find((c) => c.table === "points" && c.contains)?.contains,
    ).toBe('["hand_labelled"]');
    expect(world.jobs.child.status).toBe("completed");
    expect(world.jobs.parent.status).toBe("completed");
    // Without the version a completed job reads "processed" (Stats pending),
    // and the child is now the match's newest job — so it inherits the
    // version its kept rows were derived under, in the same write.
    expect(world.jobs.child.derivation_version).toBe("v-parent");
    expect(
      resolveAnalysisStatus(
        world.jobs.child.status as string,
        world.jobs.child.derivation_version as string,
      ),
    ).toBe("completed");
    const completedWrite = world.calls.find(
      (c) =>
        c.table === "processing_jobs" &&
        c.op === "update" &&
        (c.payload as Row).status === "completed",
    );
    expect(completedWrite?.payload).toEqual({
      status: "completed",
      derivation_version: "v-parent",
    });
    // The labels' fold follows the newest completed job; grading's keys stay.
    expect(world.jobs.child.derivation_quality).toEqual({
      grade: "A",
      fold: LABELS_FOLD,
    });
    expect(arrivals).toBe(0);
  });

  test("a new file that cannot be derived still keeps the job completed, never derivation_failed", async () => {
    const world = reprocessWorld({ labelled: 87, resultsKey: null });

    const out = await deriveAndPublish({
      supabase: world.client as never,
      jobId: "child",
    });

    expect(out).toMatchObject({ ok: false, kept: true });
    expect(world.jobs.child.status).toBe("completed");
    expect(world.jobs.child.error_code).toBeUndefined();
    expect(publishedWrites(world.calls)).toEqual([]);
  });

  test("the same refusal on an ORDINARY job (not a reprocess) still fails it — unchanged", async () => {
    const world = reprocessWorld({ labelled: 87, resultsKey: null });
    world.jobs.parent.status = "failed";

    await deriveAndPublish({ supabase: world.client as never, jobId: "child" });

    expect(world.jobs.child.status).toBe("derivation_failed");
  });
});

test.describe("readReprocessParent", () => {
  quietConsole();

  test("names a child of a completed job, and only that", async () => {
    const world = reprocessWorld({ labelled: 0 });
    expect(await readReprocessParent(world.client as never, "child")).toEqual({
      reprocess: true,
      parentId: "parent",
    });
    expect(await readReprocessParent(world.client as never, "parent")).toEqual({
      reprocess: false,
      parentId: null,
    });
  });

  test("a client that throws reads as the ordinary path", async () => {
    const throwing = {
      from() {
        throw new Error("boom");
      },
    } as unknown as SupabaseClient;
    expect(await readReprocessParent(throwing, "child")).toEqual({
      reprocess: false,
      parentId: null,
    });
  });
});

test.describe("notifyAnalysisOutcome for a reprocess job", () => {
  quietConsole();

  test("mails the athlete nothing — no prefs read, no send claimed", async () => {
    const jobs: Record<string, Row> = {
      child: {
        id: "child",
        created_by: "u-athlete",
        match_id: "match",
        status: "completed",
        resubmitted_from_job_id: "parent",
      },
      parent: { id: "parent", status: "completed" },
    };
    const db = fakeDb((call) =>
      call.table === "processing_jobs"
        ? { data: jobs[call.eqs.id as string] ?? null }
        : { data: null },
    );

    await notifyAnalysisOutcome({
      supabase: db.client as unknown as SupabaseClient,
      jobId: "child",
      outcome: "ready",
    });

    expect([...new Set(db.calls.map((c) => c.table))]).toEqual([
      "processing_jobs",
    ]);
  });
});

// ── The route's handler ────────────────────────────────────────────────────

const M1 = "19b3cdf6-691f-44e5-b519-c79887bacdce";
const M2 = "f59c2c4e-9aa6-4a87-989d-d1f0b2aa6f1a";
const M3 = "0bd6a4e5-0000-4000-8000-000000000003";
const M4 = "0bd6a4e5-0000-4000-8000-000000000004";
const J1 = "aaaaaaaa-0000-4000-8000-000000000001";

function handlerWorld(opts: { auth?: ReprocessAuth } = {}) {
  const completed: Record<string, string> = {
    [M1]: "job-m1",
    [M2]: "job-m2",
    [M4]: "job-m4",
  };
  // Each match's open label session, by status.
  const sessionStatus: Record<string, string> = {
    [M2]: "labelling",
    [M4]: "submitted",
  };
  const db = fakeDb((call, mode) => {
    if (call.table === "processing_jobs") {
      if (call.eqs.id === J1) return { data: { id: J1, match_id: M1 } };
      if (call.eqs.id) return { data: null };
      const id = completed[call.eqs.match_id as string];
      expect(call.eqs.status).toBe("completed");
      return { data: id ? { id } : null };
    }
    if (call.table === "label_sessions") {
      expect(mode).toBe("many");
      const status = sessionStatus[call.eqs.match_id as string];
      const asked = call.ins?.status ?? [];
      return { data: status && asked.includes(status) ? [{ id: "s" }] : [] };
    }
    throw new Error(`unexpected table ${call.table}`);
  });
  const sent: { jobId: string; requestedBy: string }[] = [];
  const deps = {
    authorize: async () =>
      opts.auth ?? ({ ok: true, actor: "admin-1" } as const),
    supabase: db.client as unknown as SupabaseClient,
    reprocess: async (input: { jobId: string; requestedBy: string }) => {
      sent.push(input);
      return {
        ok: true,
        jobId: `child-of-${input.jobId}`,
        externalJobId: "ext",
      } as ResubmitResult;
    },
  };
  const post = (body: unknown) =>
    handleReprocess(
      new Request("http://localhost/api/admin/splitstep/reprocess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      deps,
    );
  return { post, sent };
}

test.describe("POST /api/admin/splitstep/reprocess (handler)", () => {
  quietConsole();

  test("no session → 401, a non-admin → 403, and nothing is sent", async () => {
    for (const status of [401, 403] as const) {
      const w = handlerWorld({ auth: { ok: false, status } });
      const res = await w.post({ matchIds: [M1] });
      expect(res.status).toBe(status);
      expect(w.sent).toEqual([]);
    }
  });

  test("a match resolves to its newest completed job and is sent as a reprocess", async () => {
    const w = handlerWorld();
    const res = await w.post({ matchIds: [M1] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [
        {
          matchId: M1,
          parentJobId: "job-m1",
          childJobId: "child-of-job-m1",
          externalJobId: "ext",
        },
      ],
    });
    expect(w.sent).toEqual([{ jobId: "job-m1", requestedBy: "admin-1" }]);
  });

  test("a label session still labelling is refused without force", async () => {
    const w = handlerWorld();
    const res = await w.post({ matchIds: [M1, M2] });
    const { results } = res.body as { results: Row[] };
    expect(results[1]).toMatchObject({
      matchId: M2,
      parentJobId: "job-m2",
      code: "labelling_in_progress",
    });
    expect(w.sent.map((s) => s.jobId)).toEqual(["job-m1"]);
  });

  test("a session submitted for review is refused too, until force", async () => {
    // A labeller handed it in and no admin has published it: as unprotected
    // as one still labelling.
    const w = handlerWorld();
    const res = await w.post({ matchIds: [M4] });
    const { results } = res.body as { results: Row[] };
    expect(results[0]).toMatchObject({
      matchId: M4,
      parentJobId: "job-m4",
      code: "labelling_in_progress",
    });
    expect(w.sent).toEqual([]);
    await w.post({ matchIds: [M4], force: true });
    expect(w.sent.map((s) => s.jobId)).toEqual(["job-m4"]);
  });

  test("force sends it anyway", async () => {
    const w = handlerWorld();
    await w.post({ matchIds: [M2], force: true });
    expect(w.sent.map((s) => s.jobId)).toEqual(["job-m2"]);
  });

  test("a match with no completed job is a per-item refusal, not a request failure", async () => {
    const w = handlerWorld();
    const res = await w.post({ matchIds: [M3, M1] });
    const { results } = res.body as { results: Row[] };
    expect(res.status).toBe(200);
    expect(results[0]).toMatchObject({ matchId: M3, code: "not_completed" });
    expect(w.sent.map((s) => s.jobId)).toEqual(["job-m1"]);
  });

  test("a job id names the parent directly", async () => {
    const w = handlerWorld();
    const res = await w.post({ jobIds: [J1] });
    expect((res.body as { results: Row[] }).results[0]).toMatchObject({
      matchId: M1,
      parentJobId: J1,
    });
  });

  test("a vendor refusal comes back on its line with resubmitJob's reason", async () => {
    const res = await handleReprocess(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ matchIds: [M1] }),
      }),
      {
        authorize: async () => ({ ok: true, actor: "cron" }),
        supabase: fakeDb((call) =>
          call.table === "label_sessions"
            ? { data: [] }
            : { data: { id: "job-m1" } },
        ).client as unknown as SupabaseClient,
        reprocess: async () => ({
          ok: false,
          reason: "in_flight_duplicate",
          message: "An analysis for this match is already in progress.",
        }),
      },
    );
    expect((res.body as { results: Row[] }).results[0]).toMatchObject({
      code: "in_flight_duplicate",
    });
  });

  test("bad bodies are 400s", async () => {
    const w = handlerWorld();
    for (const body of [
      {},
      { matchIds: ["not-a-uuid"] },
      { matchIds: [M1], force: "yes" },
      { matchIds: [M1], extra: 1 },
      {
        matchIds: Array.from(
          { length: MAX_ITEMS + 1 },
          (_, i) => `0bd6a4e5-0000-4000-8000-${String(i).padStart(12, "0")}`,
        ),
      },
    ]) {
      expect((await w.post(body)).status).toBe(400);
    }
    expect(w.sent).toEqual([]);
  });
});

// ── The ball_ prefix rename ────────────────────────────────────────────────

test.describe("normalizeStroke — ball_ prefix fallback", () => {
  const base = {
    frame: 120,
    time: 4,
    event_id: 1,
    pred_rally_id: 1,
    pred_rally_stroke_number: 1,
    pred_player_id: "near",
  };

  test("the old names still parse", () => {
    const s = normalizeStroke(
      {
        ...base,
        speed_kmh: 120,
        spin_type: "topspin",
        initial_height_m: 1.1,
        height_at_net_m: 1.4,
        ang_vel_mag_rpm: 2100,
      } as unknown as RawSplitStepStroke,
      0,
    );
    expect(s).toMatchObject({
      speedKmh: 120,
      spinType: "topspin",
      initialHeightM: 1.1,
      heightAtNetM: 1.4,
      angVelMagRpm: 2100,
    });
  });

  test("the ball_ names win when both are present", () => {
    const s = normalizeStroke(
      {
        ...base,
        speed_kmh: 120,
        ball_speed_kmh: 131,
        spin_type: "topspin",
        ball_spin_type: "slice",
        initial_height_m: 1.1,
        ball_initial_height_m: 0.9,
        height_at_net_m: 1.4,
        ball_height_at_net_m: 1.2,
        ang_vel_mag_rpm: 2100,
        ball_ang_vel_mag_rpm: 1800,
      } as unknown as RawSplitStepStroke,
      0,
    );
    expect(s).toMatchObject({
      speedKmh: 131,
      spinType: "slice",
      initialHeightM: 0.9,
      heightAtNetM: 1.2,
      angVelMagRpm: 1800,
    });
  });

  test("a file with only the ball_ names parses, and its sentinels are still nulled", () => {
    const s = normalizeStroke(
      {
        ...base,
        ball_speed_kmh: -9999.0,
        ball_spin_type: "None",
        ball_initial_height_m: 0.8,
        ball_height_at_net_m: -9999,
        ball_ang_vel_mag_rpm: 1500,
      } as unknown as RawSplitStepStroke,
      0,
    );
    expect(s).toMatchObject({
      speedKmh: null,
      spinType: null,
      initialHeightM: 0.8,
      heightAtNetM: null,
      angVelMagRpm: 1500,
    });
  });
});

// ── The realtime hook ──────────────────────────────────────────────────────

test.describe("withLiveAnalysis and a reprocess child", () => {
  const shown = {
    status: "completed" as const,
    progressPercent: 100,
    jobId: "parent",
    attemptsUsed: 1,
  };
  const childRow = (
    status: string,
    derivation_version: string | null = null,
  ) => ({
    id: "child",
    match_id: "match",
    status,
    derivation_version,
    created_at: "2026-11-05T00:00:00Z",
    updated_at: "2026-11-05T00:00:00Z",
    resubmitted_from_job_id: "parent",
    video_object_key: "v",
    results_object_key: null,
    error_message: null,
    error_code: null,
    error_category: null,
    error_step: null,
    upload_progress_percent: null,
    external_job_id: "ext",
  });

  test("a finished report is not replaced by the reprocess child's progress or failure", () => {
    for (const status of [
      "submitting",
      "queued",
      "processing",
      "deriving",
      "failed",
    ]) {
      const patch = liveAnalysisPatch(childRow(status));
      expect(withLiveAnalysis(shown, patch)).toBe(shown);
    }
  });

  test("the child completing with its inherited version does merge", () => {
    const patch = liveAnalysisPatch(childRow("completed", "v-parent"));
    expect(withLiveAnalysis(shown, patch)).toMatchObject({
      status: "completed",
    });
  });

  test("an ordinary retry of a failed analysis still updates live", () => {
    const failed = { ...shown, status: "failed" as const };
    const patch = liveAnalysisPatch(childRow("queued"));
    expect(withLiveAnalysis(failed, patch).status).toBe("queued");
  });
});
