import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  DEAD_BALLS_REMOVED_WITH_MISS,
  LABEL_DELETE_REASONS,
  applyPointDelete,
  applyPointRestore,
  applyShotDelete,
  applyShotRestore,
  applyShotsRemoved,
  applyShotsRestored,
  deadBallsAfterMiss,
  destinationServerIn,
  gameServer,
  applyPointMove,
  liveShotsAfter,
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
  removeLabelShotsAfter,
  restoreLabelShot,
  restoreLabelShots,
  unmarkLabelPointChecked,
  writeLabelPointMove,
  writeLabelShotAdd,
  writeLabelShotDelete,
  writeLabelShotRestore,
  writeLabelShotsRemoveAfter,
  writeLabelShotsRestore,
} from "@/lib/services/labels/operations-session";
import { orderLabelShots, type LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  POINT_1_SHOTS,
  POINT_4_SHOTS,
  fakeLabelClient,
  labelSessionFixture,
  labelShot,
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

// ── Dead balls after the point ─────────────────────────────────────────────

test.describe("dead balls after a ball marked out", () => {
  const shots = orderLabelShots(POINT_1_SHOTS);
  const back = shots.find((s) => s.id === "s-return")!;

  test("the live strokes after one, in video order; a tombstone or an unknown stroke counts for nothing", () => {
    // Serve, return, the deleted phantom, the added forehand.
    expect(liveShotsAfter(shots, "s-serve", true).map((s) => s.id)).toEqual([
      "s-return",
      "s-added",
    ]);
    expect(liveShotsAfter(shots, "s-return", true).map((s) => s.id)).toEqual([
      "s-added",
    ]);
    expect(liveShotsAfter(shots, "s-added", true)).toEqual([]);
    expect(liveShotsAfter(shots, "nope", true)).toEqual([]);
    // A ghost is no stroke with marks on, and one with them off.
    expect(
      liveShotsAfter(POINT_4_SHOTS, "s-p4-fault", true).map((s) => s.id),
    ).toEqual(["s-p4-serve"]);
    expect(
      liveShotsAfter(POINT_4_SHOTS, "s-p4-fault", false).map((s) => s.id),
    ).toEqual(["s-p4-ghost", "s-p4-serve"]);
  });

  test("a rally ball newly out or in the net takes one or two strokes after it, never a serve's, never three", () => {
    const out = { result: "out" as const };
    expect(
      deadBallsAfterMiss(shots, "s-return", back, out, true).map((s) => s.id),
    ).toEqual(["s-added"]);
    expect(
      deadBallsAfterMiss(shots, "s-return", back, { result: "net" }, true),
    ).toHaveLength(1);
    // Already a miss, a patch with no result, or a serve: nothing.
    expect(
      deadBallsAfterMiss(shots, "s-return", { result: "out" }, out, true),
    ).toEqual([]);
    expect(
      deadBallsAfterMiss(shots, "s-return", back, { spin: "flat" }, true),
    ).toEqual([]);
    expect(
      deadBallsAfterMiss(shots, "s-serve", { result: "in" }, out, true),
    ).toEqual([]);
    // Two go; three stay.
    const more = (n: number) => [
      ...shots,
      ...Array.from({ length: n }, (_, i) =>
        labelShot(`s-more-${i}`, "p-0001", { videoTime: 2480 + i }),
      ),
    ];
    expect(
      deadBallsAfterMiss(more(1), "s-return", back, out, true),
    ).toHaveLength(DEAD_BALLS_REMOVED_WITH_MISS);
    expect(deadBallsAfterMiss(more(2), "s-return", back, out, true)).toEqual(
      [],
    );
  });

  test("the console's rows take the server's tombstones and restores as written", () => {
    const removed = applyShotsRemoved(shots, [
      { id: "s-added", statusBeforeDelete: "added" },
    ]);
    expect(removed.find((s) => s.id === "s-added")).toMatchObject({
      status: "deleted",
      statusBeforeDelete: "added",
      deleteReason: "dead_ball_after_point",
    });
    expect(removed.filter((s) => s.id !== "s-added")).toEqual(
      shots.filter((s) => s.id !== "s-added"),
    );
    expect(
      applyShotsRestored(removed, [{ id: "s-added", status: "added" }]),
    ).toEqual(shots);
  });
});

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
          was: "kept",
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

/** The point a shot belongs to when a test says nothing of it: blank. */
const OWNING_POINT = {
  id: POINT_ID,
  session_id: SESSION_ID,
  updated_at: "2026-10-01T10:00:00+00:00",
  status: "unchanged",
  status_before_delete: null,
  server: "p1",
  set_number: 1,
  game_number: 1,
  serve_side: null,
  winner: null,
  ending: null,
  ended_by: null,
  seed: null,
};

/**
 * A shot's row, the point's shot rows (`shots`) and the point's own row —
 * `OWNING_POINT` unless given, `null` for none. The point row takes each
 * successful `label_points` update, so the ending sync's re-read sees it.
 */
function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  shots?: Record<string, unknown>[];
  gamePoints?: Record<string, unknown>[];
  sessionStatus?: string;
  marksEnabled?: boolean;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  let point = rows.point === undefined ? OWNING_POINT : rows.point;
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      if (rows.raced) return { data: [], error: null };
      if (call.table === "label_points" && point) {
        point = { ...point, ...call.values };
      }
      return undefined;
    }
    if (call.op === "insert") {
      return {
        data: { id: OTHER_SHOT, ...call.values, delete_reason: null },
        error: null,
      };
    }
    if (call.table === "label_sessions") {
      return {
        data: {
          status: rows.sessionStatus ?? "labelling",
          marks_enabled: rows.marksEnabled ?? false,
        },
        error: null,
      };
    }
    if (call.table === "label_shots") {
      // A read by id list answers with those of the point's rows.
      const ids = call.in?.id;
      if (ids) {
        return {
          data: (rows.shots ?? []).filter((s) => ids.includes(s.id)),
          error: null,
        };
      }
      return "label_point_id" in call.filters || call.in?.label_point_id
        ? { data: rows.shots ?? [], error: null }
        : { data: rows.shot ?? null, error: null };
    }
    if (call.table === "label_points") {
      return "game_number" in call.filters
        ? { data: rows.gamePoints ?? [], error: null }
        : { data: point, error: null };
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
      removeLabelShotsAfter(SHOT_ID, deps),
      restoreLabelShots([SHOT_ID], deps),
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

  test("a delete, an Undo and an add each settle the point's ending in the same call, after the stroke's own write", async () => {
    // Lee's serve, Vargas's return in, Lee's forehand out: Vargas's point on
    // Lee's error. Delete the forehand and the point ends on the return.
    const serve = labelShotRow(OTHER_SHOT, POINT_ID, {
      stroke: "first_serve",
      video_time: 1,
    });
    const back = labelShotRow(
      "cccccccc-cccc-4ccc-8ccc-000000000002",
      POINT_ID,
      {
        hitter: "p2",
        stroke: "backhand",
        video_time: 2,
      },
    );
    const last = labelShotRow(SHOT_ID, POINT_ID, {
      result: "out",
      video_time: 3,
    });
    const point = {
      ...OWNING_POINT,
      winner: "p2",
      ending: "error",
      ended_by: "p1",
    };

    const deleted = fakeClient({
      shot: { ...last, session_id: SESSION_ID },
      shots: [serve, back, last],
      point,
    });
    expect(
      await writeLabelShotDelete({
        supabase: deleted.supabase,
        shotId: SHOT_ID,
        reason: "not_a_stroke",
      }),
    ).toEqual({
      ok: true,
      status: "deleted",
      point: {
        ending: "winner",
        endedBy: "p2",
        winner: "p2",
        status: "edited",
      },
    });
    expect(
      deleted.calls
        .filter((c) => c.op === "update")
        .map((c) => [c.table, c.values]),
    ).toEqual([
      [
        "label_shots",
        {
          status: "deleted",
          status_before_delete: "kept",
          delete_reason: "not_a_stroke",
        },
      ],
      ["label_points", { ending: "winner", ended_by: "p2", status: "edited" }],
    ]);
    // Compare-and-set on the `updated_at` the point was read with.
    expect(deleted.calls.at(-1)?.filters).toEqual({
      id: POINT_ID,
      updated_at: OWNING_POINT.updated_at,
    });

    // Undo it: the forehand is the last stroke again, out, so Lee's error.
    const restored = fakeClient({
      shot: {
        ...last,
        session_id: SESSION_ID,
        status: "deleted",
        status_before_delete: "kept",
      },
      shots: [serve, back, { ...last, status: "deleted" }],
      point: { ...point, ending: "winner", ended_by: "p2" },
    });
    expect(
      await writeLabelShotRestore({
        supabase: restored.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({
      ok: true,
      status: "kept",
      point: { ending: "error", endedBy: "p1", winner: "p2", status: "edited" },
    });

    // Add a stroke after the forehand: Vargas's, with no result yet, so the
    // rows read her as the winner of the point she holds.
    const added = fakeClient({
      point: { ...point, server: "p1" },
      shots: [serve, back, last],
    });
    const result = await writeLabelShotAdd({
      supabase: added.supabase,
      pointId: POINT_ID,
      afterShotId: null,
    });
    expect(result).toMatchObject({
      ok: true,
      shot: { hitter: "p2", status: "added" },
      point: { ending: "winner", endedBy: "p2", winner: "p2" },
    });
    // The point's rows are read alongside its session's gate.
    expect(added.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_sessions", "select"],
      ["label_shots", "insert"],
      ["label_points", "select"],
      ["label_points", "update"],
    ]);

    // A stroke change that leaves the rows saying the same thing — the serve
    // deleted, the forehand still Lee's error: the shot's write alone, and no
    // point in the answer.
    const same = fakeClient({
      shot: { ...serve, session_id: SESSION_ID },
      shots: [serve, back, last],
      point,
    });
    expect(
      await writeLabelShotDelete({
        supabase: same.supabase,
        shotId: serve.id,
        reason: "not_a_stroke",
      }),
    ).toEqual({ ok: true, status: "deleted" });
    expect(same.calls.filter((c) => c.op === "update")).toHaveLength(1);
  });

  test("Remove N tombstones every live stroke after one in a single call, then the point's ending once", async () => {
    // Lee's serve, Vargas's return out, then Lee's swing, a tombstone and
    // Vargas's edited swing: the two live ones were hit after the point.
    const AFTER_1 = "cccccccc-cccc-4ccc-8ccc-000000000011";
    const GONE = "cccccccc-cccc-4ccc-8ccc-000000000012";
    const AFTER_2 = "cccccccc-cccc-4ccc-8ccc-000000000013";
    const serve = labelShotRow(OTHER_SHOT, POINT_ID, {
      stroke: "first_serve",
      video_time: 1,
    });
    const back = labelShotRow(SHOT_ID, POINT_ID, {
      hitter: "p2",
      stroke: "backhand",
      result: "out",
      video_time: 2,
    });
    const rows = [
      serve,
      back,
      labelShotRow(AFTER_1, POINT_ID, { result: null, video_time: 3 }),
      labelShotRow(GONE, POINT_ID, {
        status: "deleted",
        status_before_delete: "kept",
        delete_reason: "other",
        video_time: 4,
      }),
      labelShotRow(AFTER_2, POINT_ID, {
        hitter: "p2",
        result: null,
        status: "edited",
        video_time: 5,
      }),
    ];
    const anchor = { ...back, session_id: SESSION_ID };
    const point = {
      ...OWNING_POINT,
      winner: "p1",
      ending: "winner",
      ended_by: "p1",
    };

    const fake = fakeClient({ shot: anchor, shots: rows, point });
    expect(
      await writeLabelShotsRemoveAfter({
        supabase: fake.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({
      ok: true,
      removed: [
        { id: AFTER_1, statusBeforeDelete: "kept" },
        { id: AFTER_2, statusBeforeDelete: "edited" },
      ],
      // The return, out, right after the serve: a service winner.
      point: {
        ending: "service_winner",
        endedBy: "p2",
        winner: "p1",
        status: "edited",
      },
    });
    const tombstone = (id: string, was: string) => ({
      table: "label_shots",
      op: "update",
      values: {
        status: "deleted",
        status_before_delete: was,
        delete_reason: "dead_ball_after_point",
      },
      filters: { id, status: was },
    });
    expect(fake.calls.filter((c) => c.op === "update")).toEqual([
      tombstone(AFTER_1, "kept"),
      tombstone(AFTER_2, "edited"),
      {
        table: "label_points",
        op: "update",
        values: { ending: "service_winner", ended_by: "p2", status: "edited" },
        filters: { id: POINT_ID, updated_at: OWNING_POINT.updated_at },
      },
    ]);
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
    }

    // Nothing live after the last stroke, a tombstone as the anchor, a
    // complete session and a race: refused, and nothing written past the
    // refusal.
    const last = { ...rows[4], session_id: SESSION_ID };
    const none = fakeClient({ shot: last, shots: rows, point });
    expect(
      await writeLabelShotsRemoveAfter({
        supabase: none.supabase,
        shotId: AFTER_2,
      }),
    ).toEqual({ error: "There is no live shot after this one to remove." });
    expect(none.calls.some((c) => c.op === "update")).toBe(false);

    const gone = fakeClient({
      shot: { ...rows[3], session_id: SESSION_ID },
      shots: rows,
      point,
    });
    expect(
      await writeLabelShotsRemoveAfter({
        supabase: gone.supabase,
        shotId: GONE,
      }),
    ).toEqual({
      error: "Restore this shot before removing the shots after it.",
    });

    const frozen = fakeClient({
      shot: anchor,
      shots: rows,
      point,
      sessionStatus: "complete",
    });
    expect(
      await writeLabelShotsRemoveAfter({
        supabase: frozen.supabase,
        shotId: SHOT_ID,
      }),
    ).toHaveProperty("error");
    expect(frozen.calls.some((c) => c.op === "update")).toBe(false);

    const raced = fakeClient({ shot: anchor, shots: rows, point, raced: true });
    expect(
      await writeLabelShotsRemoveAfter({
        supabase: raced.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    expect(raced.calls.filter((c) => c.op === "update")).toHaveLength(1);

    expect(
      await writeLabelShotsRemoveAfter({
        supabase: fake.supabase,
        shotId: "x",
      }),
    ).toEqual({ error: "Invalid shot id." });
  });

  test("Restore N puts a removal's tombstones back in a single call, every plan checked before the first write", async () => {
    const AFTER_1 = "cccccccc-cccc-4ccc-8ccc-000000000011";
    const AFTER_2 = "cccccccc-cccc-4ccc-8ccc-000000000013";
    const ELSEWHERE = "cccccccc-cccc-4ccc-8ccc-000000000099";
    const serve = labelShotRow(OTHER_SHOT, POINT_ID, {
      stroke: "first_serve",
      video_time: 1,
    });
    const back = labelShotRow(SHOT_ID, POINT_ID, {
      hitter: "p2",
      stroke: "backhand",
      result: "out",
      video_time: 2,
    });
    const dead = (id: string, was: string, fields: Record<string, unknown>) =>
      labelShotRow(id, POINT_ID, {
        status: "deleted",
        status_before_delete: was,
        delete_reason: "dead_ball_after_point",
        result: null,
        ...fields,
      });
    const rows = [
      serve,
      back,
      dead(AFTER_1, "kept", { video_time: 3 }),
      dead(AFTER_2, "edited", { hitter: "p2", video_time: 4 }),
      // A tombstone of another point: never restored with these.
      { ...dead(ELSEWHERE, "kept", {}), label_point_id: "other-point" },
    ];
    const point = {
      ...OWNING_POINT,
      winner: "p1",
      ending: "service_winner",
      ended_by: "p2",
    };

    const fake = fakeClient({ shots: rows, point });
    expect(
      await writeLabelShotsRestore({
        supabase: fake.supabase,
        shotIds: [AFTER_1, AFTER_2, AFTER_1],
      }),
    ).toEqual({
      ok: true,
      restored: [
        { id: AFTER_1, status: "kept" },
        { id: AFTER_2, status: "edited" },
      ],
      // Vargas's swing, with nothing on it, is the last stroke again: by
      // the side the point says lost, so her error.
      point: { ending: "error", endedBy: "p2", winner: "p1", status: "edited" },
    });
    const restore = (id: string, status: string) => ({
      table: "label_shots",
      op: "update",
      values: { status, status_before_delete: null, delete_reason: null },
      filters: { id, status: "deleted" },
    });
    expect(fake.calls.filter((c) => c.op === "update")).toEqual([
      restore(AFTER_1, "kept"),
      restore(AFTER_2, "edited"),
      {
        table: "label_points",
        op: "update",
        values: { ending: "error", ended_by: "p2", status: "edited" },
        filters: { id: POINT_ID, updated_at: OWNING_POINT.updated_at },
      },
    ]);
    // The rows were read by id list first, the session's gate after.
    expect(fake.calls[0]).toMatchObject({
      table: "label_shots",
      op: "select",
      in: { id: [AFTER_1, AFTER_2] },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
    }

    // A live stroke among the ids, ids of two points, one not found, and a
    // list that is empty or malformed: refused before any write.
    const live = fakeClient({ shots: rows, point });
    expect(
      await writeLabelShotsRestore({
        supabase: live.supabase,
        shotIds: [AFTER_1, SHOT_ID],
      }),
    ).toEqual({ error: "This shot is not deleted." });
    expect(live.calls.some((c) => c.op === "update")).toBe(false);

    const twoPoints = fakeClient({ shots: rows, point });
    expect(
      await writeLabelShotsRestore({
        supabase: twoPoints.supabase,
        shotIds: [AFTER_1, ELSEWHERE],
      }),
    ).toEqual({ error: "The shots to restore must all be of one point." });
    expect(twoPoints.calls.some((c) => c.op === "update")).toBe(false);

    const missing = fakeClient({ shots: rows, point });
    expect(
      await writeLabelShotsRestore({
        supabase: missing.supabase,
        shotIds: [AFTER_1, "cccccccc-cccc-4ccc-8ccc-000000000077"],
      }),
    ).toEqual({ error: "Shot not found." });

    for (const bad of [[], ["x"], "not a list", [AFTER_1, 7]]) {
      expect(
        await writeLabelShotsRestore({ supabase: fake.supabase, shotIds: bad }),
      ).toEqual({ error: "Invalid shot ids." });
    }
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
          was: "kept",
        },
        {
          id: OTHER_SHOT,
          hitter: "p1",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          hitter: "p2",
          status: "deleted",
          status_before_delete: "edited",
          was: "deleted",
        },
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          hitter: "p1",
          status: "added",
          status_before_delete: null,
          was: "added",
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
    // Each group compare-and-set on the status its strokes were read with;
    // `was` itself is never a column written.
    expect(updates.slice(1).map((c) => [c.values, c.in, c.filters])).toEqual([
      [
        { hitter: "p2", status: "edited", status_before_delete: null },
        { id: [SHOT_ID] },
        { status: "kept" },
      ],
      [
        { hitter: "p1", status: "edited", status_before_delete: null },
        { id: [OTHER_SHOT] },
        { status: "kept" },
      ],
      [
        { hitter: "p2", status: "deleted", status_before_delete: "edited" },
        { id: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"] },
        { status: "deleted" },
      ],
      [
        { hitter: "p1", status: "added", status_before_delete: null },
        { id: ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"] },
        { status: "added" },
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
