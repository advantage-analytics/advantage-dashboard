import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { INITIAL_SAVE_STATUS } from "@/components/admin/labels/save-status";
import {
  applyGameShift,
  GAME_PULL_ADD_POINT,
  gameOverflow,
  gameUnderflow,
  leftoverIds,
  planGamePull,
  planGameShift,
  planGameSplit,
  type GameShiftWrite,
} from "@/lib/services/labels/game-shift";
import {
  pullLabelGamePoints,
  shiftLabelGameOverflow,
  writeLabelGamePull,
  writeLabelGameShift,
} from "@/lib/services/labels/game-shift-session";
import {
  lockedGameImbalance,
  lockedGames,
  planGameBoundary,
} from "@/lib/services/labels/game-boundary";
import { gameKey, labelScores } from "@/lib/services/labels/score";
import type {
  LabelGameType,
  LabelPoint,
  LabelSession,
  LabelShot,
  LabelSide,
  LabelStartScore,
} from "@/lib/services/labels/session";
import { inner, tag, text } from "./fixtures/html-probe";
import {
  fakeLabelClient,
  labelPoint,
  labelSessionFixture,
  labelShot,
  labelShotRow,
} from "./fixtures/label-session";
import { findWhere } from "./fixtures/react-tree";
import { createLoader, renderFunction } from "./fixtures/vm-modules";

// "Move the leftover points to the next game": the pure overflow reading and
// cascade plan, the service over a fake client, and the rail's slot and menu.

const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const MENU = "src/components/admin/labels/label-point-menu.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const NAMES = { p1: "Lee", p2: "Vargas" };

/** A point id the service accepts: a uuid carrying its ordinal. */
const UUID = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

const point = (fields: Partial<LabelPoint> & { id: string }) =>
  labelPoint(fields.id, 0, { vendorRallyIds: [], serveSide: null, ...fields });

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
    const serve = (id: string, hitter: LabelSide): LabelShot =>
      labelShot(id, "", {
        eventId: 1,
        hitter,
        stroke: "first_serve",
        result: "in",
        videoTime: 1,
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
        was: "kept",
      },
      {
        id: "serve-6",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
        was: "kept",
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
  match?: Record<string, unknown> | null;
  points?: Record<string, unknown>[];
  /** The moved points' shot rows, when the shift asks for them. */
  shots?: Record<string, unknown>[];
  failUpdate?: string;
  /** Ids a grouped compare-and-set leaves out: changed in another tab since the read. */
  racedIds?: string[];
}) {
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      const failed =
        rows.failUpdate &&
        (call.filters.id === rows.failUpdate ||
          call.in?.id?.includes(rows.failUpdate));
      if (failed) return { data: null, error: { message: "boom" } };
      const raced = rows.racedIds ?? [];
      const ids = call.in?.id ?? [call.filters.id];
      return {
        data: ids
          .filter((id) => !raced.includes(id as string))
          .map((id) => ({ id })),
        error: null,
      };
    }
    if (call.table === "label_sessions") {
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
    if (call.table === "processing_jobs") {
      return { data: rows.job ?? null, error: null };
    }
    if (call.table === "matches") {
      return { data: rows.match ?? null, error: null };
    }
    if (call.table === "label_points") {
      return { data: rows.points ?? rowsOf(usersCase()), error: null };
    }
    if (call.table === "label_shots") {
      return { data: rows.shots ?? [], error: null };
    }
    return undefined;
  });
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

  test("the match row is read once, score beside format, and the shift plans with the record's match-tiebreak set as the console does", async () => {
    // Best of 1 puts the deciding set at set 1 — the fixture's — and the
    // record spells it as a match tiebreak: 1–0 games with its points.
    const fake = fakeClient({
      session: {
        status: "labelling",
        ad_scoring: true,
        job_id: JOB_ID,
        match_id: MATCH_ID,
      },
      match: {
        score: {
          player1: [1],
          player2: [0],
          player1_tiebreaks: [10],
          player2_tiebreaks: [7],
        },
        format: { best_of: 1 },
      },
    });
    // Its vendor-cut games are left alone: nothing in the set is a leftover.
    expect(
      await writeLabelGameShift({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toEqual({
      error: "That point sits inside its game — there is nothing to move on.",
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["matches", "select"],
    ]);
    expect(fake.calls.find((c) => c.table === "matches")?.filters).toEqual({
      id: MATCH_ID,
    });
    // The same 1–0 with no tiebreak points is a retirement: an ordinary set,
    // and the shift goes ahead.
    const retired = fakeClient({
      session: {
        status: "labelling",
        ad_scoring: true,
        job_id: JOB_ID,
        match_id: MATCH_ID,
      },
      match: { score: { player1: [1], player2: [0] }, format: { best_of: 1 } },
    });
    expect(
      await writeLabelGameShift({
        supabase: retired.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toMatchObject({
      ok: true,
      writes: [expect.anything(), expect.anything()],
    });
  });

  test("moved points whose strokes contradict their new server: the points' writes carry the flipped winner, then the strokes in grouped writes — label_points and label_shots", async () => {
    const shotRow = (id: string, pointId: string, hitter: LabelSide) =>
      labelShotRow(id, pointId, {
        hitter,
        stroke: "first_serve",
        video_time: 1,
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
          was: "kept",
        },
      ],
    });
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
  });

  test("a switched point whose winner is blank never shares a group with an unswitched one: a column left out is keyed apart from one set to null", async () => {
    // Point 7 switches with its winner still blank — its write carries
    // `winner: null` — and point 8 moves beside it with no winner column at
    // all. One UPDATE for both would null point 8's winner.
    const fake = fakeClient({
      points: rowsOf(
        usersCase().map((p) =>
          p.id === UUID(7) ? { ...p, winner: null, ending: null } : p,
        ),
      ),
      shots: [
        labelShotRow("s-7", UUID(7), {
          hitter: "p2",
          stroke: "first_serve",
          video_time: 1,
        }),
      ],
    });
    const result = await writeLabelGameShift({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      fromPointId: UUID(7),
    });
    expect(result).toMatchObject({ ok: true });
    const points = writes(fake).filter((c) => c.table === "label_points");
    expect(points.map((c) => [c.values, c.in, c.filters])).toEqual([
      [
        {
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
          winner: null,
          ended_by: null,
        },
        { id: [UUID(7)] },
        { status: "unchanged" },
      ],
      [
        {
          set_number: 1,
          game_number: 2,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
        { id: [UUID(8)] },
        { status: "unchanged" },
      ],
    ]);
  });

  test("each group is compare-and-set on the status its points were read with: a point changed in another tab stops the run with the raced message, the groups before it landed", async () => {
    // The three-group cascade above, with point 12 — the last group —
    // tombstoned by another tab between the read and the write.
    const fake = fakeClient({
      shots: [
        labelShotRow("s-7", UUID(7), {
          hitter: "p2",
          stroke: "first_serve",
          video_time: 1,
        }),
      ],
      racedIds: [UUID(12)],
    });
    expect(
      await writeLabelGameShift({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });
    // Points 7 and 8 were written; point 12's group matched nothing, and
    // the flipped stroke was never reached.
    expect(writes(fake).map((c) => [c.table, c.in, c.filters])).toEqual([
      ["label_points", { id: [UUID(7)] }, { status: "unchanged" }],
      ["label_points", { id: [UUID(8)] }, { status: "unchanged" }],
      ["label_points", { id: [UUID(12)] }, { status: "unchanged" }],
    ]);
    // Two points written the same way but read with different statuses are
    // two groups, each compare-and-set on its own.
    const mixed = fakeClient({
      points: rowsOf(
        usersCase().map((p) =>
          p.id === UUID(8) ? { ...p, status: "edited" as const } : p,
        ),
      ),
    });
    expect(
      await writeLabelGameShift({
        supabase: mixed.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(7),
      }),
    ).toMatchObject({ ok: true });
    expect(writes(mixed).map((c) => [c.in, c.filters])).toEqual([
      [{ id: [UUID(7)] }, { status: "unchanged" }],
      [{ id: [UUID(8)] }, { status: "edited" }],
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

    // Neither: the match's format stands in — no-ad here, read by the
    // session's match id.
    const fromMatch = fakeClient({
      session: {
        status: "labelling",
        ad_scoring: null,
        job_id: JOB_ID,
        match_id: MATCH_ID,
      },
      job: { ad_scoring: null },
      match: { format: { ad_scoring: false } },
      points: rowsOf(deuce),
    });
    expect(
      await writeLabelGameShift({
        supabase: fromMatch.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(8),
      }),
    ).toMatchObject({
      ok: true,
      writes: [expect.anything(), expect.anything()],
    });
    expect(fromMatch.calls.find((c) => c.table === "matches")?.filters).toEqual(
      { id: MATCH_ID },
    );
    // A session with no match id has no format to read.
    expect(fromJob.calls.map((c) => c.table)).not.toContain("matches");

    // The job says no-ad and the match says ad: the format is read beside
    // the job's, and the job wins (PR #297).
    const jobWins = fakeClient({
      session: {
        status: "labelling",
        ad_scoring: null,
        job_id: JOB_ID,
        match_id: MATCH_ID,
      },
      job: { ad_scoring: false },
      match: { format: { ad_scoring: true } },
      points: rowsOf(deuce),
    });
    expect(
      await writeLabelGameShift({
        supabase: jobWins.supabase,
        sessionId: SESSION_ID,
        fromPointId: UUID(8),
      }),
    ).toMatchObject({
      ok: true,
      writes: [expect.anything(), expect.anything()],
    });
    expect(jobWins.calls.map((c) => c.table)).toContain("matches");
    // The session said: neither is read.
    expect(noAd.calls.map((c) => c.table)).not.toContain("matches");

    // None of them: ad scoring, under which the eighth row decides the game.
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

/** The slot's markup. */
function slot(html: string): string {
  const at = html.indexOf("data-game-overflow=");
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(start, next);
}

test.describe("the slot on the black rail", () => {
  test("before the first leftover row: the two lines, one answer — and a render writes nothing", () => {
    const { called, operations } = countingOperations();
    const html = black(sessionWith(usersCase()), operations);
    expect(called).toEqual([]);

    expect(tag(html, "data-game-overflow=")).toContain(
      `data-game-overflow="${UUID(7)}"`,
    );
    const row = slot(html);
    expect(inner(row, "data-game-overflow-title")).toBe(
      "Game 1 is already won",
    );
    expect(inner(row, "data-game-overflow-detail")).toBe(
      "2 points after it belong to the next game",
    );
    expect(inner(row, "data-game-overflow-move")).toBe("Move to game 2");
    expect(row).not.toContain("Dismiss");

    // After the deciding row, before the first leftover, and nowhere else.
    const at = html.indexOf("data-game-overflow=");
    expect(html.indexOf(`data-point-id="${UUID(6)}"`)).toBeLessThan(at);
    expect(at).toBeLessThan(html.indexOf(`data-point-id="${UUID(7)}"`));
    expect(html.match(/data-game-overflow=/g)).toHaveLength(1);
  });

  test("none when nothing runs over, and none on a session that cannot be written", () => {
    expect(black(labelSessionFixture())).not.toContain("data-game-overflow");
    expect(
      black(sessionWith(usersCase(), { status: "complete" })),
    ).not.toContain("data-game-overflow");
  });

  test("the answer is the console's request from the first leftover, on a click alone; a cascade says how far", () => {
    const BlackGameOverflow = renderFunction<Record<string, unknown>>(
      createLoader().load(ROW).BlackGameOverflow,
    );
    const calls: unknown[][] = [];
    const edit = (points: LabelPoint[], adScoring = true) => ({
      editable: true,
      names: NAMES,
      selectedShotId: null,
      operations: {
        onShiftGameOverflow: (...args: unknown[]) => calls.push(args),
      },
      points,
      scores: labelScores(points, adScoring).points,
      adScoring,
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

// ── A game that ends short ─────────────────────────────────────────────────

/**
 * The real case, in miniature: no-ad scoring, game 1 (Lee serving) stops at
 * 30–40 and its deciding point sits at the top of game 2 (Vargas's), which
 * reads "Game–0" with one row to spare. Pulling that row in settles game 1
 * for Vargas and leaves game 2 settled on its last row.
 */
function shortCase(): LabelPoint[] {
  return match([
    { game: 1, server: "p1", winners: ["p1", "p1", "p2", "p2", "p2"] },
    { game: 2, server: "p2", winners: ["p2", "p2", "p2", "p2", "p2"] },
  ]);
}

const KEY = "1·1";

test.describe("gameUnderflow", () => {
  test("an ordinary game with a counted point left short, with its call and its last row — never the last game of a set", () => {
    expect(gameUnderflow(shortCase(), false)).toEqual([
      {
        setNumber: 1,
        gameNumber: 1,
        gameInSet: 1,
        score: "30–40",
        rows: shortCase().slice(0, 5),
        lastPointId: UUID(5),
      },
    ]);
    // Under ad scoring 30–40 is short just the same; a settled game is not.
    expect(gameUnderflow(shortCase(), true).map((g) => gameKey(g))).toEqual([
      KEY,
    ]);
    expect(gameUnderflow(usersCase(), true)).toEqual([]);
    // The last game of set 1 is short, but set 2 follows: not listed. A
    // tiebreak and a game of nothing but a blank winner are not either.
    const sets = match([
      { set: 1, game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { set: 1, game: 2, server: "p2", winners: ["p2", "p2"] },
      {
        set: 2,
        game: 3,
        server: "p1",
        winners: ["p1", "p1"],
        type: "tiebreak",
      },
      { set: 2, game: 4, server: "p2", winners: [null] },
      { set: 2, game: 5, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
    ]);
    expect(gameUnderflow(sets, true)).toEqual([]);
  });

  test("the session's last game is never listed: the rail reads it as still being played, whatever the labeller has said of the video", () => {
    const tail = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 2, server: "p2", winners: ["p2", "p2", "p1"] },
    ]);
    expect(gameUnderflow(tail, true)).toEqual([]);
    // The rail's band hides "Unfinished" on that same game; the two agree.
    const { bandOutcomeShown } = createLoader().load(
      "src/components/admin/labels/label-black-rail.tsx",
    ) as {
      bandOutcomeShown: (band: unknown, games: unknown[]) => boolean;
    };
    const { games } = labelScores(tail, true);
    expect(bandOutcomeShown(games[1], games)).toBe(false);
    expect(bandOutcomeShown(games[0], games)).toBe(true);
  });
});

test.describe("planGamePull", () => {
  test("one row from the next game, under the short game's server, settles it; the donor stays settled — one write", () => {
    const points = shortCase();
    const plan = planGamePull(points, KEY, false);
    expect(plan).toEqual({
      ok: true,
      writes: [
        {
          id: UUID(6),
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
      ],
      shots: [],
      summary: {
        points: 1,
        games: 1,
        fromGame: { set: 1, gameInSet: 2 },
        swapped: 0,
      },
    });
    if (!("ok" in plan)) return;
    const after = labelScores(applyGameShift(points, plan.writes), false).games;
    expect(after.map((g) => g.outcome)).toEqual([
      { kind: "decided", winner: "p2", score: "4–2" },
      { kind: "decided", winner: "p2", score: "4–0" },
    ]);
    // The input is read, never written.
    expect(points).toEqual(shortCase());
  });

  test("the donor left short pulls from its own next game in turn; a third game is too far — add a point instead", () => {
    // Game 1 needs one row; game 2 then has one point and takes four from
    // game 3, which keeps one and would need game 4: three games deep.
    const deep = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p2", "p2", "p2"] },
      { game: 2, server: "p2", winners: ["p2", "p1"] },
      { game: 3, server: "p1", winners: ["p2", "p2", "p2", "p2", "p2"] },
      { game: 4, server: "p2", winners: ["p1", "p1", "p1", "p1"] },
    ]);
    expect(planGamePull(deep, KEY, false)).toEqual({ kind: "add_point" });

    // With game 3 given whole, the cascade ends at two games.
    const two = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p2", "p2", "p2"] },
      { game: 2, server: "p2", winners: ["p2", "p1"] },
      { game: 3, server: "p1", winners: ["p2", "p2", "p2", "p2"] },
      { game: 4, server: "p2", winners: ["p1", "p1", "p1", "p1"] },
    ]);
    const plan = planGamePull(two, KEY, false);
    expect(plan).toMatchObject({
      ok: true,
      summary: {
        points: 5,
        games: 2,
        fromGame: { set: 1, gameInSet: 2 },
        swapped: 0,
      },
    });
    if (!("ok" in plan)) return;
    expect(plan.writes.map((w) => [w.id, w.game_number, w.server])).toEqual([
      [UUID(6), 1, "p1"],
      [UUID(8), 2, "p2"],
      [UUID(9), 2, "p2"],
      [UUID(10), 2, "p2"],
      [UUID(11), 2, "p2"],
    ]);
    const after = labelScores(applyGameShift(two, plan.writes), false).games;
    expect(after.map((g) => [g.gameInSet, g.outcome.kind])).toEqual([
      [1, "decided"],
      [2, "decided"],
      [3, "decided"],
    ]);
  });

  test("a donor that runs out, a tiebreak after, or nothing after: add a point", () => {
    // One row is not enough and there is none left.
    const thin = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p2", "p2", "p2"] },
      { game: 2, server: "p2", winners: ["p1"] },
      { game: 3, server: "p1", winners: ["p2", "p2", "p2", "p2"] },
    ]);
    expect(planGamePull(thin, KEY, false)).toEqual({ kind: "add_point" });
    const tiebreak = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p2", "p2", "p2"] },
      {
        game: 2,
        server: "p2",
        type: "tiebreak",
        winners: ["p2", "p2", "p2", "p2", "p2", "p2", "p2"],
      },
    ]);
    expect(planGamePull(tiebreak, KEY, false)).toEqual({ kind: "add_point" });
    // The session's last game is not short (`gameUnderflow`): the row menu
    // adds its points, and no slot asks about it.
    const last = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 2, server: "p2", winners: ["p2", "p2", "p1"] },
    ]);
    expect(planGamePull(last, "1·2", true)).toEqual({
      error: "That game is not short — there is nothing to pull in.",
    });
  });

  test("a settled game, or a stranger, is refused", () => {
    expect(planGamePull(shortCase(), "1·2", false)).toEqual({
      error: "That game is not short — there is nothing to pull in.",
    });
    expect(planGamePull(shortCase(), "3·9", false)).toMatchObject({
      error: expect.stringContaining("not short"),
    });
  });

  test("a pulled row whose serve says the old server served it switches players, and the tally reads the switched winner", () => {
    const serve = (id: string, pointId: string, hitter: LabelSide) =>
      labelShot(id, pointId, {
        hitter,
        stroke: "first_serve",
        videoTime: 1,
      });
    // Game 2's first row was served by Vargas: into Lee's game it flips, so
    // Lee wins it (3–3, no-ad: not settled) and the next row is pulled too.
    const points = shortCase().map((p) =>
      p.id === UUID(6) ? { ...p, shots: [serve("s-6", UUID(6), "p2")] } : p,
    );
    const plan = planGamePull(points, KEY, false);
    expect(plan).toEqual({
      ok: true,
      writes: [
        {
          id: UUID(6),
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "edited",
          winner: "p1",
          ended_by: null,
        },
        {
          id: UUID(7),
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
      ],
      shots: [
        {
          id: "s-6",
          hitter: "p1",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
      ],
      summary: {
        points: 2,
        games: 1,
        fromGame: { set: 1, gameInSet: 2 },
        swapped: 1,
      },
    });
  });
});

test.describe("writeLabelGamePull", () => {
  test("the same run as the shift: the gate and scoring, the points, the shots when a server changes, then one update by id list", async () => {
    const fake = fakeClient({
      session: { status: "labelling", ad_scoring: false, job_id: JOB_ID },
      points: rowsOf(shortCase()),
    });
    const result = await writeLabelGamePull({
      supabase: fake.supabase,
      sessionId: SESSION_ID,
      gameKey: KEY,
    });
    expect(result).toEqual({
      ok: true,
      writes: [
        {
          id: UUID(6),
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
      ],
      shots: [],
    });
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
    ]);
    expect(writes(fake).map((c) => [c.values, c.in])).toEqual([
      [
        {
          set_number: 1,
          game_number: 1,
          server: "p1",
          game_type: "game",
          status: "edited",
        },
        { id: [UUID(6)] },
      ],
    ]);
  });

  test("the pull plans with the record's match-tiebreak set too: its games are never short", async () => {
    const fake = fakeClient({
      session: {
        status: "labelling",
        ad_scoring: false,
        job_id: JOB_ID,
        match_id: MATCH_ID,
      },
      match: {
        score: {
          player1: [1],
          player2: [0],
          player1_tiebreaks: [10],
          player2_tiebreaks: [7],
        },
        format: { best_of: 1 },
      },
      points: rowsOf(shortCase()),
    });
    expect(
      await writeLabelGamePull({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        gameKey: KEY,
      }),
    ).toEqual({
      error: "That game is not short — there is nothing to pull in.",
    });
    expect(fake.calls.map((c) => c.table)).toContain("matches");
  });

  test("a bad key, a game the rule declines, a complete session and a failed write each stop the run", async () => {
    const bad = fakeClient({});
    expect(
      await writeLabelGamePull({
        supabase: bad.supabase,
        sessionId: SESSION_ID,
        gameKey: "1-1",
      }),
    ).toEqual({ error: "Invalid game." });
    expect(bad.calls).toEqual([]);

    const declined = fakeClient({
      session: { status: "labelling", ad_scoring: false, job_id: JOB_ID },
      points: rowsOf(
        match([
          { game: 1, server: "p1", winners: ["p1", "p1", "p2", "p2", "p2"] },
          { game: 2, server: "p2", winners: ["p1"] },
          { game: 3, server: "p1", winners: ["p2", "p2", "p2", "p2"] },
        ]),
      ),
    });
    expect(
      await writeLabelGamePull({
        supabase: declined.supabase,
        sessionId: SESSION_ID,
        gameKey: KEY,
      }),
    ).toEqual({
      error:
        "That game is more likely missing a point than holding the next game's — add the point instead.",
    });
    expect(writes(declined)).toEqual([]);

    const complete = fakeClient({
      session: { status: "complete", ad_scoring: false, job_id: JOB_ID },
    });
    expect(
      await writeLabelGamePull({
        supabase: complete.supabase,
        sessionId: SESSION_ID,
        gameKey: KEY,
      }),
    ).toMatchObject({ error: expect.stringContaining("") });
    expect(complete.calls.map((c) => c.table)).toEqual(["label_sessions"]);

    const failing = fakeClient({
      session: { status: "labelling", ad_scoring: false, job_id: JOB_ID },
      points: rowsOf(shortCase()),
      failUpdate: UUID(6),
    });
    expect(
      await writeLabelGamePull({
        supabase: failing.supabase,
        sessionId: SESSION_ID,
        gameKey: KEY,
      }),
    ).toEqual({ error: "Could not pull the points in: boom" });
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    expect(
      await pullLabelGamePoints(SESSION_ID, KEY, {
        requireAdmin: async () => null,
        createAdminClient: () => {
          built += 1;
          return fakeClient({}).supabase;
        },
      }),
    ).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);
  });
});

test.describe("the isn't-finished slot", () => {
  const SLOT = "src/components/admin/labels/label-game-underflow.tsx";
  const RAIL = "src/components/admin/labels/label-black-rail.tsx";

  test("after the short game's last row, keyed by it, with the pull planned", () => {
    const { underflowAfterPoints } = createLoader().load(SLOT) as {
      underflowAfterPoints: (
        points: LabelPoint[],
        adScoring: boolean,
      ) => Map<string, { underflow: { gameInSet: number }; plan: unknown }>;
    };
    const after = underflowAfterPoints(shortCase(), false);
    expect([...after.keys()]).toEqual([UUID(5)]);
    expect(after.get(UUID(5))).toMatchObject({
      underflow: { gameInSet: 1, score: "30–40" },
      plan: { ok: true, summary: { points: 1 } },
    });
    expect(underflowAfterPoints(usersCase(), true).size).toBe(0);
  });

  test("the two lines and the one answer — Move here from the plan, Add point without one — on a click alone; none read-only", () => {
    const BlackGameUnderflow = renderFunction<Record<string, unknown>>(
      createLoader().load(SLOT).BlackGameUnderflow,
    );
    const calls: unknown[][] = [];
    const points = shortCase();
    const [underflow] = gameUnderflow(points, false);
    const pull = {
      underflow,
      plan: planGamePull(points, KEY, false),
    };
    const tree = BlackGameUnderflow({
      slot: pull,
      onPull: (...args: unknown[]) => calls.push(["pull", ...args]),
      onAddPoint: (...args: unknown[]) => calls.push(["add", ...args]),
    });
    expect(calls).toEqual([]);
    expect(
      findWhere(tree, (p) => "data-game-underflow-title" in p)?.props.children,
    ).toBe("Game 1 isn’t finished at 30–40");
    expect(
      findWhere(tree, (p) => "data-game-underflow-detail" in p)?.props.children,
    ).toBe("Pull 1 point from game 2");
    const button = findWhere(tree, (p) => "data-game-underflow-action" in p);
    expect(button?.props["data-game-underflow-action"]).toBe("pull");
    expect(button?.props.children).toBe("Move here");
    let stopped = 0;
    (button!.props.onClick as (e: unknown) => void)({
      stopPropagation: () => (stopped += 1),
    });
    expect(stopped).toBe(1);
    expect(calls).toEqual([["pull", KEY]]);
    // One game, nobody switching: no tooltip on the button.
    expect(findWhere(tree, (p) => typeof p.detail === "string")).toBeNull();

    const add = BlackGameUnderflow({
      slot: { underflow, plan: { kind: "add_point" } },
      onPull: (...args: unknown[]) => calls.push(["pull", ...args]),
      onAddPoint: (...args: unknown[]) => calls.push(["add", ...args]),
    });
    expect(
      findWhere(add, (p) => "data-game-underflow-detail" in p)?.props.children,
    ).toBe("A point may be missing");
    const addButton = findWhere(add, (p) => "data-game-underflow-action" in p);
    expect(addButton?.props.children).toBe("Add point");
    (addButton!.props.onClick as (e: unknown) => void)({
      stopPropagation: () => {},
    });
    expect(calls).toEqual([
      ["pull", KEY],
      ["add", UUID(5)],
    ]);

    const html = renderToStaticMarkup(
      React.createElement(
        createLoader().load(SLOT).BlackGameUnderflow as React.ComponentType<
          Record<string, unknown>
        >,
        { slot: pull },
      ),
    );
    expect(html).toContain('data-game-key="1·1"');
    expect(html).not.toContain("<button");
  });

  test("on the rail: the slot sits after the short game's last row, and the band says Unfinished", () => {
    const { LabelBlackRail } = createLoader().load(RAIL) as {
      LabelBlackRail: React.ComponentType<Record<string, unknown>>;
    };
    const points = shortCase();
    const render = (extra: Record<string, unknown>) =>
      renderToStaticMarkup(
        React.createElement(LabelBlackRail, {
          player1Name: "Lee",
          player2Name: "Vargas",
          checked: 0,
          total: 0,
          saveStatus: INITIAL_SAVE_STATUS,
          affordance: null,
          onFollow: () => {},
          points,
          scores: labelScores(points, false),
          adScoring: false,
          names: NAMES,
          expandedPointId: null,
          editable: true,
          operations: {},
          ...extra,
        }),
      );
    const html = render({});
    const at = (attr: string) => html.indexOf(attr);
    expect(at(`data-point-id="${UUID(5)}"`)).toBeLessThan(
      at(`data-game-underflow="${UUID(5)}"`),
    );
    expect(at(`data-game-underflow="${UUID(5)}"`)).toBeLessThan(
      at('data-game-band="1-2"'),
    );
    expect(html.match(/data-game-underflow=/g)).toHaveLength(1);
    expect(inner(html, "data-game-underflow-title")).toBe(
      "Game 1 isn’t finished at 30–40",
    );
    expect(tag(html, 'data-game-band="1-1"')).toContain('data-game-key="1·1"');
    expect(html).toContain("Unfinished · 30–40");
    expect(tag(html, 'data-game-outcome="unfinished"')).toContain(
      "text-[var(--rail-amber)]",
    );

    // Read-only: no slot.
    expect(render({ editable: false })).not.toContain("data-game-underflow");
  });
});

// ── The reproduction: a labelled ad-scoring match ──────────────────────────

/**
 * Games 4–8 of a real ad-scoring session's seed (Sage v Hunter Cheng, session
 * 1b391e8b…, anonymised to p1 and p2), each game's seeded winners in rally
 * order. Where "Move to game" was reported doing nothing.
 */
function seededAdMatch(): LabelPoint[] {
  return match([
    {
      game: 4,
      server: "p2",
      winners: ["p2", "p1", "p2", "p1", "p1", "p2", "p2"],
    },
    { game: 5, server: "p1", winners: ["p1", "p2", "p1", "p2", "p2", "p2"] },
    {
      game: 6,
      server: "p2",
      winners: ["p1", "p1", "p1", "p2", "p2", "p2", "p1"],
    },
    {
      game: 7,
      server: "p1",
      winners: ["p1", "p1", "p2", "p2", "p1", "p1", "p1"],
    },
    { game: 8, server: "p2", winners: ["p2"] },
  ]);
}

test.describe("an ad-scoring session's seeded games (the reproduction)", () => {
  test("the seed reads as written: game 4 short at Ad–40, game 6 short at 40–Ad, game 7 over", () => {
    const bands = labelScores(seededAdMatch(), true).games;
    expect(bands.map((b) => [b.gameNumber, b.outcome])).toEqual([
      [4, { kind: "unfinished", score: "Ad–40" }],
      [5, { kind: "decided", winner: "p2", score: "4–2" }],
      [6, { kind: "unfinished", score: "40–Ad" }],
      [7, { kind: "overflow", winner: "p1", score: "4–2", extra: 1 }],
      [8, { kind: "unfinished", score: "15–0" }],
    ]);
  });

  test("game 6 pulls game 7's first point and settles; game 7's leftover moves on to game 8", () => {
    const points = seededAdMatch();
    const pull = planGamePull(points, "1·6", true);
    expect(pull).toMatchObject({
      ok: true,
      writes: [{ id: UUID(21), game_number: 6, server: "p2" }],
      summary: { points: 1, games: 1, fromGame: { set: 1, gameInSet: 4 } },
    });
    const shift = planGameShift(points, true, UUID(27));
    expect(shift).toMatchObject({
      ok: true,
      writes: [{ id: UUID(27), game_number: 8, server: "p2" }],
    });
  });

  test("game 4 answers add_point: deuce after deuce drains game 5 without settling it", () => {
    expect(planGamePull(seededAdMatch(), "1·4", true)).toEqual({
      kind: "add_point",
    });
    expect(GAME_PULL_ADD_POINT).toContain("add the missing point");
  });

  test("games 6 and 7 held as one game read a valid deuce game, 8–6: no slot, nothing to pull or move", () => {
    // The live rows after labelling: game 7's rows (one deleted, one added)
    // renumbered into game 6 under game 6's server.
    const merged = match([
      { game: 5, server: "p1", winners: ["p2", "p1", "p2", "p2", "p2"] },
      {
        game: 6,
        server: "p2",
        winners: [
          ...["p1", "p1", "p1", "p2", "p2", "p2", "p2"],
          ...["p1", "p2", "p1", "p1", "p2", "p2", "p2"],
        ] as LabelSide[],
      },
      {
        game: 8,
        server: "p1",
        winners: ["p1", "p2", "p1", "p1", "p2", "p2", "p1", "p1"],
      },
    ]);
    const game6 = labelScores(merged, true).games.find(
      (b) => b.gameNumber === 6,
    );
    expect(game6?.outcome).toEqual({
      kind: "decided",
      winner: "p2",
      score: "8–6",
    });
    expect(gameOverflow(merged, true)).toEqual([]);
    expect(gameUnderflow(merged, true)).toEqual([]);
  });
});

// ── Start a new game here ───────────────────────────────────────────────────

test.describe("planGameSplit", () => {
  test("the point and the rest of its game become a new game, served by the other player, numbered past every game", () => {
    // Two games run together: Lee served 4 points, then Vargas's game began
    // at point 5 — the vendor never cut it.
    const points = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1", "p2", "p2"] },
      { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
    ]);
    const at = points[4];
    const plan = planGameSplit(
      points.map((p) => ({ ...p, shots: [] })),
      at.id,
    );
    expect("ok" in plan).toBe(true);
    if (!("ok" in plan)) return;
    expect(plan.writes.map((w) => w.id)).toEqual([points[4].id, points[5].id]);
    for (const write of plan.writes) {
      expect(write).toMatchObject({
        set_number: 1,
        game_number: 3,
        server: "p2",
        game_type: "game",
        status: "edited",
      });
    }
    // No other row is touched.
    expect(plan.writes).toHaveLength(2);
    expect(plan.shots).toEqual([]);
  });

  test("refused at a game's first point, in a tiebreak, and on a tombstone", () => {
    const points = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
      { game: 2, server: "p2", type: "tiebreak", winners: ["p1", "p2", "p1"] },
    ]).map((p) => ({ ...p, shots: [] }));
    expect(planGameSplit(points, points[0].id)).toEqual({
      error: "This point already starts its game.",
    });
    expect(planGameSplit(points, points[5].id)).toEqual({
      error: "A tiebreak is one game — it cannot be split.",
    });
    const gone = points.map((p, i) =>
      i === 2 ? { ...p, status: "deleted" as const } : p,
    );
    expect(planGameSplit(gone, points[2].id)).toEqual({
      error: "Restore this point before starting a game at it.",
    });
  });

  test("a stale tiebreak type on a point inside a regular game does not block it", () => {
    // Points 4–5 still say tiebreak, but they share game 1's number, so the
    // rail shows them in game 1 under its "game" header.
    const points = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1", "p2", "p2"] },
    ]).map((p, i) => ({
      ...p,
      gameType: i >= 4 ? ("match_tiebreak" as const) : p.gameType,
      shots: [],
    }));
    const plan = planGameSplit(points, points[4].id);
    if (!("ok" in plan)) throw new Error(plan.error);
    expect(plan.writes.map((w) => w.id)).toEqual([points[4].id, points[5].id]);
    for (const write of plan.writes) {
      expect(write).toMatchObject({ game_number: 2, game_type: "game" });
    }
  });

  test("the new game reads as its own game on the scoreboard, in row order", () => {
    const points = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1", "p2", "p2"] },
      { game: 2, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
    ]);
    const plan = planGameSplit(
      points.map((p) => ({ ...p, shots: [] })),
      points[4].id,
    );
    if (!("ok" in plan)) throw new Error(plan.error);
    const after = applyGameShift(points, plan.writes);
    const bands = labelScores(after, true).games;
    expect(bands.map((b) => [b.gameNumber, b.gameInSet])).toEqual([
      [1, 1],
      [3, 2],
      [2, 3],
    ]);
  });
});

// ── A video that starts mid-match ────────────────────────────────────────────

test.describe("a start score", () => {
  /** The video opens with Lee serving at 15–0, two games up. */
  const start = {
    sets: [0, 0] as [number, number],
    games: [2, 0] as [number, number],
    points: [1, 0] as [number, number],
    server: "p1" as const,
  };
  /** Three Lee points finish the first game only when counted from 15–0. */
  const fromStart = () =>
    match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1"] },
      { game: 2, server: "p2", winners: ["p2", "p2", "p2", "p2"] },
    ]);

  test("a game complete only from the start is neither overflow nor underflow", () => {
    expect(gameOverflow(fromStart(), true, null, start)).toEqual([]);
    expect(gameUnderflow(fromStart(), true, null, start)).toEqual([]);
    // Counted from 0–0 the same rows leave game 1 short at 40–0.
    expect(gameOverflow(fromStart(), true)).toEqual([]);
    expect(gameUnderflow(fromStart(), true).map((g) => g.score)).toEqual([
      "40–0",
    ]);
    expect(planGamePull(fromStart(), "1·1", true, null, start)).toEqual({
      error: "That game is not short — there is nothing to pull in.",
    });
  });

  test("a game decided from the start before its last row overflows by the rows past it", () => {
    // Game 2 takes the moved row as its fourth point, settled on its last.
    const points = match([
      { game: 1, server: "p1", winners: ["p1", "p2"] },
      { game: 2, server: "p2", winners: ["p2", "p2", "p2"] },
    ]);
    const atForty = { ...start, points: [3, 0] as [number, number] };
    const overflow = gameOverflow(points, true, null, atForty);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ gameNumber: 1, decidedBy: "p1" });
    expect(ids(overflow[0].leftovers)).toEqual([UUID(2)]);
    expect([...leftoverIds(points, true, null, atForty)]).toEqual([UUID(2)]);
    expect(gameOverflow(points, true)).toEqual([]);
    const plan = planGameShift(points, true, UUID(2), null, atForty);
    expect(plan).toMatchObject({
      ok: true,
      summary: { points: 1, games: 1, nextGame: { set: 1, gameInSet: 2 } },
    });
    if ("ok" in plan) {
      expect(plan.writes.map((w) => [w.id, w.game_number])).toEqual([
        [UUID(2), 2],
      ]);
    }
  });

  test("null is the beginning of the match: every reading is what it was", () => {
    for (const adScoring of [true, false]) {
      expect(gameOverflow(usersCase(), adScoring, null, null)).toEqual(
        gameOverflow(usersCase(), adScoring),
      );
      expect(gameUnderflow(shortCase(), adScoring, null, null)).toEqual(
        gameUnderflow(shortCase(), adScoring),
      );
    }
    expect(planGameShift(usersCase(), true, UUID(7), null, null)).toEqual(
      planGameShift(usersCase(), true, UUID(7)),
    );
  });
});

// ── Locked games (game-boundary.ts) ────────────────────────────────────────

test.describe("a locked game", () => {
  /** A row's lock set or cleared, by its index. */
  const lockAt = (points: LabelPoint[], index: number, locked = true) =>
    points.map((p, i) => (i === index ? { ...p, gameStartLocked: locked } : p));

  test("lockedGames reads the lock off a game's first live row only", () => {
    expect([...lockedGames(usersCase())]).toEqual([]);
    expect([...lockedGames(lockAt(usersCase(), 0))]).toEqual(["1·1"]);
    // On a later row it says nothing, and a deleted first row is stepped over.
    expect([...lockedGames(lockAt(usersCase(), 2))]).toEqual([]);
    const deletedFirst = lockAt(usersCase(), 0).map((p, i) =>
      i === 0 ? { ...p, status: "deleted" as const } : p,
    );
    expect([...lockedGames(deletedFirst)]).toEqual([]);
    expect([...lockedGames(lockAt(usersCase(), 8))]).toEqual(["1·2"]);
  });

  test("a locked overflowing game is in neither gameOverflow nor gameUnderflow", () => {
    expect(gameOverflow(usersCase(), true).map(gameKey)).toEqual(["1·1"]);
    const locked = lockAt(usersCase(), 0);
    expect(gameOverflow(locked, true)).toEqual([]);
    expect(leftoverIds(locked, true).size).toBe(0);
    expect(planGameShift(locked, true, UUID(7))).toHaveProperty("error");

    const short = shortCase();
    const keys = gameUnderflow(short, false).map(gameKey);
    expect(keys.length).toBeGreaterThan(0);
    const first = short.findIndex(
      (p) => p.status !== "deleted" && gameKey(p) === keys[0],
    );
    expect(gameUnderflow(lockAt(short, first), false).map(gameKey)).toEqual(
      keys.slice(1),
    );
  });

  test("no point moves INTO a locked game either: a shift is refused, a pull says add the point", () => {
    // Game 2's start locked: game 1's leftovers have nowhere to go.
    expect(planGameShift(lockAt(usersCase(), 8), true, UUID(7))).toEqual({
      error: "The next game's start is locked, so no point moves into it.",
    });
    const points = match([
      { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p2", "p2"] },
      { game: 2, server: "p2", winners: ["p1", "p1", "p1", "p1", "p1"] },
    ]);
    expect(planGamePull(points, "1·1", false)).toMatchObject({ ok: true });
    expect(planGamePull(lockAt(points, 5), "1·1", false)).toEqual({
      kind: "add_point",
    });
  });

  test("lockedGameImbalance names the points a locked game's last-point winner did not win, when the game is not decided on its last row", () => {
    const game = (winners: (LabelSide | null)[]) =>
      lockAt(match([{ game: 1, server: "p1", winners }]), 0);
    // Decided on its last row: nothing to flag.
    expect(
      lockedGameImbalance(game(["p1", "p1", "p2", "p1", "p1"]), true),
    ).toEqual([]);
    // Five points, one wrong winner: the video opens at 30–0, so Lee's
    // fourth point came two rows before the end — the one Vargas "won" is it.
    const start: LabelStartScore = {
      sets: [0, 0],
      games: [0, 0],
      points: [2, 0],
      server: "p1",
    };
    expect(
      lockedGameImbalance(game(["p1", "p1", "p2", "p1", "p1"]), true, start),
    ).toEqual([UUID(3)]);
    // Short of a game: the points not won by the last point's winner, in
    // rail order — a point with no winner yet among them.
    expect(
      lockedGameImbalance(game(["p1", "p1", "p2", null, "p1"]), true),
    ).toEqual([UUID(3), UUID(4)]);
    // Unlocked, the same rows say nothing; nor does a game nobody has won a point of.
    expect(
      lockedGameImbalance(
        match([
          { game: 1, server: "p1", winners: ["p1", "p1", "p2", null, "p1"] },
        ]),
        true,
      ),
    ).toEqual([]);
    expect(lockedGameImbalance(game([null, null]), true)).toEqual([]);
  });
});

// ── The locked game's slot and band (label-game-locked.tsx, Design B) ──────

test.describe("a locked game on the rail", () => {
  const LOCKED = "src/components/admin/labels/label-game-locked.tsx";
  const RAIL = "src/components/admin/labels/label-black-rail.tsx";
  const lockAt = (points: LabelPoint[], index: number) =>
    points.map((p, i) => (i === index ? { ...p, gameStartLocked: true } : p));
  /** `lockedGameImbalance`'s ids for one game. */
  const doubtedIn = (points: LabelPoint[], key: string, adScoring: boolean) =>
    lockedGameImbalance(points, adScoring).filter(
      (id) => gameKey(points.find((p) => p.id === id)!) === key,
    );
  /** The slot's markup, from its root to the next row. */
  const imbalanceSlot = (html: string) => {
    const at = html.indexOf('data-row="game-imbalance"');
    expect(at).toBeGreaterThan(-1);
    return html.slice(
      html.lastIndexOf("<div", at),
      html.indexOf("data-row=", at + 10),
    );
  };

  test("a locked overflowing game: no already-won or isn't-finished slot, one amber slot under its band with Check N points and Add point", () => {
    const points = lockAt(usersCase(), 0);
    const html = black(sessionWith(points));
    expect(html).not.toContain("data-game-overflow");
    expect(html).not.toContain("data-game-underflow");
    expect(html.match(/data-row="game-imbalance"/g)).toHaveLength(1);

    const n = doubtedIn(points, "1·1", true).length;
    expect(n).toBe(4);
    const row = imbalanceSlot(html);
    expect(row).toContain('data-game-imbalance="1·1"');
    expect(row).toContain(`data-game-imbalance-count="${n}"`);
    expect(row).toContain("border-dashed");
    expect(row).toContain("bg-[var(--rail-amber-wash-faint)]");
    expect(inner(row, "data-game-imbalance-title")).toBe(
      "Game 1 doesn’t add up: an ending is probably wrong",
    );
    expect(inner(row, "data-game-imbalance-detail")).toBe(
      "Vargas serves and wins its last point, but the points give Lee the game 2 points before it. Check the points Vargas lost.",
    );
    expect(inner(row, 'data-game-imbalance-action="check"')).toBe(
      `Check ${n} points`,
    );
    expect(tag(row, 'data-game-imbalance-action="check"')).toContain(
      "text-[var(--rail-amber)]",
    );
    expect(inner(row, 'data-game-imbalance-action="add"')).toBe("Add point");
    expect(tag(row, 'data-game-imbalance-action="add"')).toContain(
      "text-white/50",
    );

    // At the top of the game: under its band, above its first row.
    const at = html.indexOf('data-row="game-imbalance"');
    expect(html.indexOf('data-game-band="1-1"')).toBeLessThan(at);
    expect(at).toBeLessThan(html.indexOf(`data-point-id="${UUID(1)}"`));
    // The band says who set the start.
    expect(tag(html, "data-game-locked=")).toContain("data-game-locked");
    expect(text(html)).toContain("set by you");
  });

  test("the unlocked fixture still gets the old slots and no lock; an unfinished locked game reads its call", () => {
    const html = black(sessionWith(usersCase()));
    expect(html).toContain("data-game-overflow=");
    expect(html).not.toContain("data-game-imbalance");
    expect(html).not.toContain("data-game-locked");
    expect(html).not.toContain("set by you");

    const short = black(sessionWith(shortCase(), { adScoring: false }));
    expect(short).toContain("data-game-underflow=");
    expect(short).not.toContain("data-game-imbalance");

    const points = lockAt(shortCase(), 0);
    const locked = black(sessionWith(points, { adScoring: false }));
    expect(locked).not.toContain("data-game-underflow");
    const row = imbalanceSlot(locked);
    const n = doubtedIn(points, "1·1", false).length;
    expect(n).toBe(2);
    expect(inner(row, "data-game-imbalance-detail")).toBe(
      "Vargas wins its last point, but the points leave the game at 30–40. Check the points Vargas lost.",
    );
    expect(inner(row, 'data-game-imbalance-action="check"')).toBe(
      "Check 2 points",
    );
    // Read-only: the band keeps its lock, the slot goes.
    const readOnly = black(
      sessionWith(points, { adScoring: false, status: "complete" }),
    );
    expect(readOnly).toContain("data-game-locked");
    expect(readOnly).not.toContain("data-game-imbalance");
  });

  test("the slot goes once the game adds up, and the session's last game is not asked about while it is played", () => {
    const { lockedSlotsAtPoints } = createLoader().load(LOCKED) as {
      lockedSlotsAtPoints: (
        points: LabelPoint[],
        games: unknown,
        adScoring: boolean,
      ) => Map<string, unknown>;
    };
    const slotsOf = (rows: LabelPoint[], adScoring = true) =>
      lockedSlotsAtPoints(rows, labelScores(rows, adScoring).games, adScoring);
    expect(slotsOf(lockAt(usersCase(), 0)).size).toBe(1);
    // Rows 7 and 8 given to Lee: the game still runs past Lee's deciding
    // point, so it still does not add up.
    const relabelled = lockAt(usersCase(), 0).map((p, i) =>
      i === 6 || i === 7 ? { ...p, winner: "p1" as const } : p,
    );
    expect(slotsOf(relabelled).size).toBe(1);
    // Rows 7 and 8 gone: decided on its last row, and the slot with it.
    const trimmed = lockAt(usersCase(), 0).map((p, i) =>
      i === 6 || i === 7 ? { ...p, status: "deleted" as const } : p,
    );
    expect(slotsOf(trimmed).size).toBe(0);
    expect(black(sessionWith(trimmed))).not.toContain("data-game-imbalance");
    expect(black(sessionWith(trimmed))).toContain("data-game-locked");
    // The last game of the session, unfinished and locked: nothing yet.
    const last = lockAt(
      match([
        { game: 1, server: "p1", winners: ["p1", "p1", "p1", "p1"] },
        { game: 2, server: "p2", winners: ["p2", "p1"] },
      ]),
      4,
    );
    expect(slotsOf(last).size).toBe(0);
  });

  test("Check N points steps through the doubted ids in order and wraps, through the console's flag jump; Add point is the underflow slot's insert", () => {
    const { BlackGameLocked, lockedSlotsAtPoints, checkStepper } =
      createLoader().load(LOCKED) as Record<string, unknown>;
    const points = lockAt(usersCase(), 0);
    const slots = (
      lockedSlotsAtPoints as (
        p: LabelPoint[],
        g: unknown,
        a: boolean,
      ) => Map<string, { pointIds: string[]; lastPointId: string }>
    )(points, labelScores(points, true).games, true);
    const slotOf = slots.get(UUID(1))!;
    const ids = doubtedIn(points, "1·1", true);
    expect(slotOf.pointIds).toEqual(ids);
    expect(slotOf.lastPointId).toBe(UUID(8));

    // The rail's handler: one stepper for its life, each id to `onGoToPoint`.
    const step = (checkStepper as () => (k: string, i: string[]) => string)();
    const went: string[] = [];
    const calls: unknown[][] = [];
    const tree = renderFunction<Record<string, unknown>>(BlackGameLocked)({
      slot: slotOf,
      names: NAMES,
      onCheck: (key: string, pointIds: string[]) => {
        calls.push(["check", key]);
        went.push(step(key, pointIds));
      },
      onAddPoint: (...args: unknown[]) => calls.push(["add", ...args]),
    });
    expect(calls).toEqual([]);
    const check = findWhere(
      tree,
      (p) => p["data-game-imbalance-action"] === "check",
    );
    let stopped = 0;
    const click = () =>
      (check!.props.onClick as (e: unknown) => void)({
        stopPropagation: () => (stopped += 1),
      });
    for (let i = 0; i < ids.length + 1; i += 1) click();
    expect(went).toEqual([...ids, ids[0]]);
    expect(stopped).toBe(ids.length + 1);

    // A point put right leaves the list: the one now in its place is next.
    const fresh = (checkStepper as () => (k: string, i: string[]) => string)();
    expect(fresh("1·1", ids)).toBe(ids[0]);
    expect(fresh("1·1", ids)).toBe(ids[1]);
    expect(fresh("1·1", [ids[0], ids[2], ids[3]])).toBe(ids[2]);

    const add = findWhere(
      tree,
      (p) => p["data-game-imbalance-action"] === "add",
    );
    (add!.props.onClick as (e: unknown) => void)({ stopPropagation: () => {} });
    expect(calls.at(-1)).toEqual(["add", UUID(8)]);

    // The wiring: the rail hands each id to `onGoToPoint` — the console's
    // `findGap(pointId, { arm: true })` — and both slots the same `onAddPoint`.
    const rail = readFileSync(RAIL, "utf8");
    expect(rail).toMatch(
      /const id = stepCheck\(key, pointIds\);\n\s+if \(id !== null\) onGoToPoint\?\.\(id\);/,
    );
    expect(rail).toContain("onCheck={onGoToPoint ? checkLocked : undefined}");
    expect(rail.match(/onAddPoint=\{onAddPoint\}/g)).toHaveLength(2);
    const consoleSource = readFileSync(CONSOLE, "utf8");
    expect(consoleSource).toContain(
      "goToFlag: (pointId: string) => findGap(pointId, { arm: true }),",
    );
    expect(consoleSource).toContain("onGoToPoint={railHandlers.goToFlag}");
    expect(consoleSource).toContain(
      'addPointAfter: (pointId: string) => insertPoint(pointId, "after"),',
    );
    expect(consoleSource).toContain(
      "onAddPoint={operable ? railHandlers.addPointAfter : undefined}",
    );
  });

  test("undo after a boundary drag: the rows come back without the flag, and the band loses its lock", () => {
    // Game 2's header dragged up above row 7: rows 7 and 8 join it, row 7
    // takes the lock — as the console applies the move's write.
    const before = usersCase();
    const plan = planGameBoundary(
      before,
      { setNumber: 1, gameNumber: 2 },
      UUID(7),
    );
    if (!("ok" in plan)) throw new Error("the drag plans");
    const moved = before.map((p) =>
      plan.write.pointIds.includes(p.id)
        ? {
            ...p,
            gameNumber: 2,
            gameStartLocked: p.id === plan.write.lockPointId,
          }
        : p,
    );
    const dragged = black(sessionWith(moved));
    expect(tag(dragged, 'data-game-band="1-2"')).toBeTruthy();
    const band2 = dragged.slice(
      dragged.indexOf('data-game-band="1-2"'),
      dragged.indexOf(`data-point-id="${UUID(7)}"`),
    );
    expect(band2).toContain("data-game-locked");
    expect(text(`<p ${band2}`)).toContain("set by you");

    // `undoLast` sets the console's rows to the undo's answer, whole: the
    // moved rows as they were read before the drag, the flag false.
    const consoleSource = readFileSync(CONSOLE, "utf8");
    const undoSource = consoleSource.slice(
      consoleSource.indexOf("  async function undoLast()"),
      consoleSource.indexOf("  async function addAllMissingShots()"),
    );
    expect(undoSource).toContain("setPoints(result.points);");
    const undone = black(sessionWith(before));
    expect(undone).not.toContain("data-game-locked");
    expect(undone).not.toContain("set by you");
  });
});
