import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  backupObjectKey,
  planApply,
  publishPlanned,
  type ApplyContext,
  type LabelApplyBackup,
} from "@/lib/services/labels/apply-session";
import { buildAppliedRows, expectedStats } from "@/lib/services/labels/apply";
import { writeLabelSessionComplete } from "@/lib/services/labels/session-status-session";
import type { AdminClient } from "@/lib/supabase/admin";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";

/** "Mark complete" publishes; these are the refusals that come before any write. */

/** A client that fails the test on any use: refusals touch nothing. */
const UNTOUCHED = new Proxy(
  {},
  {
    get() {
      throw new Error("the database was touched before a refusal");
    },
  },
) as Parameters<typeof publishPlanned>[0]["db"];

const CONTEXT = {
  session: { id: "s1", matchId: "m1", jobId: "j1" },
  beside: { vendor: [], startTimeSeconds: 0, bestOf: 3 },
} as unknown as ApplyContext;

function plan(
  fields: Partial<{
    problems: string[];
    points: number;
    mismatch: boolean;
  }>,
): ReturnType<typeof planApply> {
  return {
    built: {
      problems: fields.problems ?? [],
      warnings: [],
      letsLeftOut: 0,
      points: Array.from({ length: fields.points ?? 1 }, (_, i) => ({
        point_number: i + 1,
        shots: [],
      })),
    },
    sets: [],
    entered: null,
    mismatch: fields.mismatch
      ? { setNumber: 1, labelled: "4–5", entered: "3–6", reasons: [] }
      : null,
    stats: {},
  } as unknown as ReturnType<typeof planApply>;
}

test("a score mismatch not accepted, or no points: refused, nothing touched", async () => {
  const refuse = async (p: ReturnType<typeof planApply>, acceptScore = false) =>
    publishPlanned({ db: UNTOUCHED, context: CONTEXT, plan: p, acceptScore });

  const mismatch = await refuse(plan({ mismatch: true }));
  expect(mismatch).toEqual({
    ok: false,
    error:
      "Not published: Set 1: labelled 4–5, entered 3–6. Fix the set, mark the video as ending early, or correct the match record.",
  });

  expect(await refuse(plan({ points: 0 }))).toEqual({
    ok: false,
    error: "Not published: there are no points to write.",
  });
});

test("a build problem no longer refuses: the publish goes on past it", async () => {
  // With no job the publish stops at the backup — after the problems, which
  // it reaches and passes; a problem used to stop it first.
  const jobless = {
    ...CONTEXT,
    session: { ...CONTEXT.session, jobId: null },
  } as ApplyContext;
  const result = await publishPlanned({
    db: UNTOUCHED,
    context: jobless,
    plan: plan({ problems: ["Point 4 has no winner"] }),
    acceptScore: true,
  });
  expect(result).toEqual({
    ok: false,
    error:
      "Not published: the match's video job is gone, so the backup would have nowhere to be recorded.",
  });
});

test("a session whose job is gone is refused before anything is stored", async () => {
  const jobless = {
    ...CONTEXT,
    session: { ...CONTEXT.session, jobId: null },
  } as ApplyContext;
  const result = await publishPlanned({
    db: UNTOUCHED,
    context: jobless,
    plan: plan({}),
    acceptScore: false,
  });
  expect(result).toEqual({
    ok: false,
    error:
      "Not published: the match's video job is gone, so the backup would have nowhere to be recorded.",
  });
});

test("backups are keyed match first, so the match purge accepts them as its own", () => {
  const backup = {
    createdAt: "2026-10-10T19:00:00.000Z",
    sessionId: "s1",
    matchId: "m1",
  } as LabelApplyBackup;
  expect(backupObjectKey(backup)).toBe(
    "label-backups/m1/s1/2026-10-10T19-00-00-000Z.json",
  );
  expect(backupObjectKey(backup).startsWith("label-backups/m1/")).toBe(true);
});

// ── The judged marker ────────────────────────────────────────────────────────

/**
 * The fixture session with its one error (point 1, Lee's forehand out)
 * marked `kind`, or left unmarked with null. Point 4 settles no ending and is
 * left out of the publish; point 3 is deleted.
 */
function sessionContext(kind: LabelPoint["errorKind"]): ApplyContext {
  const session = labelSessionFixture();
  session.points = session.points.map((p) =>
    p.id === FIXTURE_POINT_IDS.P1 ? { ...p, errorKind: kind } : p,
  );
  return {
    session,
    beside: { vendor: [], startTimeSeconds: 0, bestOf: 3 },
  } as unknown as ApplyContext;
}

test("planApply: errorsJudged is T12's gate, and the error's result_type carries the mark", () => {
  const forced = planApply(sessionContext("forced"));
  expect(forced.errorsJudged).toBe(true);
  const one = forced.built.points.find((p) => p.pointIndex === 0)!;
  expect(one.result_type).toBe("Forehand Forced Error");
  expect(one.errorKind).toBe("forced");
  // The preview counts it apart, as calculate_match_stats will.
  expect(forced.stats.p1.forcedErrors).toBe(1);
  expect(forced.stats.p1.unforcedErrors).toBe(0);

  expect(planApply(sessionContext("unforced")).errorsJudged).toBe(true);

  const unmarked = planApply(sessionContext(null));
  expect(unmarked.errorsJudged).toBe(false);
  expect(
    unmarked.built.points.find((p) => p.pointIndex === 0)!.result_type,
  ).toBe("Forehand Unforced Error");
  expect(unmarked.stats.p1.forcedErrors).toBe(0);
  expect(unmarked.stats.p1.unforcedErrors).toBe(1);
});

interface Recorded {
  table: string;
  op: string;
  values?: unknown;
}

/**
 * A database for one publish, modelled where the marker matters:
 * `calculate_match_stats` counts `forced_errors` only once
 * `matches.errors_judged_at` is set (T1), and `verify_match` stamps it on
 * `p_errors_judged` and runs the stat function again (the T11 migration).
 * Every other call answers empty and is recorded.
 */
function fakeDatabase(
  options: {
    /** A marker already on the match: a reopened match's earlier publish. */
    errorsJudgedAt?: string;
    failMarker?: boolean;
    failVerify?: boolean;
    failInsights?: boolean;
  } = {},
) {
  const calls: Recorded[] = [];
  const state = {
    points: [] as Record<string, unknown>[],
    errorsJudgedAt: options.errorsJudgedAt ?? (null as string | null),
    stats: null as { forced_errors: number | null } | null,
    /** What the stat function saw of the marker, each time it ran. */
    statsRuns: [] as boolean[],
  };
  const calculateMatchStats = () => {
    const judged = state.errorsJudgedAt !== null;
    state.statsRuns.push(judged);
    state.stats = {
      forced_errors: judged
        ? state.points.filter((p) => {
            const t = String(p.result_type ?? "");
            return t.includes("Forced Error") && !t.includes("Unforced");
          }).length
        : null,
    };
  };
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: fn, op: "rpc", values: args });
      switch (fn) {
        case "claim_label_publish_lease":
          return { data: "2026-10-29T20:00:00.000000+00:00", error: null };
        case "append_label_backup_key":
          return { data: true, error: null };
        case "calculate_match_stats":
          calculateMatchStats();
          return { data: null, error: null };
        case "verify_match":
          if (options.failVerify) {
            return { data: null, error: { message: "verify refused" } };
          }
          if (args.p_errors_judged === true) {
            state.errorsJudgedAt = "2026-10-29T20:00:01+00:00";
            calculateMatchStats();
          }
          return { data: "2026-10-29T20:00:01+00:00", error: null };
        default:
          return { data: null, error: null };
      }
    },
    storage: {
      from: () => ({ upload: async () => ({ error: null }) }),
    },
    functions: {
      invoke: async (name: string) => {
        calls.push({ table: name, op: "invoke" });
        return { error: options.failInsights ? { message: "down" } : null };
      },
    },
    from(table: string) {
      const call: Recorded = { table, op: "select" };
      calls.push(call);
      const answer = () => {
        if (table === "label_sessions" && call.op === "select") {
          return {
            data: {
              status: "labelling",
              marks_enabled: true,
              match_id: "33333333-3333-4333-8333-333333333333",
            },
            error: null,
          };
        }
        if (call.op === "insert" && table === "points") {
          const rows = call.values as Record<string, unknown>[];
          state.points.push(...rows);
          return {
            data: rows.map((r) => ({
              id: `pt-${r.point_number}`,
              point_number: r.point_number,
            })),
            error: null,
          };
        }
        if (call.op === "update" && table === "matches") {
          if (options.failMarker) {
            return { data: null, error: { message: "marker refused" } };
          }
          state.errorsJudgedAt = (
            call.values as { errors_judged_at: string | null }
          ).errors_judged_at;
          return { data: null, error: null };
        }
        if (call.op === "update") return { data: [{ id: "s" }], error: null };
        if (table === "match_stats") {
          return { data: state.stats ? [state.stats] : [], error: null };
        }
        return { data: [], error: null, count: 0 };
      };
      const builder: Record<string, unknown> = {};
      for (const op of ["insert", "update", "upsert", "delete"]) {
        builder[op] = (values?: unknown) => {
          call.op = op;
          call.values = values;
          return builder;
        };
      }
      for (const pass of ["select", "eq", "in", "order"]) {
        builder[pass] = () => builder;
      }
      builder.range = async () => answer();
      builder.maybeSingle = async () => answer();
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(answer()).then(resolve, reject);
      return builder;
    },
  };
  return { calls, state, db: client as unknown as AdminClient };
}

/** Mark complete over the fake: the real publish, then the real verify step. */
async function markComplete(
  kind: LabelPoint["errorKind"] | ApplyContext,
  options: Parameters<typeof fakeDatabase>[0] = {},
) {
  const fake = fakeDatabase(options);
  const context =
    kind !== null && typeof kind === "object" ? kind : sessionContext(kind);
  const result = await writeLabelSessionComplete({
    supabase: fake.db,
    sessionId: context.session.id,
    actorId: "44444444-4444-4444-8444-444444444444",
    publish: (db) =>
      publishPlanned({
        db,
        context,
        plan: planApply(context),
        acceptScore: true,
        deferInsights: true,
      }),
  });
  return { ...fake, result };
}

test("publish with every error marked: points, stats, then verify with p_errors_judged — forced_errors counted", async () => {
  const { calls, state, result } = await markComplete("forced");
  expect(result).toMatchObject({ ok: true, status: "complete" });

  // The order the task fixes: the points are written, calculate_match_stats
  // runs, and only then verify_match — which carries the publish's word.
  const at = (table: string, op = "rpc") =>
    calls.findIndex((c) => c.table === table && c.op === op);
  expect(at("points", "insert")).toBeGreaterThan(-1);
  expect(at("points", "insert")).toBeLessThan(at("calculate_match_stats"));
  expect(at("calculate_match_stats")).toBeLessThan(at("verify_match"));
  expect(calls[at("verify_match")].values).toEqual({
    p_match_id: "33333333-3333-4333-8333-333333333333",
    p_actor: "44444444-4444-4444-8444-444444444444",
    p_errors_judged: true,
  });

  // The publish stamps the marker before its own recompute, so forced_errors
  // is a number from the first run; verify_match's run gives the same answer.
  expect(state.statsRuns).toEqual([true, true]);
  expect(state.errorsJudgedAt).not.toBeNull();
  expect(state.stats?.forced_errors).toBe(1);
});

test("publish with an unmarked error (a stale client): p_errors_judged false, the column stays null", async () => {
  const { calls, state, result } = await markComplete(null);
  expect(result).toMatchObject({ ok: true, status: "complete" });
  const verify = calls.find((c) => c.table === "verify_match");
  expect(verify?.values).toMatchObject({ p_errors_judged: false });
  expect(state.statsRuns).toEqual([false]);
  expect(state.errorsJudgedAt).toBeNull();
  expect(state.stats?.forced_errors).toBeNull();
  // The unmarked error still publishes, as unforced.
  expect(state.points.map((p) => p.result_type)).toContain(
    "Forehand Unforced Error",
  );
});

/** Two errors, both by Lee: point 1 marked `kind`, and point 2 stored as an error, unmarked. */
function partlyMarkedContext(kind: LabelPoint["errorKind"]): ApplyContext {
  const context = sessionContext(kind);
  context.session.points = context.session.points.map((p) =>
    p.id === FIXTURE_POINT_IDS.P2
      ? { ...p, ending: "error" as const, endedBy: "p1" as const }
      : p,
  );
  return context;
}

const at = (calls: Recorded[], table: string, op = "rpc") =>
  calls.findIndex((c) => c.table === table && c.op === op);

test("planApply: a partly marked session plans only Unforced strings, and the overview keeps the labeller's forced count", () => {
  const context = partlyMarkedContext("forced");
  const plan = planApply(context);
  expect(plan.errorsJudged).toBe(false);
  const errors = plan.built.points.filter((p) =>
    p.result_type?.endsWith("Error"),
  );
  expect(errors).toHaveLength(2);
  expect(errors.every((p) => p.result_type?.endsWith("Unforced Error"))).toBe(
    true,
  );
  // What the publish will count, as the script's preview prints it.
  expect(plan.stats.p1.forcedErrors).toBe(0);
  expect(plan.stats.p1.unforcedErrors).toBe(2);
  // The mark stays beside the row, and the overview's reading counts it.
  expect(errors.find((p) => p.pointIndex === 0)?.errorKind).toBe("forced");
  const overview = expectedStats(
    buildAppliedRows({
      points: context.session.points,
      adScoring: context.session.adScoring,
      bestOf: 3,
    }).points,
    { labellerMarks: true },
  );
  expect(overview.p1.forcedErrors).toBe(1);
  expect(overview.p1.unforcedErrors).toBe(1);
});

test("a partly marked publish writes only Unforced strings and clears a stale marker before the stats run", async () => {
  const { calls, state, result } = await markComplete(
    partlyMarkedContext("forced"),
    { errorsJudgedAt: "2026-10-01T00:00:00+00:00" },
  );
  expect(result).toMatchObject({ ok: true, status: "complete" });
  const types = state.points.map((p) => String(p.result_type));
  expect(types.filter((t) => t.endsWith("Error"))).toHaveLength(2);
  expect(types.filter((t) => t.includes("Forced"))).toEqual([]);
  // Cleared, and the stat function saw it cleared on its one run.
  const marker = calls.find((c) => c.table === "matches" && c.op === "update");
  expect(marker?.values).toEqual({ errors_judged_at: null });
  expect(state.errorsJudgedAt).toBeNull();
  expect(state.statsRuns).toEqual([false]);
  expect(calls.find((c) => c.table === "verify_match")?.values).toMatchObject({
    p_errors_judged: false,
  });
});

test("a fully marked publish stamps the marker before calculate_match_stats and writes Forced strings", async () => {
  const { calls, state, result } = await markComplete("forced");
  expect(result).toMatchObject({ ok: true, status: "complete" });
  expect(at(calls, "points", "insert")).toBeLessThan(
    at(calls, "matches", "update"),
  );
  expect(at(calls, "matches", "update")).toBeLessThan(
    at(calls, "calculate_match_stats"),
  );
  expect(state.statsRuns[0]).toBe(true);
  expect(state.points.map((p) => p.result_type)).toContain(
    "Forehand Forced Error",
  );
});

test("the stat row is right when verify fails: the marker is already on", async () => {
  const { state, result } = await markComplete("forced", { failVerify: true });
  expect(result).toMatchObject({
    error: expect.stringContaining("could not be marked Verified"),
  });
  expect(state.statsRuns).toEqual([true]);
  expect(state.stats?.forced_errors).toBe(1);
});

test("a failed marker write is the failed-recompute answer: the points are in, no stats run", async () => {
  const { calls, result } = await markComplete("forced", { failMarker: true });
  expect(result).toMatchObject({
    error: expect.stringMatching(
      /^The labelled points are published, but the statistics could not be rebuilt \(Could not set errors_judged_at: marker refused\)/,
    ),
  });
  expect(at(calls, "calculate_match_stats")).toBe(-1);
  expect(at(calls, "verify_match")).toBe(-1);
  expect(at(calls, "generate-insights", "invoke")).toBe(-1);
});

test("Mark complete asks for the summary once, after verify_match, and reports the answer", async () => {
  const { calls, result } = await markComplete("forced");
  expect(calls.filter((c) => c.op === "invoke")).toHaveLength(1);
  expect(at(calls, "verify_match")).toBeLessThan(
    at(calls, "generate-insights", "invoke"),
  );
  expect(result).toMatchObject({
    published: { insightsRequested: true },
  });

  const failed = await markComplete("forced", { failInsights: true });
  expect(failed.result).toMatchObject({
    ok: true,
    published: { insightsRequested: false },
  });
});

test("Mark complete still asks for the summary when verify fails: the statistics are in", async () => {
  const { calls, result } = await markComplete("forced", { failVerify: true });
  expect(result).toHaveProperty("error");
  expect(calls.filter((c) => c.op === "invoke")).toHaveLength(1);
  expect(at(calls, "verify_match")).toBeLessThan(
    at(calls, "generate-insights", "invoke"),
  );
});

test("the publish Mark complete runs leaves the summary to it", () => {
  // Its path to `publishPlanned` reads the whole session, so this is read off
  // the source: without the flag the summary goes back ahead of the verify.
  const source = readFileSync(
    "src/lib/services/labels/apply-session.ts",
    "utf8",
  );
  const body = source.slice(source.indexOf("function publishLabelSession"));
  expect(body).toContain("deferInsights: true");
});

test("deferInsights: the publish writes everything and asks for nothing", async () => {
  const fake = fakeDatabase();
  const context = sessionContext("forced");
  const result = await publishPlanned({
    db: fake.db,
    context,
    plan: planApply(context),
    acceptScore: true,
    deferInsights: true,
  });
  expect(result).toMatchObject({ ok: true, insightsRequested: false });
  expect(fake.calls.filter((c) => c.op === "invoke")).toEqual([]);
  expect(at(fake.calls, "calculate_match_stats")).toBeGreaterThan(-1);
});

test("the script's publish is unchanged for the summary: asked after the stats, no verify — and it gets the marker", async () => {
  const fake = fakeDatabase();
  const context = sessionContext("forced");
  const result = await publishPlanned({
    db: fake.db,
    context,
    plan: planApply(context),
    acceptScore: true,
  });
  expect(result).toMatchObject({ ok: true, insightsRequested: true });
  expect(at(fake.calls, "backfill_returns_in_and_net_points")).toBeLessThan(
    at(fake.calls, "generate-insights", "invoke"),
  );
  expect(at(fake.calls, "verify_match")).toBe(-1);
  expect(at(fake.calls, "matches", "update")).toBeLessThan(
    at(fake.calls, "calculate_match_stats"),
  );
  expect(fake.state.errorsJudgedAt).not.toBeNull();

  const failed = fakeDatabase({ failInsights: true });
  expect(
    await publishPlanned({
      db: failed.db,
      context,
      plan: planApply(context),
      acceptScore: true,
    }),
  ).toMatchObject({ ok: true, insightsRequested: false });
});
