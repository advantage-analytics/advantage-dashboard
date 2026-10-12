import { expect, test } from "@playwright/test";

import {
  applyPointMove,
  planPointMove,
} from "@/lib/services/labels/operations";
import {
  applyPlayerSwitch,
  applyShotSwaps,
  canSwitchPlayers,
  moveSwapsPlayers,
  planPlayerFlip,
  planPlayerSwap,
  planPlayerSwitch,
  rowsContradictServer,
  servingShot,
  shotSwapsOf,
  type SwapShot,
} from "@/lib/services/labels/player-swap";
import {
  switchLabelPointPlayers,
  writeLabelPlayerSwitch,
} from "@/lib/services/labels/player-swap-session";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  fakeLabelClient,
  labelSessionFixture,
  labelShotRow,
} from "./fixtures/label-session";

// A point moved under the other server switches its players as a whole, but
// only when its own rows contradict the new server; and "Switch players".

const { P1, P2, P4 } = FIXTURE_POINT_IDS;

function shot(id: string, fields: Partial<SwapShot> = {}): SwapShot {
  return {
    id,
    eventId: null,
    status: "kept",
    statusBeforeDelete: null,
    seed: null,
    hitter: "p1",
    stroke: null,
    result: null,
    spin: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime: null,
    ...fields,
  };
}

/** A vendor stroke seeded with exactly what it holds. */
function seeded(id: string, fields: Partial<SwapShot> = {}): SwapShot {
  const row = shot(id, { eventId: 1, ...fields });
  return {
    ...row,
    seed: {
      hitter: row.hitter,
      stroke: row.stroke,
      result: row.result,
      spin: row.spin,
      contact_x: row.contactX,
      contact_y: row.contactY,
      landing_x: row.landingX,
      landing_y: row.landingY,
      video_time: row.videoTime,
    },
  };
}

function fixturePoint(id: string): LabelPoint {
  const point = labelSessionFixture().points.find((p) => p.id === id);
  if (!point) throw new Error(id);
  return point;
}

const hitters = (shots: readonly { id: string; hitter: unknown }[]) =>
  Object.fromEntries(shots.map((s) => [s.id, s.hitter]));

// ── The rule ───────────────────────────────────────────────────────────────

test.describe("when the players switch", () => {
  test("the serve hit by the old server: every hitter, the winner and ended by flip", () => {
    const point = {
      server: "p1" as const,
      winner: "p1" as const,
      endedBy: "p2" as const,
      shots: [
        seeded("serve", { hitter: "p1", stroke: "first_serve", videoTime: 1 }),
        seeded("return", { hitter: "p2", stroke: "backhand", videoTime: 2 }),
        seeded("third", { hitter: "p1", stroke: "forehand", videoTime: 3 }),
      ],
    };
    expect(moveSwapsPlayers(point, "p2")).toBe(true);
    const swap = planPlayerSwap(point, "p2");
    expect(swap).not.toBeNull();
    expect(swap!.point).toEqual({ winner: "p2", ended_by: "p1" });
    expect(hitters(swap!.shots)).toEqual({
      serve: "p2",
      return: "p1",
      third: "p2",
    });
    // Every vendor stroke now differs from its seed.
    expect(swap!.shots.map((s) => s.status)).toEqual([
      "edited",
      "edited",
      "edited",
    ]);
    expect(swap!.shots.map((s) => s.status_before_delete)).toEqual([
      null,
      null,
      null,
    ]);
  });

  test("the serve already hit by the new server: no swap — only the server moves", () => {
    const point = {
      server: "p1" as const,
      winner: "p1" as const,
      endedBy: "p1" as const,
      shots: [
        seeded("serve", { hitter: "p2", stroke: "first_serve", videoTime: 1 }),
        seeded("return", { hitter: "p1", stroke: "forehand", videoTime: 2 }),
      ],
    };
    expect(moveSwapsPlayers(point, "p2")).toBe(false);
    expect(planPlayerSwap(point, "p2")).toBeNull();
  });

  test("a move that keeps the server, or names none, never swaps", () => {
    const point = {
      server: "p1" as const,
      winner: "p1" as const,
      endedBy: "p1" as const,
      shots: [seeded("serve", { hitter: "p1", stroke: "first_serve" })],
    };
    expect(planPlayerSwap(point, "p1")).toBeNull();
    expect(planPlayerSwap(point, null)).toBeNull();
  });

  test("the LAST live serve decides: a fault, then a second serve, both read the same; a deleted serve is skipped", () => {
    const fault = seeded("fault", {
      hitter: "p1",
      stroke: "first_serve",
      videoTime: 1,
    });
    const second = seeded("second", {
      hitter: "p1",
      stroke: "second_serve",
      videoTime: 3,
    });
    expect(servingShot([second, fault])?.id).toBe("second");
    // A serve the labeller deleted is not the point's serve.
    const deletedSecond = { ...second, status: "deleted" as const };
    expect(servingShot([deletedSecond, fault])?.id).toBe("fault");
    // The hitter of a deleted serve says nothing; a live one hit by the
    // other side contradicts p2 serving.
    const point = {
      server: "p1" as const,
      winner: null,
      endedBy: null,
      shots: [
        { ...second, hitter: "p2" as const, status: "deleted" as const },
        fault,
      ],
    };
    expect(moveSwapsPlayers(point, "p2")).toBe(true);
  });

  test("no serve: the first live stroke with a hitter decides", () => {
    const shots = [
      shot("late", { hitter: "p2", stroke: "forehand", videoTime: 5 }),
      shot("first", { hitter: "p1", stroke: "backhand", videoTime: 2 }),
      shot("blank", { hitter: null, stroke: "forehand", videoTime: 1 }),
    ];
    expect(servingShot(shots)?.id).toBe("first");
    const point = { server: "p1" as const, winner: null, endedBy: null, shots };
    expect(moveSwapsPlayers(point, "p2")).toBe(true);
    expect(moveSwapsPlayers({ ...point, server: "p2" }, "p1")).toBe(false);
  });

  test("no strokes, or none with a hitter: no swap", () => {
    expect(
      planPlayerSwap(
        { server: "p1", winner: "p1", endedBy: "p1", shots: [] },
        "p2",
      ),
    ).toBeNull();
    expect(
      planPlayerSwap(
        {
          server: "p1",
          winner: "p1",
          endedBy: "p1",
          shots: [shot("blank", { hitter: null })],
        },
        "p2",
      ),
    ).toBeNull();
  });

  test("null hitters, winner and ended by stay null", () => {
    const swap = planPlayerSwap(
      {
        server: "p1",
        winner: null,
        endedBy: null,
        shots: [
          seeded("serve", {
            hitter: "p1",
            stroke: "first_serve",
            videoTime: 1,
          }),
          shot("blank", { hitter: null, videoTime: 2 }),
        ],
      },
      "p2",
    );
    expect(swap?.point).toEqual({ winner: null, ended_by: null });
    expect(hitters(swap!.shots)).toEqual({ serve: "p2", blank: null });
  });
});

// ── Statuses ───────────────────────────────────────────────────────────────

test.describe("statuses", () => {
  test("a vendor stroke flipped from its seed is edited; flipped back it is kept; added stays added", () => {
    const away = planPlayerSwap(fixturePoint(P1), "p2")!;
    const byId = Object.fromEntries(away.shots.map((s) => [s.id, s]));
    expect(byId["s-serve"]).toEqual({
      id: "s-serve",
      hitter: "p2",
      status: "edited",
      status_before_delete: null,
      was: "kept",
    });
    // s-return was already edited (a stroke and a position differ from its
    // seed); a flipped hitter keeps it so.
    expect(byId["s-return"].status).toBe("edited");
    expect(byId["s-added"]).toEqual({
      id: "s-added",
      hitter: "p2",
      status: "added",
      status_before_delete: null,
      was: "added",
    });

    // Back: the serve is its seed's again.
    const moved = applyShotSwaps([fixturePoint(P1)], away.shots)[0];
    const back = planPlayerSwap({ ...moved, server: "p2" }, "p1")!;
    const backById = Object.fromEntries(back.shots.map((s) => [s.id, s]));
    expect(backById["s-serve"]).toMatchObject({ hitter: "p1", status: "kept" });
    expect(backById["s-return"]).toMatchObject({
      hitter: "p2",
      status: "edited",
    });
    expect(backById["s-added"]).toMatchObject({
      hitter: "p1",
      status: "added",
    });
  });

  test("a tombstone keeps deleted; its status before delete is recomputed, so Undo restores the right one", () => {
    const away = planPlayerSwap(fixturePoint(P1), "p2")!;
    const phantom = away.shots.find((s) => s.id === "s-phantom");
    // Seeded as hit by p1 and deleted as `kept`: flipped to p2, an Undo
    // would bring back an edited stroke.
    expect(phantom).toEqual({
      id: "s-phantom",
      hitter: "p2",
      status: "deleted",
      status_before_delete: "edited",
      was: "deleted",
    });
    const moved = applyShotSwaps([fixturePoint(P1)], away.shots)[0];
    const back = planPlayerSwap({ ...moved, server: "p2" }, "p1")!;
    expect(back.shots.find((s) => s.id === "s-phantom")).toEqual({
      id: "s-phantom",
      hitter: "p1",
      status: "deleted",
      status_before_delete: "kept",
      was: "deleted",
    });

    // A tombstone of an added stroke stays added either way; one without a
    // remembered status falls back the way an Undo does (no vendor id →
    // added, else kept) before the flip is measured.
    const addedTombstone = shot("t", {
      hitter: "p1",
      status: "deleted",
      statusBeforeDelete: "added",
    });
    const unremembered = seeded("u", {
      hitter: "p1",
      status: "deleted",
      statusBeforeDelete: null,
    });
    const swap = planPlayerSwap(
      {
        server: "p1",
        winner: null,
        endedBy: null,
        shots: [
          seeded("serve", {
            hitter: "p1",
            stroke: "first_serve",
            videoTime: 1,
          }),
          addedTombstone,
          unremembered,
        ],
      },
      "p2",
    )!;
    expect(swap.shots.find((s) => s.id === "t")).toEqual({
      id: "t",
      hitter: "p2",
      status: "deleted",
      status_before_delete: "added",
      was: "deleted",
    });
    expect(swap.shots.find((s) => s.id === "u")).toEqual({
      id: "u",
      hitter: "p2",
      status: "deleted",
      status_before_delete: "edited",
      was: "deleted",
    });
  });

  test("a point moved away and back is unchanged, with every stroke kept again", () => {
    // P2: an unchanged ace in game 1, Lee (p1) serving. Game 2 is Vargas's.
    const p2 = fixturePoint(P2);
    const away = planPointMove(p2, { setNumber: 1, gameNumber: 2 }, "p2", true);
    if ("error" in away) throw new Error(away.error);
    expect(away.write).toEqual({
      set_number: 1,
      game_number: 2,
      status: "edited",
      server: "p2",
      winner: "p2",
      ended_by: "p2",
    });
    expect(away.shots).toEqual([
      {
        id: "s-ace",
        hitter: "p2",
        status: "edited",
        status_before_delete: null,
        was: "kept",
      },
    ]);
    const moved = applyShotSwaps(
      [applyPointMove(p2, away.write)],
      away.shots,
    )[0];
    expect(moved).toMatchObject({
      gameNumber: 2,
      server: "p2",
      winner: "p2",
      endedBy: "p2",
      status: "edited",
    });
    expect(moved.shots[0]).toMatchObject({ hitter: "p2", status: "edited" });

    const back = planPointMove(
      moved,
      { setNumber: 1, gameNumber: 1 },
      "p1",
      true,
    );
    if ("error" in back) throw new Error(back.error);
    expect(back.write).toEqual({
      set_number: 1,
      game_number: 1,
      status: "unchanged",
      server: "p1",
      winner: "p1",
      ended_by: "p1",
    });
    const home = applyShotSwaps(
      [applyPointMove(moved, back.write)],
      back.shots,
    )[0];
    expect(home.status).toBe("unchanged");
    expect(home.winner).toBe("p1");
    expect(home.endedBy).toBe("p1");
    expect(home.shots.map((s) => [s.hitter, s.status])).toEqual([
      ["p1", "kept"],
    ]);
  });
});

// ── The console's rows ─────────────────────────────────────────────────────

test.describe("applyShotSwaps", () => {
  test("takes each write onto its shot wherever it sits, leaves other rows be, and reverts with the old values", () => {
    const { points } = labelSessionFixture();
    const swap = planPlayerSwap(fixturePoint(P1), "p2")!;
    const after = applyShotSwaps(points, swap.shots);
    const p1 = after.find((p) => p.id === P1)!;
    expect(hitters(p1.shots)).toEqual({
      "s-serve": "p2",
      "s-return": "p1",
      "s-phantom": "p2",
      "s-added": "p2",
    });
    expect(p1.shots.find((s) => s.id === "s-phantom")).toMatchObject({
      status: "deleted",
      statusBeforeDelete: "edited",
    });
    // Order and every other point stand.
    expect(after.map((p) => p.id)).toEqual(points.map((p) => p.id));
    expect(after.find((p) => p.id === P2)).toBe(
      points.find((p) => p.id === P2),
    );
    expect(after.find((p) => p.id === P4)).toBe(
      points.find((p) => p.id === P4),
    );

    // The revert: the rows' old values, as writes.
    const before: LabelShot[] = fixturePoint(P1).shots;
    const reverted = applyShotSwaps(after, shotSwapsOf(before));
    expect(reverted.find((p) => p.id === P1)!.shots).toEqual(before);
    // Nothing to apply: the same rows back.
    expect(applyShotSwaps(points, [])).toEqual(points);
  });
});

// ── "Switch players", by hand ──────────────────────────────────────────────

test.describe("switch players", () => {
  test("flips the whole point regardless of what the rows say, and never the server, set or game", () => {
    // P2's rows AGREE with its server (Lee served Lee's ace): a move would
    // leave them alone; the manual switch flips them all the same.
    const p2 = fixturePoint(P2);
    expect(rowsContradictServer(p2)).toBe(false);
    expect(canSwitchPlayers(p2)).toBe(true);
    const plan = planPlayerSwitch(p2);
    expect(plan).toEqual({
      ok: true,
      write: { winner: "p2", ended_by: "p2", status: "edited" },
      shots: [
        {
          id: "s-ace",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
      ],
    });
    if ("error" in plan) throw new Error(plan.error);
    const after = applyShotSwaps(
      [applyPlayerSwitch(p2, plan.write)],
      plan.shots,
    )[0];
    expect(after).toMatchObject({
      server: "p1",
      setNumber: 1,
      gameNumber: 1,
      winner: "p2",
      endedBy: "p2",
      status: "edited",
    });
    // `planPlayerFlip` is the one flip both paths share.
    expect(planPlayerFlip(p2)).toEqual({
      point: { winner: "p2", ended_by: "p2" },
      shots: plan.shots,
    });
  });

  test("tombstones, ghosts and null hitters follow the move's rule; statuses are the edit rule's", () => {
    const plan = planPlayerSwitch(fixturePoint(P1));
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.write).toEqual({
      winner: "p1",
      ended_by: "p2",
      status: "edited",
    });
    expect(Object.fromEntries(plan.shots.map((s) => [s.id, s]))).toEqual({
      "s-serve": {
        id: "s-serve",
        hitter: "p2",
        status: "edited",
        status_before_delete: null,
        was: "kept",
      },
      "s-return": {
        id: "s-return",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
        was: "edited",
      },
      "s-phantom": {
        id: "s-phantom",
        hitter: "p2",
        status: "deleted",
        status_before_delete: "edited",
        was: "deleted",
      },
      "s-added": {
        id: "s-added",
        hitter: "p2",
        status: "added",
        status_before_delete: null,
        was: "added",
      },
    });
    const p4 = planPlayerSwitch(fixturePoint(P4));
    if ("error" in p4) throw new Error(p4.error);
    expect(hitters(p4.shots)).toEqual({
      "s-p4-fault": "p1",
      "s-p4-ghost": "p2",
      "s-p4-serve": "p1",
    });
    // No winner: null stays null, and the status still moves on ended by.
    const unwon = { ...fixturePoint(P2), winner: null, endedBy: null };
    const blank = planPlayerSwitch({
      ...unwon,
      seed: { ...unwon.seed!, winner: null, ended_by: null },
    });
    expect(blank).toMatchObject({
      write: { winner: null, ended_by: null, status: "unchanged" },
    });
  });

  test("switching twice returns every row to where it was", () => {
    for (const id of [P1, P2, P4]) {
      const point = fixturePoint(id);
      const once = planPlayerSwitch(point);
      if ("error" in once) throw new Error(once.error);
      const flipped = applyShotSwaps(
        [applyPlayerSwitch(point, once.write)],
        once.shots,
      )[0];
      const twice = planPlayerSwitch(flipped);
      if ("error" in twice) throw new Error(twice.error);
      const home = applyShotSwaps(
        [applyPlayerSwitch(flipped, twice.write)],
        twice.shots,
      )[0];
      expect(home, id).toEqual(point);
    }
  });

  test("refused on a tombstone and on a point with no stroke that names a hitter", () => {
    const p2 = fixturePoint(P2);
    expect(planPlayerSwitch({ ...p2, status: "deleted" })).toEqual({
      error: "Restore this point before switching its players.",
    });
    expect(canSwitchPlayers({ ...p2, status: "deleted" })).toBe(false);
    const hitterless = {
      ...p2,
      shots: p2.shots.map((shot) => ({ ...shot, hitter: null })),
    };
    expect(canSwitchPlayers(hitterless)).toBe(false);
    expect(planPlayerSwitch(hitterless)).toHaveProperty("error");
    expect(canSwitchPlayers({ ...p2, shots: [] })).toBe(false);
    // A tombstoned stroke with a hitter still counts: the flip includes it.
    expect(
      canSwitchPlayers({
        ...p2,
        shots: p2.shots.map((shot) => ({
          ...shot,
          status: "deleted" as const,
        })),
      }),
    ).toBe(true);
  });

  test("rowsContradictServer: the serving stroke hit by the other side — the stuck point's tell", () => {
    const p2 = fixturePoint(P2);
    // Moved under Vargas before the swap rule existed: server p2, Lee's ace.
    expect(rowsContradictServer({ ...p2, server: "p2" })).toBe(true);
    expect(rowsContradictServer(p2)).toBe(false);
    expect(rowsContradictServer({ ...p2, server: null })).toBe(false);
    expect(rowsContradictServer({ ...p2, shots: [] })).toBe(false);
    // The fixture's P4: Vargas's serves under Vargas.
    expect(rowsContradictServer(fixturePoint(P4))).toBe(false);
    expect(rowsContradictServer({ ...fixturePoint(P4), server: "p1" })).toBe(
      true,
    );
  });
});

// ── The writer, over a fake client ─────────────────────────────────────────

const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const shotRow = (id: string, fields: Record<string, unknown>) =>
  labelShotRow(id, POINT_ID, fields);

function fakeClient(rows: {
  point?: Record<string, unknown> | null;
  shots?: Record<string, unknown>[];
  sessionStatus?: string;
  raced?: boolean;
}) {
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      return rows.raced ? { data: [], error: null } : undefined;
    }
    if (call.table === "label_sessions") {
      return {
        data: { status: rows.sessionStatus ?? "labelling" },
        error: null,
      };
    }
    if (call.table === "label_shots") {
      return { data: rows.shots ?? [], error: null };
    }
    if (call.table === "label_points") {
      return { data: rows.point ?? null, error: null };
    }
    return undefined;
  });
}

const pointRow = {
  id: POINT_ID,
  session_id: SESSION_ID,
  status: "unchanged",
  status_before_delete: null,
  server: "p1",
  set_number: 1,
  game_number: 3,
  serve_side: null,
  winner: "p1",
  ending: "winner",
  ended_by: "p2",
  seed: null,
};

test.describe("writeLabelPlayerSwitch", () => {
  test("the point first, compare-and-set, then the strokes grouped by value tuple — label_points and label_shots only, never server, set or game", async () => {
    const fake = fakeClient({
      point: pointRow,
      shots: [
        shotRow("s1", { hitter: "p1", stroke: "first_serve", video_time: 1 }),
        shotRow("s2", { hitter: "p2", video_time: 2 }),
        shotRow("s3", { hitter: "p1", video_time: 3 }),
        shotRow("s4", {
          hitter: "p2",
          video_time: 4,
          status: "deleted",
          status_before_delete: "kept",
          delete_reason: "other",
        }),
      ],
    });
    const result = await writeLabelPlayerSwitch({
      supabase: fake.supabase,
      pointId: POINT_ID,
    });
    expect(result).toEqual({
      ok: true,
      status: "edited",
      winner: "p2",
      endedBy: "p1",
      shots: [
        {
          id: "s1",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "s2",
          hitter: "p1",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "s3",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "s4",
          hitter: "p1",
          status: "deleted",
          status_before_delete: "edited",
          was: "deleted",
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
      ["label_shots", "update"],
    ]);
    const updates = fake.calls.filter((c) => c.op === "update");
    expect(updates[0]).toMatchObject({
      table: "label_points",
      filters: { id: POINT_ID, status: "unchanged" },
      values: { winner: "p2", ended_by: "p1", status: "edited" },
    });
    expect(Object.keys(updates[0].values ?? {}).sort()).toEqual([
      "ended_by",
      "status",
      "winner",
    ]);
    expect(updates.slice(1).map((c) => [c.values, c.in])).toEqual([
      [
        { hitter: "p2", status: "edited", status_before_delete: null },
        { id: ["s1", "s3"] },
      ],
      [
        { hitter: "p1", status: "edited", status_before_delete: null },
        { id: ["s2"] },
      ],
      [
        { hitter: "p1", status: "deleted", status_before_delete: "edited" },
        { id: ["s4"] },
      ],
    ]);
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
    }
  });

  test("a complete session, a tombstone, a hitterless point and a race each write nothing more", async () => {
    const complete = fakeClient({ point: pointRow, sessionStatus: "complete" });
    expect(
      await writeLabelPlayerSwitch({
        supabase: complete.supabase,
        pointId: POINT_ID,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(complete.calls.some((c) => c.op === "update")).toBe(false);

    const tombstone = fakeClient({
      point: { ...pointRow, status: "deleted" },
      shots: [shotRow("s1", { hitter: "p1" })],
    });
    expect(
      await writeLabelPlayerSwitch({
        supabase: tombstone.supabase,
        pointId: POINT_ID,
      }),
    ).toEqual({ error: "Restore this point before switching its players." });
    expect(tombstone.calls.some((c) => c.op === "update")).toBe(false);

    const hitterless = fakeClient({ point: pointRow, shots: [] });
    expect(
      await writeLabelPlayerSwitch({
        supabase: hitterless.supabase,
        pointId: POINT_ID,
      }),
    ).toHaveProperty("error");
    expect(hitterless.calls.some((c) => c.op === "update")).toBe(false);

    const raced = fakeClient({
      point: pointRow,
      shots: [shotRow("s1", { hitter: "p1" })],
      raced: true,
    });
    expect(
      await writeLabelPlayerSwitch({
        supabase: raced.supabase,
        pointId: POINT_ID,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    expect(
      raced.calls.filter((c) => c.op === "update").map((c) => c.table),
    ).toEqual(["label_points"]);

    expect(
      await writeLabelPlayerSwitch({
        supabase: raced.supabase,
        pointId: "nope",
      }),
    ).toEqual({ error: "Invalid point id." });
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    expect(
      await switchLabelPointPlayers(POINT_ID, {
        requireAdmin: async () => null,
        createAdminClient: () => {
          built += 1;
          return fakeClient({}).supabase;
        },
      }),
    ).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({
      point: pointRow,
      shots: [shotRow("s1", { hitter: "p1" })],
    });
    expect(
      await switchLabelPointPlayers(POINT_ID, {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true, winner: "p2" });
  });
});
