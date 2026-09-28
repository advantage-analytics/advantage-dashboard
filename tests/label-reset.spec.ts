import { expect, test } from "@playwright/test";

import {
  applyPointReset,
  applyShotReset,
  canResetPoint,
  canResetShot,
  planPointReset,
  planShotReset,
} from "@/lib/services/labels/reset";
import {
  resetLabelPoint,
  resetLabelShot,
  writeLabelPointReset,
  writeLabelShotReset,
} from "@/lib/services/labels/reset-session";
import type {
  LabelPointSeedValues,
  LabelShotSeedValues,
} from "@/lib/services/labels/session";
import type { AdminClient } from "@/lib/supabase/admin";
import { buildLabelSession } from "@/lib/data/labels-server";
import {
  FIXTURE_POINT_IDS,
  POINT_1_SHOTS,
  labelSessionFixture,
} from "./fixtures/label-session";

/**
 * Reset: an edited shot or point back to the values it was seeded with — the
 * pure plans (reset.ts) and the admin-gated writes behind the
 * `resetLabelShotAction` / `resetLabelPointAction` server actions
 * (reset-session.ts).
 */

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const SHOT_SEED: LabelShotSeedValues = {
  hitter: "p2",
  stroke: "backhand",
  result: "in",
  contact_x: 1.8,
  contact_y: 24.49,
  landing_x: -2.1,
  landing_y: 3.49,
  video_time: 2473.1,
};
const POINT_SEED: LabelPointSeedValues = {
  set_number: 1,
  game_number: 3,
  server: "p1",
  serve_side: null,
  winner: "p1",
  ending: "winner",
  ended_by: "p1",
};

// ── The plans ──────────────────────────────────────────────────────────────

test.describe("planShotReset", () => {
  test("writes the seed back, and kept", () => {
    expect(planShotReset({ status: "edited", seed: SHOT_SEED })).toEqual({
      ok: true,
      write: { ...SHOT_SEED, status: "kept" },
    });
  });

  test("refuses without a seed, on a tombstone and on an added shot", () => {
    expect(planShotReset({ status: "edited", seed: null })).toHaveProperty(
      "error",
    );
    expect(
      planShotReset({ status: "deleted", seed: SHOT_SEED }),
    ).toHaveProperty("error");
    expect(planShotReset({ status: "added", seed: null })).toHaveProperty(
      "error",
    );
    expect(planShotReset({ status: "added", seed: SHOT_SEED })).toHaveProperty(
      "error",
    );
  });
});

test.describe("planPointReset", () => {
  test("writes the point's own seeded fields, and unchanged", () => {
    const plan = planPointReset({ status: "edited", seed: POINT_SEED });
    expect(plan).toEqual({
      ok: true,
      write: { ...POINT_SEED, status: "unchanged" },
    });
    // Never the note, the checked mark or anything on the strokes.
    if ("error" in plan) throw new Error(plan.error);
    expect(Object.keys(plan.write).sort()).toEqual(
      [
        "ended_by",
        "ending",
        "game_number",
        "serve_side",
        "server",
        "set_number",
        "status",
        "winner",
      ].sort(),
    );
  });

  test("refuses without a seed, on a tombstone and on an added point", () => {
    expect(planPointReset({ status: "edited", seed: null })).toHaveProperty(
      "error",
    );
    expect(
      planPointReset({ status: "deleted", seed: POINT_SEED }),
    ).toHaveProperty("error");
    expect(planPointReset({ status: "added", seed: null })).toHaveProperty(
      "error",
    );
  });
});

test.describe("the console's rows", () => {
  test("Reset is offered only on an edited row with a seed", () => {
    const byId = new Map(POINT_1_SHOTS.map((s) => [s.id, s]));
    expect(canResetShot(byId.get("s-return")!)).toBe(true); // edited, seed
    expect(canResetShot(byId.get("s-serve")!)).toBe(false); // kept
    expect(canResetShot(byId.get("s-added")!)).toBe(false); // added
    expect(canResetShot(byId.get("s-phantom")!)).toBe(false); // deleted
    expect(canResetShot({ status: "edited", seed: null })).toBe(false);

    const points = new Map(labelSessionFixture().points.map((p) => [p.id, p]));
    const { P1, P2, P3 } = FIXTURE_POINT_IDS;
    expect(canResetPoint(points.get(P1)!)).toBe(true);
    expect(canResetPoint(points.get(P2)!)).toBe(false);
    expect(canResetPoint(points.get(P3)!)).toBe(false);
    expect(canResetPoint({ status: "edited", seed: null })).toBe(false);
  });

  test("applyShotReset puts every value back and leaves the rest", () => {
    const edited = POINT_1_SHOTS.find((s) => s.id === "s-return")!;
    const reset = applyShotReset(edited);
    expect(reset).toMatchObject({
      id: "s-return",
      eventId: 102,
      status: "kept",
      stroke: "forehand",
      contactX: 2.1,
      seed: edited.seed,
    });
    // Refused: the row comes back as it was.
    const added = POINT_1_SHOTS.find((s) => s.id === "s-added")!;
    expect(applyShotReset(added)).toBe(added);
  });

  test("applyPointReset restores the point's fields, not its shots or check", () => {
    const p1 = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P1,
    )!;
    const checked = { ...p1, checkedAt: "2026-09-28T10:00:00Z" };
    const reset = applyPointReset(checked);
    expect(reset).toMatchObject({
      status: "unchanged",
      winner: "p1",
      ending: "winner",
      endedBy: "p1",
      checkedAt: "2026-09-28T10:00:00Z",
    });
    expect(reset.shots).toBe(checked.shots);
  });
});

test("the loader carries each row's seed, and no seed for a bad one", () => {
  const session = buildLabelSession(
    {
      id: SESSION_ID,
      job_id: "job",
      match_id: "match",
      status: "labelling",
      derivation_version: "0.3.2",
    },
    null,
    [
      {
        id: POINT_ID,
        point_index: 0,
        set_number: 1,
        game_number: 3,
        server: "p1",
        serve_side: null,
        winner: "p2",
        ending: "winner",
        ended_by: "p1",
        status: "edited",
        status_before_delete: null,
        checked_at: null,
        seed: POINT_SEED,
      },
    ],
    [
      {
        id: SHOT_ID,
        label_point_id: POINT_ID,
        event_id: 7,
        after_event_id: null,
        status: "edited",
        status_before_delete: null,
        delete_reason: null,
        ...SHOT_SEED,
        stroke: "forehand",
        seed: SHOT_SEED,
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        label_point_id: POINT_ID,
        event_id: null,
        after_event_id: 7,
        status: "added",
        status_before_delete: null,
        delete_reason: null,
        ...SHOT_SEED,
        video_time: 2480,
        seed: { hitter: "p1" },
      },
    ],
  );
  const [point] = session.points;
  expect(point.seed).toEqual(POINT_SEED);
  expect(point.shots.map((s) => s.seed)).toEqual([SHOT_SEED, null]);
  expect(canResetPoint(point)).toBe(true);
  expect(canResetShot(point.shots[0])).toBe(true);
});

// ── The services, over a fake client ───────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  columns?: string;
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  sessionStatus?: string;
  raced?: boolean;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          return {
            data: rows.raced ? [] : [{ id: call.filters.id }],
            error: null,
          };
        }
        if (table === "label_sessions") {
          return {
            data: { status: rows.sessionStatus ?? "labelling" },
            error: null,
          };
        }
        if (table === "label_shots")
          return { data: rows.shot ?? null, error: null };
        if (table === "label_points") {
          return { data: rows.point ?? null, error: null };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: (columns?: string) => {
          if (call.op === "select") call.columns = columns;
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        maybeSingle: async () => answer(),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return builder;
    },
  };
  return { calls, supabase: client as unknown as AdminClient };
}

const shotRow = (fields: Record<string, unknown> = {}) => ({
  id: SHOT_ID,
  session_id: SESSION_ID,
  status: "edited",
  seed: SHOT_SEED,
  ...fields,
});
const pointRow = (fields: Record<string, unknown> = {}) => ({
  id: POINT_ID,
  session_id: SESSION_ID,
  status: "edited",
  seed: POINT_SEED,
  ...fields,
});

test.describe("resetLabelShot / resetLabelPoint", () => {
  test("refuse without an admin, before a client is built", async () => {
    let built = 0;
    const deps = {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    };
    expect(await resetLabelShot(SHOT_ID, deps)).toEqual({
      error: "Administrator access is required.",
    });
    expect(await resetLabelPoint(POINT_ID, deps)).toEqual({
      error: "Administrator access is required.",
    });
    expect(built).toBe(0);
  });

  test("a shot reset writes its seed and kept, compare-and-set", async () => {
    const fake = fakeClient({ shot: shotRow() });
    const result = await resetLabelShot(SHOT_ID.toUpperCase(), {
      requireAdmin: async () => ({ id: "admin" }),
      createAdminClient: () => fake.supabase,
    });
    expect(result).toEqual({ ok: true, status: "kept" });
    expect(fake.calls[0]).toMatchObject({
      table: "label_shots",
      columns: "id, session_id, status, seed",
    });
    const writes = fake.calls.filter((c) => c.op === "update");
    expect(writes).toEqual([
      {
        table: "label_shots",
        op: "update",
        values: { ...SHOT_SEED, status: "kept" },
        filters: { id: SHOT_ID, status: "edited" },
      },
    ]);
    // `unclear` is not part of the seed and is never written.
    expect(writes[0].values).not.toHaveProperty("unclear");
  });

  test("a point reset writes its own fields and unchanged only", async () => {
    const fake = fakeClient({ point: pointRow() });
    expect(
      await writeLabelPointReset({
        supabase: fake.supabase,
        pointId: POINT_ID,
      }),
    ).toEqual({ ok: true, status: "unchanged" });
    const writes = fake.calls.filter((c) => c.op === "update");
    expect(writes).toEqual([
      {
        table: "label_points",
        op: "update",
        values: { ...POINT_SEED, status: "unchanged" },
        filters: { id: POINT_ID, status: "edited" },
      },
    ]);
    expect(fake.calls.every((c) => c.table !== "label_shots")).toBe(true);
  });

  test("refuse a row with no seed, a tombstone and an added row, writing nothing", async () => {
    for (const row of [
      shotRow({ seed: null }),
      shotRow({ seed: { hitter: "p1" } }), // half a seed is no seed
      shotRow({ status: "deleted" }),
      shotRow({ status: "added", seed: null }),
    ]) {
      const fake = fakeClient({ shot: row });
      expect(
        await writeLabelShotReset({ supabase: fake.supabase, shotId: SHOT_ID }),
      ).toHaveProperty("error");
      expect(fake.calls.some((c) => c.op === "update")).toBe(false);
    }
    for (const row of [
      pointRow({ seed: null }),
      pointRow({ status: "deleted" }),
      pointRow({ status: "added", seed: null }),
    ]) {
      const fake = fakeClient({ point: row });
      expect(
        await writeLabelPointReset({
          supabase: fake.supabase,
          pointId: POINT_ID,
        }),
      ).toHaveProperty("error");
      expect(fake.calls.some((c) => c.op === "update")).toBe(false);
    }
  });

  test("refuse a complete session, a race, a missing row and a bad id", async () => {
    const frozen = fakeClient({ shot: shotRow(), sessionStatus: "complete" });
    expect(
      await writeLabelShotReset({ supabase: frozen.supabase, shotId: SHOT_ID }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(frozen.calls.some((c) => c.op === "update")).toBe(false);

    const raced = fakeClient({ point: pointRow(), raced: true });
    expect(
      await writeLabelPointReset({
        supabase: raced.supabase,
        pointId: POINT_ID,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });

    const missing = fakeClient({ shot: null });
    expect(
      await writeLabelShotReset({
        supabase: missing.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "Shot not found." });
    expect(
      await writeLabelShotReset({
        supabase: missing.supabase,
        shotId: "not-a-uuid",
      }),
    ).toEqual({ error: "Invalid shot id." });
  });
});
