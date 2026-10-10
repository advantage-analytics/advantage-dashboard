import { expect, test } from "@playwright/test";

import {
  applyPointReset,
  applyShotReset,
  canResetPoint,
  pointResetScope,
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
import { buildLabelSession } from "@/lib/data/labels-server";
import {
  readFormatAdScoring,
  resolveLabelAdScoring,
} from "@/lib/services/labels/ad-scoring";
import {
  FIXTURE_POINT_IDS,
  POINT_1_SHOTS,
  fakeLabelClient,
  labelSessionFixture,
  labelShotRow,
} from "./fixtures/label-session";

// Reset: an edited shot or point back to the values it was seeded with — the
// pure plans and the admin-gated writes over a fake client.

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const SHOT_SEED: LabelShotSeedValues = {
  hitter: "p2",
  stroke: "backhand",
  result: "in",
  spin: "topspin",
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
    const plan = planShotReset({ status: "edited", seed: SHOT_SEED });
    expect(plan).toEqual({
      ok: true,
      write: { ...SHOT_SEED, status: "kept" },
    });
    // Spin is one of the columns a reset writes, seeded value and null alike.
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.write.spin).toBe("topspin");
    const unspun = planShotReset({
      status: "edited",
      seed: { ...SHOT_SEED, spin: null },
    });
    if ("error" in unspun) throw new Error(unspun.error);
    expect(unspun.write).toHaveProperty("spin", null);
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

test.describe("planShotReset: a let only on a serve", () => {
  test("refuses a seed that would leave a let on a stroke that is not a serve", () => {
    expect(
      planShotReset({
        status: "edited",
        seed: { ...SHOT_SEED, stroke: "backhand", result: "let" },
      }),
    ).toEqual({ error: "Only a serve can be a let." });
    expect(
      planShotReset({
        status: "edited",
        seed: { ...SHOT_SEED, stroke: null, result: "let" },
      }),
    ).toEqual({ error: "Only a serve can be a let." });
  });

  test("writes back a let on a serve", () => {
    const seed = {
      ...SHOT_SEED,
      stroke: "first_serve" as const,
      result: "let" as const,
    };
    expect(planShotReset({ status: "edited", seed })).toEqual({
      ok: true,
      write: { ...seed, status: "kept" },
    });
  });
});

test.describe("planPointReset", () => {
  test("writes the point's own seeded fields, and unchanged", () => {
    const plan = planPointReset({
      status: "edited",
      seed: POINT_SEED,
      shots: [],
    });
    expect(plan).toEqual({
      ok: true,
      write: { ...POINT_SEED, status: "unchanged" },
      shots: [],
    });
    // Never the note, the checked mark, the game type or a stroke's other
    // values.
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.write).not.toHaveProperty("game_type");
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

  test("puts each stroke's hitter back to its seed: a swapped stroke returns to kept, a matching or unseeded one gets no write, a tombstone keeps deleted", () => {
    const byId = new Map(POINT_1_SHOTS.map((s) => [s.id, s]));
    const swapped = (id: string, hitter: "p1" | "p2") => ({
      ...byId.get(id)!,
      hitter,
      status: "edited" as const,
    });
    const plan = planPointReset({
      status: "edited",
      seed: POINT_SEED,
      shots: [
        swapped("s-serve", "p2"), // seeded p1
        byId.get("s-return")!, // seeded p2, held p2: nothing to put back
        {
          ...byId.get("s-phantom")!, // a tombstone, flipped to p2 by a swap
          hitter: "p2",
          statusBeforeDelete: "edited",
        },
        { ...byId.get("s-added")!, hitter: "p2" }, // no seed: keeps its hitter
      ],
    });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.shots).toEqual([
      {
        id: "s-serve",
        hitter: "p1",
        status: "kept",
        status_before_delete: null,
        was: "edited",
      },
      {
        id: "s-phantom",
        hitter: "p1",
        status: "deleted",
        status_before_delete: "kept",
        was: "deleted",
      },
    ]);
    // A stroke edited elsewhere stays edited once its hitter is back.
    const widened = planPointReset({
      status: "edited",
      seed: POINT_SEED,
      shots: [{ ...swapped("s-serve", "p2"), contactX: 1.4 }],
    });
    if ("error" in widened) throw new Error(widened.error);
    expect(widened.shots).toEqual([
      {
        id: "s-serve",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
        was: "edited",
      },
    ]);
  });

  test("refuses without a seed, on a tombstone and on an added point", () => {
    expect(
      planPointReset({ status: "edited", seed: null, shots: [] }),
    ).toHaveProperty("error");
    expect(
      planPointReset({ status: "deleted", seed: POINT_SEED, shots: [] }),
    ).toHaveProperty("error");
    expect(
      planPointReset({ status: "added", seed: null, shots: [] }),
    ).toHaveProperty("error");
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

  test("a point's Reset: its own fields when edited, and every edited stroke with a seed", () => {
    const points = new Map(labelSessionFixture().points.map((p) => [p.id, p]));
    const { P1, P2 } = FIXTURE_POINT_IDS;
    const p1 = points.get(P1)!;
    const edited = p1.shots.filter(canResetShot).map((s) => s.id);
    expect(pointResetScope(p1)).toEqual({ fields: true, shotIds: edited });
    // A split half keeps its own fields; its strokes still go back.
    expect(pointResetScope(p1, true)).toEqual(
      edited.length > 0 ? { fields: false, shotIds: edited } : null,
    );
    // Only its strokes changed: Reset is still offered, for them.
    const shotsOnly = {
      ...p1,
      status: "unchanged" as const,
      shots: p1.shots,
    };
    expect(pointResetScope(shotsOnly)).toEqual(
      edited.length > 0 ? { fields: false, shotIds: edited } : null,
    );
    // Nothing edited anywhere: nothing to offer.
    const p2 = points.get(P2)!;
    expect(
      pointResetScope({
        ...p2,
        status: "unchanged",
        shots: p2.shots.filter((s) => !canResetShot(s)),
      }),
    ).toBeNull();
    // A deleted point is restored first.
    expect(pointResetScope({ ...p1, status: "deleted" })).toBeNull();
  });

  test("applyShotReset puts every value back and leaves the rest", () => {
    const edited = POINT_1_SHOTS.find((s) => s.id === "s-return")!;
    const reset = applyShotReset(edited);
    expect(reset).toMatchObject({
      id: "s-return",
      eventId: 102,
      status: "kept",
      stroke: "forehand",
      spin: "topspin",
      contactX: 2.1,
      seed: edited.seed,
    });
    // A spin the labeller changed goes back to the seeded one.
    const respun = applyShotReset({ ...edited, spin: "sidespin" });
    expect(respun).toMatchObject({ status: "kept", spin: "topspin" });
    // Refused: the row comes back as it was.
    const added = POINT_1_SHOTS.find((s) => s.id === "s-added")!;
    expect(applyShotReset(added)).toBe(added);
  });

  test("applyPointReset restores the point's fields and its strokes' hitters, not its check, note or game type", () => {
    const p1 = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P1,
    )!;
    const checked = {
      ...p1,
      checkedAt: "2026-09-28T10:00:00Z",
      note: "long rally",
      gameType: "tiebreak" as const,
    };
    const reset = applyPointReset(checked);
    expect(reset).toMatchObject({
      status: "unchanged",
      winner: "p1",
      ending: "winner",
      endedBy: "p1",
      checkedAt: "2026-09-28T10:00:00Z",
      note: "long rally",
      gameType: "tiebreak",
    });
    // Every hitter is its seed's already: the strokes are the same array.
    expect(reset.shots).toBe(checked.shots);

    // After "Switch players": every hitter flipped, and the seeded ones go
    // back; the added stroke keeps the hitter it was given.
    const flipped = {
      ...checked,
      shots: checked.shots.map((s) => ({
        ...s,
        hitter: s.hitter === "p1" ? ("p2" as const) : ("p1" as const),
        status:
          s.status === "kept" || s.status === "edited"
            ? ("edited" as const)
            : s.status,
      })),
    };
    const back = applyPointReset(flipped);
    expect(Object.fromEntries(back.shots.map((s) => [s.id, s.hitter]))).toEqual(
      {
        "s-serve": "p1",
        "s-return": "p2",
        "s-phantom": "p1",
        "s-added": "p2",
      },
    );
    expect(Object.fromEntries(back.shots.map((s) => [s.id, s.status]))).toEqual(
      {
        "s-serve": "kept",
        "s-return": "edited", // still 30 cm off its seed
        "s-phantom": "deleted",
        "s-added": "added",
      },
    );
  });
});

const SESSION_ROW = {
  id: SESSION_ID,
  job_id: "job",
  match_id: "match",
  status: "labelling" as const,
  derivation_version: "0.3.2",
  ad_scoring: null,
  marks_enabled: true,
};

test("the loader carries each row's seed, and no seed for a bad one", () => {
  const session = buildLabelSession(
    SESSION_ROW,
    null,
    [
      {
        id: POINT_ID,
        point_index: 0,
        vendor_rally_ids: [41, 42],
        set_number: 1,
        game_number: 3,
        server: "p1",
        serve_side: null,
        winner: "p2",
        ending: "winner",
        ended_by: "p1",
        game_type: "tiebreak",
        status: "edited",
        status_before_delete: null,
        checked_at: null,
        note: "  ",
        dismissed: ["missing_shot:7"],
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
        site_removal: "hit_after_fault",
        site_removal_restored_at: "2026-10-05T09:00:00Z",
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
        site_removal: null,
        site_removal_restored_at: null,
        seed: { hitter: "p1" },
      },
    ],
  );
  expect(session.marksEnabled).toBe(true);
  const [point] = session.points;
  expect(point.seed).toEqual(POINT_SEED);
  expect(point.shots.map((s) => s.seed)).toEqual([SHOT_SEED, null]);
  // The marks' join key and the one stored piece of their life-cycle.
  expect(point.vendorRallyIds).toEqual([41, 42]);
  expect(point.dismissed).toEqual(["missing_shot:7"]);
  // The site's removal and its restore come through as stored.
  expect(
    point.shots.map((s) => [s.siteRemoval, s.siteRemovalRestoredAt]),
  ).toEqual([
    ["hit_after_fault", "2026-10-05T09:00:00Z"],
    [null, null],
  ]);
  expect(canResetPoint(point)).toBe(true);
  expect(canResetShot(point.shots[0])).toBe(true);
  // The loader maps `spin` from the row, like every other value column.
  expect(point.shots.map((s) => s.spin)).toEqual(["topspin", "topspin"]);
  // game_type and note come through as stored — the note verbatim, since the
  // write already trimmed it.
  expect(point.gameType).toBe("tiebreak");
  expect(point.note).toBe("  ");
});

test.describe("the session's ad scoring", () => {
  test("the labeller's answer wins, then the job's, then the match's format, then ad scoring", () => {
    expect(resolveLabelAdScoring(false, true)).toBe(false);
    expect(resolveLabelAdScoring(true, false)).toBe(true);
    expect(resolveLabelAdScoring(null, false)).toBe(false);
    expect(resolveLabelAdScoring(null, true)).toBe(true);
    expect(resolveLabelAdScoring(null, null)).toBe(true);
    expect(resolveLabelAdScoring(null, undefined)).toBe(true);
    // The match's format only when neither the session nor the job says.
    expect(resolveLabelAdScoring(null, null, false)).toBe(false);
    expect(resolveLabelAdScoring(null, undefined, false)).toBe(false);
    expect(resolveLabelAdScoring(null, null, null)).toBe(true);
    expect(resolveLabelAdScoring(null, true, false)).toBe(true);
    expect(resolveLabelAdScoring(true, null, false)).toBe(true);
    // The job wins over the match where they disagree (PR #297).
    expect(resolveLabelAdScoring(null, false, true)).toBe(false);
  });

  test("the match's format is read as a boolean or not at all", () => {
    expect(readFormatAdScoring({ ad_scoring: false })).toBe(false);
    expect(readFormatAdScoring({ ad_scoring: true, best_of: 3 })).toBe(true);
    for (const format of [
      null,
      undefined,
      "x",
      {},
      { ad_scoring: "false" },
      { ad_scoring: 0 },
    ]) {
      expect(readFormatAdScoring(format), JSON.stringify(format)).toBeNull();
    }
  });

  test("the loader applies that order over the session and job rows", () => {
    const build = (
      sessionAdScoring: boolean | null,
      job: { ad_scoring: boolean | null } | null,
      format: { ad_scoring?: boolean | null } | null = null,
    ) =>
      buildLabelSession(
        { ...SESSION_ROW, ad_scoring: sessionAdScoring },
        { id: "m", player1_name: null, player2_name: null, format },
        [],
        [],
        job,
      ).adScoring;
    // The ground-truth session has marks off; the loader carries that through.
    expect(
      buildLabelSession(
        { ...SESSION_ROW, marks_enabled: false },
        null,
        [],
        [],
        null,
      ).marksEnabled,
    ).toBe(false);
    // Both sessions live today are null with no-ad jobs: the job stands in.
    expect(build(null, { ad_scoring: false })).toBe(false);
    expect(build(true, { ad_scoring: false })).toBe(true);
    expect(build(false, { ad_scoring: true })).toBe(false);
    // Job gone, or submitted without saying: ad scoring.
    expect(build(null, null)).toBe(true);
    expect(build(null, { ad_scoring: null })).toBe(true);
    // Then the match's format.
    expect(build(null, null, { ad_scoring: false })).toBe(false);
    expect(build(null, { ad_scoring: null }, { ad_scoring: false })).toBe(
      false,
    );
    expect(build(null, { ad_scoring: true }, { ad_scoring: false })).toBe(true);
    expect(build(null, null, {})).toBe(true);
  });
});

// ── The services, over a fake client ───────────────────────────────────────

/**
 * A shot's row, a point's row and the point's shot rows (`shots`), read by
 * `label_point_id` whether by a point reset or by the ending a shot reset
 * settles. With no point given, a shot's point is a blank one; the point row
 * takes each successful `label_points` update.
 */
function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  /** The point's shot rows, as a point reset reads them by `label_point_id`. */
  shots?: Record<string, unknown>[];
  sessionStatus?: string;
  raced?: boolean;
}) {
  let point = rows.point === undefined ? BLANK_POINT : rows.point;
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      if (rows.raced) return { data: [], error: null };
      if (call.table === "label_points" && point) {
        point = { ...point, ...call.values };
      }
      return undefined;
    }
    if (call.table === "label_sessions") {
      return {
        data: { status: rows.sessionStatus ?? "labelling" },
        error: null,
      };
    }
    if (call.table === "label_shots") {
      return call.in || "label_point_id" in call.filters
        ? { data: rows.shots ?? [], error: null }
        : { data: rows.shot ?? null, error: null };
    }
    if (call.table === "label_points") {
      return { data: point, error: null };
    }
    return undefined;
  });
}

const shotRow = (fields: Record<string, unknown> = {}) => ({
  id: SHOT_ID,
  session_id: SESSION_ID,
  label_point_id: POINT_ID,
  status: "edited",
  seed: SHOT_SEED,
  ...fields,
});
/** A shot's point when the test says nothing of it: no ending, no seed. */
const BLANK_POINT = {
  id: POINT_ID,
  session_id: SESSION_ID,
  updated_at: "2026-10-01T10:00:00+00:00",
  status: "unchanged",
  seed: null,
  set_number: 1,
  game_number: 1,
  server: "p1",
  serve_side: null,
  winner: null,
  ending: null,
  ended_by: null,
};
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
      columns: "id, session_id, label_point_id, status, seed",
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

  test("a shot reset settles the point's ending off the seeded values, in the same call", async () => {
    // Vargas's backhand, seeded in, was marked out by hand: the point read
    // as Lee's on her error. Reset puts the ball in — her winner.
    const fake = fakeClient({
      shot: shotRow({ result: "out" }),
      shots: [
        labelShotRow(SHOT_ID, POINT_ID, {
          hitter: "p2",
          stroke: "backhand",
          result: "out",
          status: "edited",
          seed: SHOT_SEED,
        }),
      ],
      point: { ...BLANK_POINT, winner: "p1", ending: "error", ended_by: "p2" },
    });
    expect(
      await writeLabelShotReset({ supabase: fake.supabase, shotId: SHOT_ID }),
    ).toEqual({
      ok: true,
      status: "kept",
      point: {
        ending: "winner",
        endedBy: "p2",
        winner: "p2",
        status: "edited",
      },
    });
    expect(
      fake.calls
        .filter((c) => c.op === "update")
        .map((c) => [c.table, c.values]),
    ).toEqual([
      ["label_shots", { ...SHOT_SEED, status: "kept" }],
      [
        "label_points",
        { ending: "winner", ended_by: "p2", winner: "p2", status: "edited" },
      ],
    ]);
  });

  test("a point reset writes its own fields and unchanged; its strokes are read, and written only where a hitter differs from its seed", async () => {
    const fake = fakeClient({
      point: pointRow(),
      shots: [
        labelShotRow("s-1", POINT_ID, { hitter: "p1", stroke: "first_serve" }),
        labelShotRow("s-2", POINT_ID, { hitter: "p2", seed: null }),
      ],
    });
    expect(
      await writeLabelPointReset({
        supabase: fake.supabase,
        pointId: POINT_ID,
      }),
    ).toEqual({ ok: true, status: "unchanged", shots: [] });
    expect(
      fake.calls.find((c) => c.table === "label_shots" && c.op === "select"),
    ).toMatchObject({ filters: { label_point_id: POINT_ID } });
    const writes = fake.calls.filter((c) => c.op === "update");
    expect(writes).toEqual([
      {
        table: "label_points",
        op: "update",
        values: { ...POINT_SEED, status: "unchanged" },
        filters: { id: POINT_ID, status: "edited" },
      },
    ]);
  });

  test("a point reset after Switch players: the point first, compare-and-set, then each seeded stroke's hitter back in grouped writes — label_points and label_shots only", async () => {
    // A kept forehand's seed (`labelShotRow`), under the other hitter.
    const seededAs = (hitter: "p1" | "p2") =>
      labelShotRow("x", POINT_ID, { hitter }).seed;
    const fake = fakeClient({
      point: pointRow(),
      shots: [
        // Flipped to p2; the hitter is all that differs from its seed.
        labelShotRow("s-1", POINT_ID, {
          hitter: "p2",
          status: "edited",
          seed: seededAs("p1"),
        }),
        // Flipped to p1, and 30 cm off its seed besides: stays edited.
        labelShotRow("s-2", POINT_ID, {
          hitter: "p1",
          status: "edited",
          seed: { ...SHOT_SEED, hitter: "p2" },
        }),
        labelShotRow("s-3", POINT_ID, {
          hitter: "p2",
          status: "edited",
          seed: seededAs("p1"),
        }),
        // The labeller's own stroke, flipped with the rest: it has no seed.
        labelShotRow("s-4", POINT_ID, {
          hitter: "p2",
          status: "added",
          seed: null,
        }),
      ],
    });
    const result = await writeLabelPointReset({
      supabase: fake.supabase,
      pointId: POINT_ID,
    });
    expect(result).toEqual({
      ok: true,
      status: "unchanged",
      shots: [
        {
          id: "s-1",
          hitter: "p1",
          status: "kept",
          status_before_delete: null,
          was: "edited",
        },
        {
          id: "s-2",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
          was: "edited",
        },
        {
          id: "s-3",
          hitter: "p1",
          status: "kept",
          status_before_delete: null,
          was: "edited",
        },
      ],
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_points", "select"],
      ["label_sessions", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
      ["label_shots", "update"],
      ["label_shots", "update"],
    ]);
    const updates = fake.calls.filter((c) => c.op === "update");
    expect(updates[0]).toMatchObject({
      filters: { id: POINT_ID, status: "edited" },
      values: { ...POINT_SEED, status: "unchanged" },
    });
    expect(updates.slice(1).map((c) => [c.values, c.in])).toEqual([
      [
        { hitter: "p1", status: "kept", status_before_delete: null },
        { id: ["s-1", "s-3"] },
      ],
      [
        { hitter: "p2", status: "edited", status_before_delete: null },
        { id: ["s-2"] },
      ],
    ]);
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
    }
  });

  test("refuse a shot with no seed, a tombstone and an added shot, writing nothing", async () => {
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
