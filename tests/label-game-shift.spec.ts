import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  applyGameShift,
  gameOverflow,
  leftoverIds,
  planGameShift,
  type GameShiftWrite,
} from "@/lib/services/labels/game-shift";
import {
  shiftLabelGameOverflow,
  writeLabelGameShift,
} from "@/lib/services/labels/game-shift-session";
import { labelScores } from "@/lib/services/labels/score";
import type {
  LabelGameType,
  LabelPoint,
  LabelSession,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import { labelSessionFixture } from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * "Move the leftover points to the next game" (`game-shift.ts`): a game
 * decided before its last row reads "Game–30" on the rows past the deciding
 * one, and those rows belong to the next game. The pure overflow reading and
 * the cascade plan; the service over a fake client, for its gate and the
 * ORDER and shape of its writes; the black rail's slot and the light menu's
 * item, rendered offline through `fixtures/vm-modules`.
 */

const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const MENU = "src/components/admin/labels/label-point-menu.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const NAMES = { p1: "Lee", p2: "Vargas" };

/** A point id the service accepts: a uuid carrying its ordinal. */
const UUID = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

function point(fields: Partial<LabelPoint> & { id: string }): LabelPoint {
  return {
    pointIndex: 0,
    vendorRallyIds: [],
    setNumber: 1,
    gameNumber: 1,
    server: "p1",
    serveSide: null,
    winner: null,
    ending: null,
    endedBy: null,
    gameType: "game",
    status: "unchanged",
    statusBeforeDelete: null,
    checkedAt: null,
    note: null,
    dismissed: [],
    seed: null,
    shots: [],
    ...fields,
  };
}

/**
 * A match from a sketch: one entry per game — its set, game number, server,
 * type and the winner of each point in order (`null` for a winner still
 * blank) — numbered down the match. Every vendor point is seeded with
 * exactly what it holds, so a move reads `edited` and a move back
 * `unchanged`.
 */
function match(
  games: {
    set?: number;
    game: number;
    server: LabelSide;
    type?: LabelGameType;
    winners: (LabelSide | null)[];
  }[],
): LabelPoint[] {
  const points: LabelPoint[] = [];
  for (const game of games) {
    for (const winner of game.winners) {
      const pointIndex = points.length;
      const setNumber = game.set ?? 1;
      points.push(
        point({
          id: UUID(pointIndex + 1),
          pointIndex,
          setNumber,
          gameNumber: game.game,
          server: game.server,
          gameType: game.type ?? "game",
          winner,
          ending: winner ? "winner" : null,
          seed: {
            set_number: setNumber,
            game_number: game.game,
            server: game.server,
            serve_side: null,
            winner,
            ending: winner ? "winner" : null,
            ended_by: null,
          },
        }),
      );
    }
  }
  return points;
}

/**
 * The labeller's own case: a point they added at the top of game 1 (Vargas
 * serving), then the vendor's eight. Lee wins the game on the sixth row, so
 * the last two read "Game–30" and "Game–40" — under ad scoring and without.
 */
function usersCase(): LabelPoint[] {
  const points = match([
    {
      game: 1,
      server: "p2",
      winners: ["p1", "p2", "p1", "p1", "p2", "p1", "p2", "p2"],
    },
    { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
  ]);
  // The first row is the added one: no seed, `added`.
  return points.map((p, i) =>
    i === 0 ? { ...p, status: "added", seed: null } : p,
  );
}

const ids = (points: readonly { id: string }[]) => points.map((p) => p.id);

// ── Overflow ───────────────────────────────────────────────────────────────

test.describe("gameOverflow", () => {
  test("the user's case: the rows after the deciding one, with ad scoring and without", () => {
    for (const adScoring of [true, false]) {
      const overflow = gameOverflow(usersCase(), adScoring);
      expect(overflow, `ad ${adScoring}`).toHaveLength(1);
      expect(overflow[0]).toMatchObject({
        setNumber: 1,
        gameNumber: 1,
        decidedBy: "p1",
      });
      expect(ids(overflow[0].leftovers)).toEqual([UUID(7), UUID(8)]);
      // What the scoreboard says of the same rows.
      const scores = labelScores(usersCase(), adScoring).points;
      expect(scores.get(UUID(7))?.scoreBefore).toBe("30–Game");
      expect(scores.get(UUID(8))?.scoreBefore).toBe("40–Game");
    }
  });

  test("a game decided on its last row has none; a 40–40 game decides a point later with ad scoring than without", () => {
    expect(gameOverflow(usersCase().slice(0, 6), true)).toEqual([]);
    const deuce = match([
      {
        game: 1,
        server: "p1",
        winners: ["p1", "p2", "p1", "p2", "p1", "p2", "p1", "p1", "p2"],
      },
    ]);
    // No-ad: the leader's fourth point (the seventh row) decides; two rows
    // sit past it.
    expect(ids(gameOverflow(deuce, false)[0].leftovers)).toEqual([
      UUID(8),
      UUID(9),
    ]);
    // Ad: two clear comes on the eighth row; one row sits past it.
    expect(ids(gameOverflow(deuce, true)[0].leftovers)).toEqual([UUID(9)]);
  });

  test("a let, a not-a-point and a winner-less row past the end are leftovers too; before it they are not", () => {
    const points = match([
      {
        game: 1,
        server: "p1",
        winners: ["p1", "p1", null, "p1", "p1", null, "p2"],
      },
    ]);
    const withLet = points.map((p) =>
      p.id === UUID(6)
        ? { ...p, winner: "p2" as const, ending: "let_replayed" as const }
        : p,
    );
    expect(ids(gameOverflow(withLet, true)[0].leftovers)).toEqual([
      UUID(6),
      UUID(7),
    ]);
  });

  test("a tiebreak never overflows, and a tombstone is neither counted nor a leftover", () => {
    const tiebreak = match([
      {
        game: 13,
        server: "p1",
        type: "tiebreak",
        winners: Array<LabelSide>(12).fill("p1"),
      },
    ]);
    expect(gameOverflow(tiebreak, true)).toEqual([]);
    const points = usersCase().map((p) =>
      p.id === UUID(7) ? { ...p, status: "deleted" as const } : p,
    );
    expect(ids(gameOverflow(points, true)[0].leftovers)).toEqual([UUID(8)]);
    expect([...leftoverIds(points, true)]).toEqual([UUID(8)]);
  });
});

// ── The plan ───────────────────────────────────────────────────────────────

test.describe("planGameShift", () => {
  test("one game: the two leftovers open game 2 with its set, game, server and type, and the scores read from 0–0", () => {
    for (const adScoring of [true, false]) {
      const points = usersCase();
      const plan = planGameShift(points, adScoring, UUID(7));
      if ("error" in plan) throw new Error(plan.error);
      expect(plan.writes).toEqual([
        {
          id: UUID(7),
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
        {
          id: UUID(8),
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
      ]);
      expect(plan.summary).toEqual({
        points: 2,
        games: 1,
        nextGame: { set: 1, gameInSet: 2 },
        swapped: 0,
      });
      // No strokes to read: the server moves, nobody's players do.
      expect(plan.shots).toEqual([]);

      const after = applyGameShift(points, plan.writes);
      // Only game membership changed: the order and every index stand.
      expect(after.map((p) => p.pointIndex)).toEqual(
        points.map((p) => p.pointIndex),
      );
      expect(after.map((p) => p.winner)).toEqual(points.map((p) => p.winner));
      const scores = labelScores(after, adScoring).points;
      expect(scores.get(UUID(7))?.scoreBefore).toBe("0–0");
      expect(scores.get(UUID(8))?.scoreBefore).toBe("0–15");
      expect(scores.get(UUID(9))?.scoreBefore).toBe("0–30");
      expect(scores.get(UUID(12))?.scoreBefore).toBe("40–30");
      expect(gameOverflow(after, adScoring)).toEqual([]);
    }
  });

  test("the cascade: a game that runs over once the moved points sit in front passes its own leftovers on", () => {
    const points = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1", "p1", "p1"] },
      { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 3, server: "p2", winners: ["p1", "p1", "p1", "p1"] },
      { game: 4, server: "p1", winners: ["p2", "p2", "p2", "p2"] },
    ]);
    const plan = planGameShift(points, true, UUID(6));
    if ("error" in plan) throw new Error(plan.error);
    const where = (write: GameShiftWrite) =>
      [write.id, write.game_number, write.server] as const;
    expect(plan.writes.map(where)).toEqual([
      // Game 1's last two open game 2 (Lee serving) …
      [UUID(5), 2, "p1"],
      [UUID(6), 2, "p1"],
      // … which is then won two rows early: its last two open game 3 …
      [UUID(9), 3, "p2"],
      [UUID(10), 3, "p2"],
      // … and the same again into game 4, which the move does not overrun.
      [UUID(13), 4, "p1"],
      [UUID(14), 4, "p1"],
    ]);
    expect(plan.summary).toEqual({
      points: 6,
      games: 3,
      nextGame: { set: 1, gameInSet: 2 },
      swapped: 0,
    });
    expect(gameOverflow(applyGameShift(points, plan.writes), true)).toEqual([]);
  });

  test("players switch on exactly the moved points whose strokes contradict their new server", () => {
    // The cascade above with game 1's leftovers Vargas's, and a serve on
    // four of the six moved points. The vendor read games 1 and 3 right and
    // game 2 wrong: points 5 and 6 (game 1, Vargas serving) were served by
    // Vargas and move under Lee — they switch, and with them who won;
    // points 9 and 10 (game 2, Lee serving) show VARGAS serving, which is
    // what game 3 has — they take the server alone; points 13 and 14 have
    // no strokes — the server alone.
    const serve = (id: string, hitter: LabelSide): LabelShot => ({
      id,
      labelPointId: "",
      eventId: 1,
      afterEventId: null,
      status: "kept",
      statusBeforeDelete: null,
      deleteReason: null,
      hitter,
      stroke: "first_serve",
      result: "in",
      spin: null,
      contactX: null,
      contactY: null,
      landingX: null,
      landingY: null,
      videoTime: 1,
      siteRemoval: null,
      siteRemovalRestoredAt: null,
      seed: {
        hitter,
        stroke: "first_serve",
        result: "in",
        spin: null,
        contact_x: null,
        contact_y: null,
        landing_x: null,
        landing_y: null,
        video_time: 1,
      },
    });
    const served: Record<string, LabelSide> = {
      [UUID(5)]: "p2",
      [UUID(6)]: "p2",
      [UUID(9)]: "p2",
      [UUID(10)]: "p2",
    };
    const points = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1", "p2", "p2"] },
      { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 3, server: "p2", winners: ["p1", "p1", "p1", "p1"] },
      { game: 4, server: "p1", winners: ["p2", "p2", "p2", "p2"] },
    ]).map((p) =>
      served[p.id]
        ? { ...p, shots: [serve(`serve-${p.pointIndex + 1}`, served[p.id])] }
        : p,
    );
    const plan = planGameShift(points, true, UUID(6));
    if ("error" in plan) throw new Error(plan.error);
    expect(
      plan.writes.map((w) => [
        w.id,
        w.game_number,
        w.server,
        "winner" in w ? w.winner : "-",
        "ended_by" in w ? w.ended_by : "-",
      ]),
    ).toEqual([
      [UUID(5), 2, "p1", "p1", null],
      [UUID(6), 2, "p1", "p1", null],
      [UUID(9), 3, "p2", "-", "-"],
      [UUID(10), 3, "p2", "-", "-"],
      [UUID(13), 4, "p1", "-", "-"],
      [UUID(14), 4, "p1", "-", "-"],
    ]);
    expect(plan.shots).toEqual([
      {
        id: "serve-5",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
      },
      {
        id: "serve-6",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
      },
    ]);
    expect(plan.summary).toEqual({
      points: 6,
      games: 3,
      nextGame: { set: 1, gameInSet: 2 },
      swapped: 2,
    });
    // The cascade reads the flipped winners: with 5 and 6 now Lee's, game 2
    // is decided two rows early (Lee 4–0), and the rows past it move on.
    // Had they stayed Vargas's, game 2 would have ended on its last row and
    // the cascade with it — the swap is part of the score it reads.
    const after = applyGameShift(points, plan.writes);
    expect(after.find((p) => p.id === UUID(5))).toMatchObject({
      winner: "p1",
      endedBy: null,
      server: "p1",
      status: "edited",
    });
    expect(gameOverflow(after, true)).toEqual([]);
  });

  test("no game after: the leftovers open a new one, same set, the next number, the other side serving", () => {
    const points = usersCase().slice(0, 8);
    const plan = planGameShift(points, true, UUID(8));
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.writes).toEqual([
      {
        id: UUID(7),
        set_number: 1,
        game_number: 2,
        server: "p1",
        game_type: "game",
        status: "edited",
      },
      {
        id: UUID(8),
        set_number: 1,
        game_number: 2,
        server: "p1",
        game_type: "game",
        status: "edited",
      },
    ]);
    expect(plan.summary).toMatchObject({
      games: 1,
      nextGame: { set: 1, gameInSet: 2 },
      swapped: 0,
    });
    // The number is the session's highest plus one — a later set's included.
    const later = [
      ...points,
      ...match([{ set: 2, game: 7, server: "p1", winners: ["p1"] }]).map(
        (p) => ({ ...p, id: "later", pointIndex: 0 }),
      ),
    ];
    // That set-2 point sits BEFORE the leftovers in point order, so nothing
    // follows them and a new game opens in set 1 — numbered past game 7.
    const second = planGameShift(later, true, UUID(8));
    if ("error" in second) throw new Error(second.error);
    expect(second.writes.map((w) => [w.set_number, w.game_number])).toEqual([
      [1, 8],
      [1, 8],
    ]);
  });

  test("the cascade stops at a tiebreak: it takes the points, its first server, and is never split", () => {
    const points = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1", "p1", "p1"] },
      {
        game: 2,
        server: "p1",
        type: "tiebreak",
        winners: ["p1", "p1", "p1", "p1", "p1", "p1", "p1"],
      },
      { game: 3, server: "p2", winners: ["p2", "p2"] },
    ]);
    const plan = planGameShift(points, true, UUID(5));
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.writes).toEqual([
      {
        id: UUID(5),
        set_number: 1,
        game_number: 2,
        server: "p1",
        game_type: "tiebreak",
        status: "edited",
      },
      {
        id: UUID(6),
        set_number: 1,
        game_number: 2,
        server: "p1",
        game_type: "tiebreak",
        status: "edited",
      },
    ]);
    expect(plan.summary.games).toBe(1);
  });

  test("refused from a point inside its game, a tombstone or a stranger", () => {
    const points = usersCase();
    expect(planGameShift(points, true, UUID(6))).toEqual({
      error: "That point sits inside its game — there is nothing to move on.",
    });
    expect(planGameShift(points, true, UUID(9))).toMatchObject({
      error: expect.stringContaining("nothing to move on"),
    });
    const deleted = points.map((p) =>
      p.id === UUID(7) ? { ...p, status: "deleted" as const } : p,
    );
    expect(planGameShift(deleted, true, UUID(7))).toEqual({
      error: "Restore this point before moving it.",
    });
    expect(planGameShift(points, true, "nope")).toEqual({
      error: "That point is not a point of this session.",
    });
  });

  test("status is a move's: edited away from the seed, unchanged back into it, added stays added", () => {
    // Game 2's first two points were earlier moved into game 1 by hand
    // (seeded in game 2, Lee serving): game 1 now runs over by exactly them.
    const points = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1"] },
      { game: 2, server: "p1", winners: ["p2", "p1", "p1", "p1", "p1"] },
    ]).map((p) =>
      p.id === UUID(5) || p.id === UUID(6)
        ? {
            ...p,
            gameNumber: 1,
            server: "p2" as const,
            status: "edited" as const,
          }
        : p.id === UUID(7)
          ? {
              ...p,
              gameNumber: 1,
              server: "p2" as const,
              status: "added" as const,
              seed: null,
            }
          : p,
    );
    const plan = planGameShift(points, true, UUID(5));
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.writes.map((w) => [w.id, w.game_number, w.status])).toEqual([
      [UUID(5), 2, "unchanged"],
      [UUID(6), 2, "unchanged"],
      [UUID(7), 2, "added"],
    ]);
  });
});

// ── The service ────────────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  /** `.in(column, values)`, as the writes name their rows. */
  in?: Record<string, readonly unknown[]>;
}

function rowsOf(points: readonly LabelPoint[]) {
  return points.map((p) => ({
    id: p.id,
    point_index: p.pointIndex,
    status: p.status,
    set_number: p.setNumber,
    game_number: p.gameNumber,
    server: p.server,
    serve_side: p.serveSide,
    winner: p.winner,
    ending: p.ending,
    ended_by: p.endedBy,
    game_type: p.gameType,
    seed: p.seed,
  }));
}

function fakeClient(rows: {
  session?: Record<string, unknown> | null;
  job?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  /** The moved points' shot rows, when the shift asks for them. */
  shots?: Record<string, unknown>[];
  failUpdate?: string;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          if (
            rows.failUpdate &&
            (call.filters.id === rows.failUpdate ||
              call.in?.id?.includes(rows.failUpdate))
          ) {
            return { data: null, error: { message: "boom" } };
          }
          return { data: [{ id: call.filters.id }], error: null };
        }
        if (table === "label_sessions") {
          return {
            data:
              rows.session === undefined
                ? {
                    status: "labelling",
                    marks_enabled: true,
                    ad_scoring: true,
                    job_id: JOB_ID,
                  }
                : rows.session,
            error: null,
          };
        }
        if (table === "processing_jobs") {
          return { data: rows.job ?? null, error: null };
        }
        if (table === "label_points") {
          return { data: rows.points ?? rowsOf(usersCase()), error: null };
        }
        if (table === "label_shots") {
          return { data: rows.shots ?? [], error: null };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        returns: () => builder,
        /** One page of a `readAllPages` read: the fake holds under a page. */
        range: () => Promise.resolve(answer()),
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        in: (column: string, values: readonly unknown[]) => {
          call.in = { ...call.in, [column]: values };
          return builder;
        },
        maybeSingle: async () => answer(),
        single: async () => answer(),
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

const writes = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op !== "select");

test.describe("writeLabelGameShift", () => {
  test("the gate and the scoring in one read, the points, the moved points' shots, then one update per destination by id list — label_points only when nothing switches players", async () => {
    const fake = fakeClient({});
    const result = await writeLabelGameShift({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      fromPointId: UUID(7),
    });
    expect(result).toMatchObject({
      ok: true,
      writes: [expect.anything(), expect.anything()],
      shots: [],
    });
    // The moved points change server (Vargas's game 1 → Lee's game 2), so
    // the session's shots are read — and found empty: nobody's players
    // switch.
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
    ]);
    expect(fake.calls.find((c) => c.table === "label_shots")?.filters).toEqual({
      session_id: SESSION_ID,
    });
    // Both go to the same game with the same server: one write names both.
    expect(writes(fake).map((c) => c.in)).toEqual([{ id: [UUID(7), UUID(8)] }]);
    for (const call of writes(fake)) {
      expect(Object.keys(call.values ?? {}).sort()).toEqual([
        "game_number",
        "game_type",
        "server",
        "set_number",
        "status",
      ]);
      expect(call.values).toMatchObject({
        set_number: 1,
        game_number: 2,
        server: "p1",
        game_type: "game",
        status: "edited",
      });
    }
  });

  test("a shift that changes no server never reads a shot", async () => {
    // Both games Lee's: the leftovers keep their server.
    const sameServer = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1", "p1"] },
      { game: 2, server: "p1", winners: ["p2", "p2"] },
    ]);
    const fake = fakeClient({ points: rowsOf(sameServer) });
    expect(
      await writeLabelGameShift({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(5),
      }),
    ).toMatchObject({ ok: true, shots: [] });
    expect(fake.calls.map((c) => c.table)).not.toContain("label_shots");
  });

  test("moved points whose strokes contradict their new server: the points' writes carry the flipped winner, then the strokes in grouped writes — label_points and label_shots", async () => {
    const shotRow = (id: string, pointId: string, hitter: LabelSide) => ({
      id,
      label_point_id: pointId,
      event_id: 1,
      after_event_id: null,
      status: "kept",
      status_before_delete: null,
      delete_reason: null,
      hitter,
      stroke: "first_serve",
      result: "in",
      spin: null,
      contact_x: null,
      contact_y: null,
      landing_x: null,
      landing_y: null,
      video_time: 1,
      site_removal: null,
      site_removal_restored_at: null,
      seed: {
        hitter,
        stroke: "first_serve",
        result: "in",
        spin: null,
        contact_x: null,
        contact_y: null,
        landing_x: null,
        landing_y: null,
        video_time: 1,
      },
    });
    // The user's case: game 1 is Vargas's, game 2 Lee's. Point 7 was
    // served by Vargas (it switches, and Lee won it); point 8 already shows
    // Lee serving. With point 7 now Lee's, game 2 is won a row early and
    // its last row — point 12, which the first plan never reached — opens
    // game 3, Vargas's.
    const fake = fakeClient({
      shots: [shotRow("s-7", UUID(7), "p2"), shotRow("s-8", UUID(8), "p1")],
    });
    const result = await writeLabelGameShift({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      fromPointId: UUID(7),
    });
    expect(result).toEqual({
      ok: true,
      writes: [
        {
          id: UUID(7),
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
          winner: "p1",
          ended_by: null,
        },
        {
          id: UUID(8),
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
        {
          id: UUID(12),
          set_number: 1,
          game_number: 3,
          server: "p2",
          game_type: "game",
          status: "edited",
        },
      ],
      shots: [
        {
          id: "s-7",
          hitter: "p1",
          status: "edited",
          status_before_delete: null,
        },
      ],
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_shots", "update"],
    ]);
    // The point that switches, the one that does not and the one moved on
    // are three groups; the flipped stroke is written after them, by id
    // list.
    expect(writes(fake).map((c) => [c.table, c.values, c.in])).toEqual([
      [
        "label_points",
        {
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
          winner: "p1",
          ended_by: null,
        },
        { id: [UUID(7)] },
      ],
      [
        "label_points",
        {
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
        { id: [UUID(8)] },
      ],
      [
        "label_points",
        {
          set_number: 1,
          game_number: 3,
          server: "p2",
          game_type: "game",
          status: "edited",
        },
        { id: [UUID(12)] },
      ],
      [
        "label_shots",
        { hitter: "p1", status: "edited", status_before_delete: null },
        { id: ["s-7"] },
      ],
    ]);

    // Two points switching the same way, with a stroke each flipped the
    // same way: one write for the points, one for the strokes — and, both
    // now Lee's, game 2 is won two rows early, so its last two move on in
    // a write of their own.
    const both = fakeClient({
      shots: [shotRow("s-7", UUID(7), "p2"), shotRow("s-8", UUID(8), "p2")],
    });
    await writeLabelGameShift({
      supabase: both.supabase,
      sessionId: SESSION_ID,
      fromPointId: UUID(7),
    });
    expect(writes(both).map((c) => [c.table, c.in])).toEqual([
      ["label_points", { id: [UUID(7), UUID(8)] }],
      ["label_points", { id: [UUID(11), UUID(12)] }],
      ["label_shots", { id: ["s-7", "s-8"] }],
    ]);
  });

  test("ad scoring is the session's, else the job's, else true", async () => {
    // A game through 40–40: without ad the eighth row is a leftover, with
    // ad it is the deciding one.
    const deuce = match([
      {
        game: 1,
        server: "p1",
        winners: ["p1", "p2", "p1", "p2", "p1", "p2", "p1", "p1", "p2"],
      },
      { game: 2, server: "p2", winners: ["p1"] },
    ]);
    // The session says no-ad: the job is not read.
    const noAd = fakeClient({
      session: { status: "labelling", ad_scoring: false, job_id: JOB_ID },
      job: { ad_scoring: true },
      points: rowsOf(deuce),
    });
    expect(
      await writeLabelGameShift({
        supabase: noAd.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(8),
      }),
    ).toMatchObject({
      ok: true,
      writes: [expect.anything(), expect.anything()],
    });
    expect(noAd.calls.map((c) => c.table)).not.toContain("processing_jobs");

    // The session has not said: the job's answer stands.
    const fromJob = fakeClient({
      session: { status: "labelling", ad_scoring: null, job_id: JOB_ID },
      job: { ad_scoring: false },
      points: rowsOf(deuce),
    });
    expect(
      await writeLabelGameShift({
        supabase: fromJob.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(8),
      }),
    ).toMatchObject({
      ok: true,
      writes: [expect.anything(), expect.anything()],
    });
    expect(fromJob.calls.map((c) => c.table)).toContain("processing_jobs");
    expect(
      fromJob.calls.find((c) => c.table === "processing_jobs")?.filters,
    ).toEqual({ id: JOB_ID });

    // Neither: ad scoring, under which the eighth row decides the game.
    expect(
      await writeLabelGameShift({
        supabase: fakeClient({
          session: { status: "labelling", ad_scoring: null, job_id: null },
          points: rowsOf(deuce),
        }).supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(8),
      }),
    ).toMatchObject({ error: expect.stringContaining("nothing to move on") });
  });

  test("a complete session is refused before any read of its points; one labelled without marks is not", async () => {
    const complete = fakeClient({
      session: { status: "complete", ad_scoring: true, job_id: null },
    });
    expect(
      await writeLabelGameShift({
        supabase: complete.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(complete.calls.map((c) => c.table)).toEqual(["label_sessions"]);

    const blind = fakeClient({
      session: {
        status: "labelling",
        marks_enabled: false,
        ad_scoring: true,
        job_id: null,
      },
    });
    expect(
      await writeLabelGameShift({
        supabase: blind.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toMatchObject({ ok: true });
    expect(writes(blind)).toHaveLength(1);
  });

  test("a bad id, a point inside its game and a failed write each stop the run", async () => {
    const fake = fakeClient({});
    expect(
      await writeLabelGameShift({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        fromPointId: "nope",
      }),
    ).toEqual({ error: "Invalid point id." });
    expect(fake.calls).toEqual([]);

    const inside = fakeClient({});
    expect(
      await writeLabelGameShift({
        supabase: inside.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(6),
      }),
    ).toMatchObject({ error: expect.stringContaining("nothing to move on") });
    expect(writes(inside)).toEqual([]);

    const failed = fakeClient({ failUpdate: UUID(7) });
    expect(
      await writeLabelGameShift({
        supabase: failed.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toEqual({ error: "Could not move the points: boom" });
    expect(writes(failed)).toHaveLength(1);
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    expect(
      await shiftLabelGameOverflow(SESSION_ID, UUID(7), {
        requireAdmin: async () => null,
        createAdminClient: () => {
          built += 1;
          return fakeClient({}).supabase;
        },
      }),
    ).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({});
    expect(
      await shiftLabelGameOverflow(SESSION_ID, UUID(7), {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true });
  });
});

// ── The black rail ─────────────────────────────────────────────────────────

type ConsoleProps = {
  session: LabelSession;
  video: null;
  marks?: null;
  initialLayoutMode?: "black";
  initialExpandedPointId?: string | null;
  operations?: Record<string, unknown>;
  onSaveShot?: () => Promise<unknown>;
  onSavePoint?: () => Promise<unknown>;
};

function renderConsole(props: ConsoleProps): string {
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<ConsoleProps>;
  };
  return renderToStaticMarkup(React.createElement(LabelConsole, props));
}

/** Every console operation, counting the calls a render makes of it. */
function countingOperations() {
  const called: string[] = [];
  const operations = Object.fromEntries(
    [
      "deleteShot",
      "restoreShot",
      "deletePoint",
      "restorePoint",
      "addShot",
      "movePoint",
      "setChecked",
      "resetShot",
      "resetPoint",
      "setGameServer",
      "setGameType",
      "restoreSiteRemoval",
      "dismissSuggestion",
      "insertPoint",
      "shiftGameOverflow",
    ].map((name) => [
      name,
      async () => {
        called.push(name);
        return { error: "not in a render" };
      },
    ]),
  );
  return { called, operations };
}

const SAVES = {
  onSaveShot: async () => ({ ok: true, status: "edited" }),
  onSavePoint: async () => ({ ok: true, status: "edited" }),
};

/** The fixture session carrying `points`, labelled with or without marks. */
function sessionWith(
  points: LabelPoint[],
  fields: Partial<LabelSession> = {},
): LabelSession {
  return { ...labelSessionFixture(), points, ...fields };
}

function black(
  session: LabelSession,
  operations: Record<string, unknown> = countingOperations().operations,
): string {
  return renderConsole({
    session,
    video: null,
    marks: null,
    initialLayoutMode: "black",
    initialExpandedPointId: null,
    operations,
    ...SAVES,
  });
}

/** The opening tag carrying `attr`. */
function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The inner text of the element carrying `attr`. */
function inner(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.indexOf(">", at) + 1;
  return html.slice(start, html.indexOf("<", start));
}

/** The slot's markup. */
function slot(html: string): string {
  const at = html.indexOf("data-game-overflow=");
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(start, next);
}

test.describe("the slot on the black rail", () => {
  test("before the first leftover row: arrow, the two lines, one answer — and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const html = black(sessionWith(usersCase()), operations);
    expect(called).toEqual([]);

    const open = tag(html, "data-game-overflow=");
    expect(open).toContain('data-row="game-overflow"');
    expect(open).toContain(`data-game-overflow="${UUID(7)}"`);
    for (const cls of [
      "min-h-[44px]",
      "mx-2",
      "my-0.5",
      "rounded-lg",
      "border-dashed",
      "border-[var(--rail-amber-line)]",
      "bg-[var(--rail-amber-wash-faint)]",
      "grid-cols-[22px_minmax(0,1fr)_auto]",
    ]) {
      expect(open, cls).toContain(cls);
    }
    const row = slot(html);
    expect(row).toContain("lucide-corner-down-right");
    expect(inner(row, "data-game-overflow-title")).toBe(
      "Game 1 is already won",
    );
    expect(inner(row, "data-game-overflow-detail")).toBe(
      "2 points after it belong to the next game",
    );
    expect(inner(row, "data-game-overflow-move")).toBe("Move to game 2");
    expect(tag(row, "data-game-overflow-move")).toContain(
      "text-[var(--rail-amber)]",
    );
    expect(row).not.toContain("Dismiss");
    // The lines give way; the answer never shrinks or wraps.
    for (const attr of [
      "data-game-overflow-title",
      "data-game-overflow-detail",
    ]) {
      expect(tag(row, attr)).toContain("truncate");
    }
    expect(tag(row, "data-game-overflow-move")).toContain("shrink-0");
    expect(tag(row, "data-game-overflow-move")).toContain("whitespace-nowrap");

    // After the deciding row, before the first leftover, and nowhere else.
    const at = html.indexOf("data-game-overflow=");
    expect(html.indexOf(`data-point-id="${UUID(6)}"`)).toBeLessThan(at);
    expect(at).toBeLessThan(html.indexOf(`data-point-id="${UUID(7)}"`));
    expect(html.match(/data-game-overflow=/g)).toHaveLength(1);
  });

  test("one leftover reads in the singular; with marks off the slot still draws", () => {
    const points = usersCase().slice(0, 7);
    const html = black(sessionWith(points, { marksEnabled: false }));
    expect(inner(slot(html), "data-game-overflow-detail")).toBe(
      "1 point after it belongs to the next game",
    );
  });

  test("none when nothing runs over, and none on a session that cannot be written", () => {
    expect(black(labelSessionFixture())).not.toContain("data-game-overflow");
    expect(
      black(sessionWith(usersCase(), { status: "complete" })),
    ).not.toContain("data-game-overflow");
  });

  test("the answer is the console's request from the first leftover, on a click alone; a cascade says how far", () => {
    const { BlackGameOverflow } = createLoader().load(ROW) as {
      BlackGameOverflow: (props: Record<string, unknown>) => React.ReactNode;
    };
    const calls: unknown[][] = [];
    const edit = (points: LabelPoint[], adScoring = true) => ({
      editable: true,
      names: NAMES,
      selectedShotId: null,
      operations: {
        onShiftGameOverflow: (...args: unknown[]) => calls.push(args),
      },
      openTombstoneIds: new Set<string>(),
      points,
      scores: labelScores(points, adScoring).points,
      adScoring,
      playingShotId: null,
    });
    const summaryOf = (rows: LabelPoint[], from: string) => {
      const plan = planGameShift(rows, true, from);
      return "error" in plan ? null : plan.summary;
    };
    const points = usersCase();
    const overflow = gameOverflow(points, true)[0];
    const tree = BlackGameOverflow({
      overflow,
      summary: summaryOf(points, points[6].id),
      point: points[6],
      edit: edit(points),
    });
    expect(calls).toEqual([]);
    const button = findWhere(tree, (p) => "data-game-overflow-move" in p);
    expect(button).not.toBeNull();
    let stopped = 0;
    (button!.props.onClick as (e: unknown) => void)({
      stopPropagation: () => (stopped += 1),
    });
    expect(stopped).toBe(1);
    expect(calls).toEqual([[UUID(7)]]);
    // One game: no tooltip on the button.
    expect(findWhere(tree, (p) => typeof p.detail === "string")).toBeNull();

    const cascade = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1", "p1", "p1"] },
      { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 3, server: "p2", winners: ["p2", "p2", "p2", "p2"] },
    ]);
    const far = BlackGameOverflow({
      overflow: gameOverflow(cascade, true)[0],
      summary: summaryOf(cascade, cascade[4].id),
      point: cascade[4],
      edit: edit(cascade),
    });
    const tooltip = findWhere(far, (p) => typeof p.detail === "string");
    expect(tooltip?.props).toMatchObject({
      label: "Move to game 2",
      detail: "Moves 4 points across 2 games",
    });

    // A moved point whose players switch: the tooltip says so — on its
    // own when one game, beside the cascade's line otherwise.
    const vargasServe = (pointId: string): LabelShot => ({
      id: `serve-${pointId}`,
      labelPointId: pointId,
      eventId: 1,
      afterEventId: null,
      status: "kept",
      statusBeforeDelete: null,
      deleteReason: null,
      hitter: "p2",
      stroke: "first_serve",
      result: "in",
      spin: null,
      contactX: null,
      contactY: null,
      landingX: null,
      landingY: null,
      videoTime: 1,
      siteRemoval: null,
      siteRemovalRestoredAt: null,
      seed: null,
    });
    // Game 1 (Vargas's) runs over by one row, Vargas's point served by
    // Vargas; moved under Lee it switches, and Lee's win does not reopen
    // game 2 — one game.
    const switching = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1", "p2"] },
      { game: 2, server: "p1", winners: ["p2", "p2", "p2", "p2"] },
    ]).map((p) =>
      p.id === UUID(5) ? { ...p, shots: [vargasServe(p.id)] } : p,
    );
    const one = BlackGameOverflow({
      overflow: gameOverflow(switching, true)[0],
      summary: summaryOf(switching, switching[4].id),
      point: switching[4],
      edit: edit(switching),
    });
    expect(
      findWhere(one, (p) => typeof p.detail === "string")?.props,
    ).toMatchObject({
      label: "Move to game 2",
      detail: "Players switch on 1 point",
    });
    // Two of Vargas's served by Vargas, moved under Lee and now Lee's: game
    // 2 is won two rows early, and its last two open game 3.
    const cascadeSwitching = match([
      { game: 1, server: "p2", winners: ["p1", "p1", "p1", "p1", "p2", "p2"] },
      { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 3, server: "p2", winners: ["p2", "p2", "p2", "p2"] },
    ]).map((p) =>
      p.id === UUID(5) || p.id === UUID(6)
        ? { ...p, shots: [vargasServe(p.id)] }
        : p,
    );
    const two = BlackGameOverflow({
      overflow: gameOverflow(cascadeSwitching, true)[0],
      summary: summaryOf(cascadeSwitching, cascadeSwitching[4].id),
      point: cascadeSwitching[4],
      edit: edit(cascadeSwitching),
    });
    expect(
      findWhere(two, (p) => typeof p.detail === "string")?.props,
    ).toMatchObject({
      detail: "Moves 4 points across 2 games · Players switch on 2 points",
    });
  });
});

// ── The light menu ─────────────────────────────────────────────────────────

test.describe("the ⋯ menu", () => {
  test("offers the move only on a leftover point, from that point", () => {
    const { pointMenuActions } = createLoader().load(MENU) as {
      pointMenuActions: (
        point: LabelPoint,
        context: unknown,
        operations: unknown,
      ) => { shiftOverflow: (() => void) | null };
    };
    const calls: unknown[][] = [];
    const operations = {
      onShiftGameOverflow: (...args: unknown[]) => calls.push(args),
      onInsertPoint: () => {},
      onMovePoint: () => {},
      onAskResetPoint: () => {},
      onAskDeletePoint: () => {},
    };
    const points = usersCase();
    const context = { points, names: NAMES, adScoring: true };
    expect(
      pointMenuActions(points[5], context, operations).shiftOverflow,
    ).toBeNull();
    expect(
      pointMenuActions(points[8], context, operations).shiftOverflow,
    ).toBeNull();
    for (const leftover of [points[6], points[7]]) {
      const actions = pointMenuActions(leftover, context, operations);
      expect(actions.shiftOverflow).not.toBeNull();
      actions.shiftOverflow?.();
    }
    expect(calls).toEqual([[UUID(7)], [UUID(8)]]);
    // Without a scoring in the context, ad scoring is assumed.
    expect(
      pointMenuActions(points[6], { points, names: NAMES }, operations)
        .shiftOverflow,
    ).not.toBeNull();
  });
});

/** The first element in `node` whose props satisfy `pred`, through every child. */
function findWhere(
  node: React.ReactNode,
  pred: (props: Record<string, unknown>) => boolean,
): React.ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findWhere(child, pred);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (pred(element.props)) return element;
  for (const child of React.Children.toArray(
    element.props.children as React.ReactNode,
  )) {
    const found = findWhere(child, pred);
    if (found) return found;
  }
  return null;
}
