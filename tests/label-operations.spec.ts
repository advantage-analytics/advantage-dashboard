import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  LABEL_DELETE_REASONS,
  applyPointDelete,
  applyPointRestore,
  applyShotDelete,
  applyShotRestore,
  destinationServerIn,
  gameServer,
  applyPointMove,
  moveNeedsServerSwitch,
  neighbourGames,
  planAddedShot,
  planPointChecked,
  planPointDelete,
  planPointMove,
  planPointRestore,
  planShotDelete,
  planShotRestore,
} from "@/lib/services/labels/operations";
import {
  addLabelShot,
  deleteLabelPoint,
  deleteLabelShot,
  markLabelPointChecked,
  moveLabelPoint,
  restoreLabelShot,
  unmarkLabelPointChecked,
  writeLabelPointMove,
  writeLabelShotAdd,
  writeLabelShotDelete,
  writeLabelShotRestore,
} from "@/lib/services/labels/operations-session";
import type { LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  POINT_1_SHOTS,
  fakeLabelClient,
  labelSessionFixture,
  labelShotRow,
} from "./fixtures/label-session";

// Row operations: delete and Undo, add a stroke, move a point, mark it checked
// — the pure rules and the admin-gated services over a fake client.

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_SHOT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function fixtureShot(id: string): LabelShot {
  const shot = POINT_1_SHOTS.find((s) => s.id === id);
  if (!shot) throw new Error(id);
  return shot;
}

// ── Delete and Undo ────────────────────────────────────────────────────────

test.describe("delete and Undo", () => {
  test("a shot delete→restore returns the status it had: kept, edited or added", () => {
    for (const [status, eventId] of [
      ["kept", 101],
      ["edited", 102],
      ["added", null],
    ] as const) {
      const deleted = planShotDelete({ status }, "duplicate");
      expect(deleted).toEqual({
        ok: true,
        write: {
          status: "deleted",
          status_before_delete: status,
          delete_reason: "duplicate",
        },
      });
      const write = (
        deleted as { write: { status_before_delete: typeof status } }
      ).write;
      const restored = planShotRestore({
        status: "deleted",
        status_before_delete: write.status_before_delete,
        event_id: eventId,
      });
      expect(restored).toEqual({
        ok: true,
        write: { status, status_before_delete: null, delete_reason: null },
      });
    }
  });

  test("a shot delete needs a reason from the vocabulary", () => {
    expect([...LABEL_DELETE_REASONS]).toEqual([
      "dead_ball_after_fault",
      "dead_ball_after_point",
      "not_a_stroke",
      "duplicate",
      "other",
    ]);
    for (const bad of [undefined, null, "", "Duplicate", "phantom", 3]) {
      expect(
        planShotDelete({ status: "kept" }, bad),
        String(bad),
      ).toHaveProperty("error");
    }
    expect(planShotDelete({ status: "deleted" }, "other")).toHaveProperty(
      "error",
    );
    expect(
      planShotRestore({
        status: "kept",
        status_before_delete: null,
        event_id: 1,
      }),
    ).toHaveProperty("error");
  });

  test("without a remembered status, only 'added' is read off the row", () => {
    expect(
      planShotRestore({
        status: "deleted",
        status_before_delete: null,
        event_id: null,
      }),
    ).toMatchObject({ write: { status: "added" } });
    expect(
      planShotRestore({
        status: "deleted",
        status_before_delete: null,
        event_id: 7,
      }),
    ).toMatchObject({ write: { status: "kept" } });
  });

  test("a point delete→restore returns unchanged, edited or added", () => {
    for (const status of ["unchanged", "edited", "added"] as const) {
      const deleted = planPointDelete({ status });
      expect(deleted).toEqual({
        ok: true,
        write: { status: "deleted", status_before_delete: status },
      });
      expect(
        planPointRestore({ status: "deleted", status_before_delete: status }),
      ).toEqual({
        ok: true,
        write: { status, status_before_delete: null },
      });
    }
    expect(planPointDelete({ status: "deleted" })).toHaveProperty("error");
    expect(
      planPointRestore({ status: "edited", status_before_delete: null }),
    ).toHaveProperty("error");
  });

  test("the console's rows round-trip the same way", () => {
    const edited = fixtureShot("s-return");
    const gone = applyShotDelete(edited, "not_a_stroke");
    expect(gone).toMatchObject({
      status: "deleted",
      statusBeforeDelete: "edited",
      deleteReason: "not_a_stroke",
    });
    expect(applyShotRestore(gone)).toEqual(edited);

    const added = fixtureShot("s-added");
    expect(applyShotRestore(applyShotDelete(added, "duplicate"))).toEqual(
      added,
    );

    const point = labelSessionFixture().points[0];
    expect(point.status).toBe("edited");
    const deletedPoint = applyPointDelete(point);
    expect(deletedPoint).toMatchObject({
      status: "deleted",
      statusBeforeDelete: "edited",
    });
    expect(applyPointRestore(deletedPoint)).toEqual(point);
  });
});

// ── Add a stroke ────────────────────────────────────────────────────────────

test.describe("add shot", () => {
  const point = labelSessionFixture().points[0];

  test("after a vendor stroke: event_id null, after_event_id its id, status added", () => {
    const plan = planAddedShot(point, "s-serve");
    expect(plan).toEqual({
      ok: true,
      write: {
        event_id: null,
        after_event_id: 101,
        status: "added",
        // The serve was Lee's (p1); the return is the opponent's.
        hitter: "p2",
        // Midway between the serve (2472.0) and the return (2473.1).
        video_time: 2472.55,
      },
    });
  });

  test("after an added stroke it inherits the nearest vendor stroke before it", () => {
    // s-added (no event id) follows event 102; the tombstone between is skipped.
    const plan = planAddedShot(point, "s-added");
    expect(plan).toMatchObject({
      ok: true,
      write: {
        event_id: null,
        after_event_id: 102,
        status: "added",
        hitter: "p2",
        // The rally's last stroke: no neighbour to sit between, so it is
        // timed half a second after s-added (2474.4) and sorts after it.
        video_time: 2474.9,
      },
    });
  });

  test("two strokes added in a row at the end keep the order they were added in", () => {
    const first = planAddedShot(point, "s-added");
    if (!("ok" in first)) throw new Error("plan refused");
    const added = {
      id: "s-added-2",
      eventId: null,
      afterEventId: first.write.after_event_id,
      status: "added" as const,
      hitter: first.write.hitter,
      videoTime: first.write.video_time,
    };
    const second = planAddedShot(
      { ...point, shots: [...point.shots, { ...point.shots[0], ...added }] },
      "s-added-2",
    );
    if (!("ok" in second)) throw new Error("plan refused");
    expect(second.write.video_time).toBeGreaterThan(first.write.video_time!);
  });

  test("with no stroke named it goes at the end of the rally", () => {
    expect(planAddedShot(point, null)).toEqual(planAddedShot(point, "s-added"));
  });

  test("an empty rally's first stroke is the server's, after nothing", () => {
    const empty = { ...labelSessionFixture().points[3], shots: [] };
    expect(planAddedShot(empty, null)).toEqual({
      ok: true,
      write: {
        event_id: null,
        after_event_id: null,
        status: "added",
        hitter: "p2",
        video_time: null,
      },
    });
  });

  test("refuses a tombstone, a stroke from elsewhere and a deleted point", () => {
    expect(planAddedShot(point, "s-phantom")).toHaveProperty("error");
    expect(planAddedShot(point, "s-ace")).toHaveProperty("error");
    expect(
      planAddedShot({ ...point, status: "deleted" }, "s-serve"),
    ).toHaveProperty("error");
  });
});

// ── Move a point ────────────────────────────────────────────────────────────

test.describe("move point", () => {
  /** A point with no strokes: a move only ever takes the server. */
  const unchangedP1 = {
    status: "unchanged" as const,
    server: "p1" as const,
    setNumber: 1,
    gameNumber: 3,
    serveSide: null,
    winner: "p1" as const,
    ending: "winner" as const,
    endedBy: "p1" as const,
    seed: null,
    shots: [],
  };
  /** The same point, seeded where it sits: set 1, game 3, p1 serving. */
  const seededP1 = {
    ...unchangedP1,
    seed: {
      set_number: 1,
      game_number: 3,
      server: "p1" as const,
      serve_side: null,
      winner: "p1" as const,
      ending: "winner" as const,
      ended_by: "p1" as const,
    },
  };

  test("moved away is edited; moved back to its seeded game is unchanged", () => {
    const away = planPointMove(
      seededP1,
      { setNumber: 1, gameNumber: 4 },
      "p1",
      false,
    );
    expect(away).toEqual({
      ok: true,
      write: { set_number: 1, game_number: 4, status: "edited" },
      shots: [],
    });
    const moved = { ...seededP1, gameNumber: 4, status: "edited" as const };
    expect(
      planPointMove(moved, { setNumber: 1, gameNumber: 3 }, "p1", false),
    ).toEqual({
      ok: true,
      write: { set_number: 1, game_number: 3, status: "unchanged" },
      shots: [],
    });
    // Back in its game but with a label still changed: stays edited.
    expect(
      planPointMove(
        { ...moved, winner: "p2" },
        { setNumber: 1, gameNumber: 3 },
        "p1",
        false,
      ),
    ).toMatchObject({ write: { status: "edited" } });
  });

  test("a server switched away and switched back counts as set back", () => {
    // Moved into game 4, whose server p2 it took on.
    const moved = {
      ...seededP1,
      gameNumber: 4,
      server: "p2" as const,
      status: "edited" as const,
    };
    expect(
      planPointMove(moved, { setNumber: 1, gameNumber: 3 }, "p1", true),
    ).toEqual({
      ok: true,
      write: {
        set_number: 1,
        game_number: 3,
        status: "unchanged",
        server: "p1",
      },
      shots: [],
    });
  });

  test("a server switch that the point's strokes contradict switches its players too", () => {
    // The fixture's P2: Lee's (p1) ace in game 1, seeded so. Game 2 is
    // Vargas's — moving there, the serve says Lee served, so every row
    // changes hands: the ace is Vargas's, and so is the point.
    const { points } = labelSessionFixture();
    const p2 = points.find((p) => p.id === FIXTURE_POINT_IDS.P2)!;
    const plan = planPointMove(p2, { setNumber: 1, gameNumber: 2 }, "p2", true);
    expect(plan).toEqual({
      ok: true,
      write: {
        set_number: 1,
        game_number: 2,
        status: "edited",
        server: "p2",
        winner: "p2",
        ended_by: "p2",
      },
      shots: [
        {
          id: "s-ace",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
        },
      ],
    });
    // Rows that already agree with the new server: the server alone.
    const agreeing = {
      ...p2,
      shots: p2.shots.map((shot) => ({ ...shot, hitter: "p2" as const })),
    };
    expect(
      planPointMove(agreeing, { setNumber: 1, gameNumber: 2 }, "p2", true),
    ).toEqual({
      ok: true,
      write: { set_number: 1, game_number: 2, status: "edited", server: "p2" },
      shots: [],
    });
    // The console's apply agrees with the plan.
    if ("error" in plan) throw new Error(plan.error);
    expect(applyPointMove(p2, plan.write)).toMatchObject({
      gameNumber: 2,
      server: "p2",
      winner: "p2",
      endedBy: "p2",
      status: "edited",
    });
  });

  test("into a game someone else serves: refused unless switchServer", () => {
    const refused = planPointMove(
      unchangedP1,
      { setNumber: 1, gameNumber: 4 },
      "p2",
      false,
    );
    expect(refused).toHaveProperty("error");

    const switched = planPointMove(
      unchangedP1,
      { setNumber: 1, gameNumber: 4 },
      "p2",
      true,
    );
    expect(switched).toEqual({
      ok: true,
      write: { set_number: 1, game_number: 4, status: "edited", server: "p2" },
      shots: [],
    });
  });

  test("a same-server move needs no confirm and leaves server alone", () => {
    expect(moveNeedsServerSwitch(unchangedP1, "p1")).toBe(false);
    expect(moveNeedsServerSwitch(unchangedP1, null)).toBe(false);
    expect(moveNeedsServerSwitch(unchangedP1, "p2")).toBe(true);
    for (const destination of ["p1", null] as const) {
      const plan = planPointMove(
        unchangedP1,
        { setNumber: 1, gameNumber: 2 },
        destination,
        false,
      );
      expect(plan).toEqual({
        ok: true,
        write: { set_number: 1, game_number: 2, status: "edited" },
        shots: [],
      });
    }
  });

  test("an edited or added point keeps its status; bad moves are refused", () => {
    expect(
      planPointMove(
        { ...unchangedP1, status: "added" },
        { setNumber: 1, gameNumber: 2 },
        "p1",
        false,
      ),
    ).toMatchObject({ write: { status: "added" } });
    expect(
      planPointMove(unchangedP1, { setNumber: 1, gameNumber: 3 }, "p1", false),
    ).toHaveProperty("error");
    expect(
      planPointMove(unchangedP1, { setNumber: 0, gameNumber: 3 }, null, false),
    ).toHaveProperty("error");
    expect(
      planPointMove(
        { ...unchangedP1, status: "deleted" },
        { setNumber: 1, gameNumber: 2 },
        null,
        false,
      ),
    ).toHaveProperty("error");
  });

  test("a game's server is its other points' majority, the earliest on a tie", () => {
    expect(gameServer([])).toBeNull();
    expect(gameServer([{ server: null, pointIndex: 0 }])).toBeNull();
    expect(
      gameServer([
        { server: "p2", pointIndex: 5 },
        { server: "p1", pointIndex: 6 },
        { server: "p2", pointIndex: 7 },
      ]),
    ).toBe("p2");
    expect(
      gameServer([
        { server: "p1", pointIndex: 9 },
        { server: "p2", pointIndex: 8 },
      ]),
    ).toBe("p2");
  });

  test("the console offers the games either side, each with its server", () => {
    const { points } = labelSessionFixture();
    const { P1, P2, P4 } = FIXTURE_POINT_IDS;
    // P1 and P2 share game 1·1; P3 is a tombstone; P4 is 1·2, Vargas serving.
    expect(neighbourGames(points, P1)).toEqual([]);
    expect(neighbourGames(points, P2)).toEqual([
      { setNumber: 1, gameNumber: 2 },
    ]);
    expect(neighbourGames(points, P4)).toEqual([
      { setNumber: 1, gameNumber: 1 },
    ]);
    expect(
      destinationServerIn(points, P2, { setNumber: 1, gameNumber: 2 }),
    ).toBe("p2");
    // The deleted P3 (also 1·1) is not asked.
    expect(
      destinationServerIn(points, P4, { setNumber: 1, gameNumber: 1 }),
    ).toBe("p1");
  });
});

// ── Checked ─────────────────────────────────────────────────────────────────

test.describe("mark point checked", () => {
  const NOW = new Date("2026-09-28T12:00:00.000Z");

  test("sets checked_at to now, and Undo clears it", () => {
    expect(planPointChecked({ status: "edited" }, true, NOW)).toEqual({
      ok: true,
      write: { checked_at: "2026-09-28T12:00:00.000Z" },
    });
    expect(planPointChecked({ status: "edited" }, false, NOW)).toEqual({
      ok: true,
      write: { checked_at: null },
    });
    expect(planPointChecked({ status: "deleted" }, true, NOW)).toHaveProperty(
      "error",
    );
  });
});

// ── The services, over a fake client ───────────────────────────────────────

function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  shots?: Record<string, unknown>[];
  gamePoints?: Record<string, unknown>[];
  sessionStatus?: string;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      return rows.raced ? { data: [], error: null } : undefined;
    }
    if (call.op === "insert") {
      return {
        data: { id: OTHER_SHOT, ...call.values, delete_reason: null },
        error: null,
      };
    }
    if (call.table === "label_sessions") {
      return {
        data: { status: rows.sessionStatus ?? "labelling" },
        error: null,
      };
    }
    if (call.table === "label_shots") {
      return "label_point_id" in call.filters || call.in?.label_point_id
        ? { data: rows.shots ?? [], error: null }
        : { data: rows.shot ?? null, error: null };
    }
    if (call.table === "label_points") {
      return "game_number" in call.filters
        ? { data: rows.gamePoints ?? [], error: null }
        : { data: rows.point ?? null, error: null };
    }
    return undefined;
  });
}

const ADMIN = { requireAdmin: async () => ({ id: "admin" }) };
const NOBODY = { requireAdmin: async () => null };

test.describe("the services", () => {
  test("every entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const deps = {
      ...NOBODY,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    };
    const results = await Promise.all([
      deleteLabelShot(SHOT_ID, "other", deps),
      restoreLabelShot(SHOT_ID, deps),
      addLabelShot(POINT_ID, null, deps),
      deleteLabelPoint(POINT_ID, deps),
      moveLabelPoint(POINT_ID, { setNumber: 1, gameNumber: 2 }, false, deps),
      markLabelPointChecked(POINT_ID, deps),
      unmarkLabelPointChecked(POINT_ID, deps),
    ]);
    for (const result of results) {
      expect(result).toEqual({ error: "Administrator access is required." });
    }
    expect(built).toBe(0);
  });

  test("delete writes the tombstone, compare-and-set on the status read", async () => {
    const fake = fakeClient({
      shot: {
        id: SHOT_ID,
        session_id: SESSION_ID,
        status: "edited",
        status_before_delete: null,
        event_id: 102,
      },
    });
    const result = await writeLabelShotDelete({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      reason: "not_a_stroke",
    });
    expect(result).toEqual({ ok: true, status: "deleted" });
    expect(fake.calls.filter((c) => c.op === "update")).toEqual([
      {
        table: "label_shots",
        op: "update",
        values: {
          status: "deleted",
          status_before_delete: "edited",
          delete_reason: "not_a_stroke",
        },
        filters: { id: SHOT_ID, status: "edited" },
      },
    ]);
  });

  test("Undo restores the remembered status and clears the reason", async () => {
    const fake = fakeClient({
      shot: {
        id: SHOT_ID,
        session_id: SESSION_ID,
        status: "deleted",
        status_before_delete: "edited",
        event_id: 102,
      },
    });
    expect(
      await writeLabelShotRestore({ supabase: fake.supabase, shotId: SHOT_ID }),
    ).toEqual({ ok: true, status: "edited" });
    expect(fake.calls.find((c) => c.op === "update")?.values).toEqual({
      status: "edited",
      status_before_delete: null,
      delete_reason: null,
    });
  });

  test("a race, a complete session and a missing row are refused", async () => {
    const shot = {
      id: SHOT_ID,
      session_id: SESSION_ID,
      status: "kept",
      status_before_delete: null,
      event_id: 101,
    };
    const raced = fakeClient({ shot, raced: true });
    expect(
      await writeLabelShotDelete({
        supabase: raced.supabase,
        shotId: SHOT_ID,
        reason: "other",
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });

    const frozen = fakeClient({ shot, sessionStatus: "complete" });
    expect(
      await writeLabelShotDelete({
        supabase: frozen.supabase,
        shotId: SHOT_ID,
        reason: "other",
      }),
    ).toHaveProperty("error");
    expect(frozen.calls.some((c) => c.op === "update")).toBe(false);

    const missing = fakeClient({ shot: null });
    expect(
      await writeLabelShotRestore({
        supabase: missing.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "Shot not found." });
  });

  test("add inserts an added row after the named stroke", async () => {
    const fake = fakeClient({
      point: {
        id: POINT_ID,
        session_id: SESSION_ID,
        status: "unchanged",
        status_before_delete: null,
        server: "p1",
        set_number: 1,
        game_number: 1,
      },
      shots: [
        {
          id: SHOT_ID,
          label_point_id: POINT_ID,
          event_id: 501,
          after_event_id: null,
          status: "kept",
          status_before_delete: null,
          delete_reason: null,
          hitter: "p1",
          stroke: "first_serve",
          result: "in",
          contact_x: null,
          contact_y: null,
          landing_x: null,
          landing_y: null,
          video_time: 100,
        },
      ],
    });
    const result = await writeLabelShotAdd({
      supabase: fake.supabase,
      pointId: POINT_ID,
      afterShotId: SHOT_ID,
    });
    const insert = fake.calls.find((c) => c.op === "insert");
    expect(insert).toMatchObject({
      table: "label_shots",
      values: {
        session_id: SESSION_ID,
        label_point_id: POINT_ID,
        event_id: null,
        after_event_id: 501,
        status: "added",
        hitter: "p2",
        video_time: 100.5,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      shot: {
        id: OTHER_SHOT,
        eventId: null,
        afterEventId: 501,
        status: "added",
        hitter: "p2",
      },
    });
  });

  const pointRow = {
    id: POINT_ID,
    session_id: SESSION_ID,
    status: "unchanged",
    status_before_delete: null,
    server: "p1",
    set_number: 1,
    game_number: 3,
  };

  test("move refuses a server change without switchServer, writing nothing", async () => {
    const fake = fakeClient({
      point: pointRow,
      gamePoints: [{ server: "p2", point_index: 20 }],
    });
    const result = await writeLabelPointMove({
      supabase: fake.supabase,
      pointId: POINT_ID,
      to: { setNumber: 1, gameNumber: 4 },
      switchServer: false,
    });
    expect(result).toHaveProperty("error");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
    // It asked the destination game's other live points.
    expect(
      fake.calls.find(
        (c) => c.table === "label_points" && "game_number" in c.filters,
      ),
    ).toMatchObject({
      filters: { session_id: SESSION_ID, set_number: 1, game_number: 4 },
      negated: { status: "deleted", id: POINT_ID },
    });
  });

  test("a switch the strokes contradict flips the point, then its strokes in grouped writes — label_points and label_shots, no delete", async () => {
    const shotRow = (id: string, fields: Record<string, unknown>) =>
      labelShotRow(id, POINT_ID, fields);
    const fake = fakeClient({
      point: { ...pointRow, winner: "p1", ended_by: "p2", seed: null },
      gamePoints: [{ server: "p2", point_index: 20 }],
      shots: [
        shotRow(SHOT_ID, {
          event_id: 1,
          hitter: "p1",
          stroke: "first_serve",
          video_time: 1,
        }),
        shotRow(OTHER_SHOT, {
          event_id: 2,
          hitter: "p2",
          stroke: "backhand",
          video_time: 2,
        }),
        shotRow("dddddddd-dddd-4ddd-8ddd-dddddddddddd", {
          event_id: 3,
          hitter: "p1",
          stroke: "forehand",
          video_time: 3,
          status: "deleted",
          status_before_delete: "kept",
          delete_reason: "other",
        }),
        shotRow("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", {
          event_id: null,
          hitter: "p2",
          stroke: "forehand",
          video_time: 4,
          status: "added",
          seed: null,
        }),
      ],
    });
    const result = await writeLabelPointMove({
      supabase: fake.supabase,
      pointId: POINT_ID,
      to: { setNumber: 1, gameNumber: 4 },
      switchServer: true,
    });
    expect(result).toEqual({
      ok: true,
      status: "edited",
      server: "p2",
      setNumber: 1,
      gameNumber: 4,
      winner: "p2",
      endedBy: "p1",
      shots: [
        {
          id: SHOT_ID,
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
        },
        {
          id: OTHER_SHOT,
          hitter: "p1",
          status: "edited",
          status_before_delete: null,
        },
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          hitter: "p2",
          status: "deleted",
          status_before_delete: "edited",
        },
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          hitter: "p1",
          status: "added",
          status_before_delete: null,
        },
      ],
    });
    // The point first (compare-and-set), then one write per distinct
    // value tuple, by id list, in the order the tuples first appear.
    const updates = fake.calls.filter((c) => c.op === "update");
    expect(updates.map((c) => c.table)).toEqual([
      "label_points",
      "label_shots",
      "label_shots",
      "label_shots",
      "label_shots",
    ]);
    expect(updates[0]).toMatchObject({
      filters: { id: POINT_ID, status: "unchanged" },
      values: {
        set_number: 1,
        game_number: 4,
        status: "edited",
        server: "p2",
        winner: "p2",
        ended_by: "p1",
      },
    });
    expect(updates.slice(1).map((c) => [c.values, c.in])).toEqual([
      [
        { hitter: "p2", status: "edited", status_before_delete: null },
        { id: [SHOT_ID] },
      ],
      [
        { hitter: "p1", status: "edited", status_before_delete: null },
        { id: [OTHER_SHOT] },
      ],
      [
        { hitter: "p2", status: "deleted", status_before_delete: "edited" },
        { id: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"] },
      ],
      [
        { hitter: "p1", status: "added", status_before_delete: null },
        { id: ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"] },
      ],
    ]);
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
      expect(["select", "update"]).toContain(call.op);
    }
  });

  test("a point that races away is not moved, and no stroke is touched", async () => {
    const fake = fakeClient({
      point: pointRow,
      gamePoints: [{ server: "p2", point_index: 20 }],
      shots: [
        labelShotRow(SHOT_ID, POINT_ID, {
          stroke: "first_serve",
          video_time: 1,
          seed: null,
        }),
      ],
      raced: true,
    });
    expect(
      await writeLabelPointMove({
        supabase: fake.supabase,
        pointId: POINT_ID,
        to: { setNumber: 1, gameNumber: 4 },
        switchServer: true,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    expect(
      fake.calls.filter((c) => c.op === "update").map((c) => c.table),
    ).toEqual(["label_points"]);
  });

  test("checked sets checked_at, and unchecking clears it", async () => {
    const deps = (fake: ReturnType<typeof fakeClient>) => ({
      ...ADMIN,
      createAdminClient: () => fake.supabase,
    });
    const marking = fakeClient({ point: pointRow });
    const marked = await markLabelPointChecked(POINT_ID, deps(marking));
    expect(marked).toMatchObject({ ok: true });
    const at = (marked as { checkedAt: string }).checkedAt;
    expect(Number.isNaN(Date.parse(at))).toBe(false);
    expect(marking.calls.find((c) => c.op === "update")?.values).toEqual({
      checked_at: at,
    });

    const clearing = fakeClient({ point: pointRow });
    expect(await unmarkLabelPointChecked(POINT_ID, deps(clearing))).toEqual({
      ok: true,
      checkedAt: null,
    });
    expect(clearing.calls.find((c) => c.op === "update")?.values).toEqual({
      checked_at: null,
    });

    const tombstone = fakeClient({ point: { ...pointRow, status: "deleted" } });
    expect(
      await markLabelPointChecked(POINT_ID, deps(tombstone)),
    ).toHaveProperty("error");
  });

  test("every service call stays on label_points / label_shots / label_sessions", async () => {
    const fake = fakeClient({
      point: pointRow,
      shot: {
        id: SHOT_ID,
        session_id: SESSION_ID,
        status: "kept",
        status_before_delete: null,
        event_id: 1,
      },
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    await deleteLabelShot(SHOT_ID, "other", deps);
    await deleteLabelPoint(POINT_ID, deps);
    await markLabelPointChecked(POINT_ID, deps);
    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
      expect(["select", "update", "insert"]).toContain(call.op);
    }
  });
});

test("no operation issues a SQL DELETE on a label_* row", () => {
  for (const file of [
    "src/lib/services/labels/operations.ts",
    "src/lib/services/labels/operations-session.ts",
    "src/lib/services/labels/edit-session.ts",
    "src/lib/services/labels/reset.ts",
    "src/lib/services/labels/reset-session.ts",
    "src/lib/services/labels/site-removal.ts",
    "src/lib/services/labels/site-removal-session.ts",
    "src/lib/services/labels/suggestions.ts",
    "src/lib/services/labels/suggestions-session.ts",
    "src/lib/services/labels/point-insert.ts",
    "src/lib/services/labels/point-insert-session.ts",
    "src/lib/services/labels/game-shift.ts",
    "src/lib/services/labels/game-shift-session.ts",
    "src/lib/services/labels/session-fields.ts",
    "src/lib/services/labels/session-fields-session.ts",
    "src/lib/services/labels/point-split.ts",
    "src/lib/services/labels/point-split-session.ts",
    "src/lib/services/labels/point-combine.ts",
    "src/lib/services/labels/point-combine-session.ts",
    "src/lib/services/labels/player-swap.ts",
    "src/lib/services/labels/player-swap-session.ts",
    "src/app/admin/labels/actions.ts",
  ]) {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source, file).not.toMatch(/\.delete\s*\(/);
  }
});
