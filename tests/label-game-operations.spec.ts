import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  applyGameWrites,
  gameFirstServer,
  planGameServer,
  planGameType,
  rotateServers,
  takesServeTurn,
  type GamePointWrite,
  type GameServerPoint,
} from "@/lib/services/labels/game-operations";
import {
  setLabelGameServer,
  setLabelGameType,
  writeLabelGameServer,
  writeLabelGameType,
} from "@/lib/services/labels/game-operations-session";
import type { SwapShot } from "@/lib/services/labels/player-swap";
import type {
  LabelPointSeedValues,
  LabelSide,
} from "@/lib/services/labels/session";
import {
  fakeLabelClient,
  labelSessionFixture,
  labelShotRow,
} from "./fixtures/label-session";

// Game operations: set a game's server, set a game's type — the pure rules
// and the admin-gated services over a fake client.

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const GAME = { setNumber: 1, gameNumber: 7 };
const OTHER_GAME = { setNumber: 1, gameNumber: 6 };

type PointFields = Partial<Omit<GameServerPoint, "seed">> & {
  /** Null: no seed. A partial: the seed is the point's values with these over it. */
  seed?: Partial<LabelPointSeedValues> | null;
};

/** A point of GAME, `unchanged`, served by `server`, seeded as it stands, with no strokes. */
function point(
  id: string,
  pointIndex: number,
  fields: PointFields = {},
): GameServerPoint {
  const { seed: seedFields, ...rest } = fields;
  const base: GameServerPoint = {
    id,
    pointIndex,
    status: "unchanged",
    server: "p1",
    setNumber: GAME.setNumber,
    gameNumber: GAME.gameNumber,
    serveSide: null,
    winner: "p1",
    ending: "winner",
    endedBy: "p1",
    gameType: "game",
    seed: null,
    shots: [],
    ...rest,
  };
  if (seedFields === null) return base;
  const seed: LabelPointSeedValues = {
    set_number: base.setNumber,
    game_number: base.gameNumber,
    server: base.server,
    serve_side: base.serveSide,
    winner: base.winner,
    ending: base.ending,
    ended_by: base.endedBy,
    ...seedFields,
  };
  return { ...base, seed };
}

/** Nine points of a tiebreak, the fourth a replayed let. */
function tiebreakPoints(first: LabelSide = "p1"): GameServerPoint[] {
  return Array.from({ length: 9 }, (_, i) =>
    point(`tb-${i + 1}`, 100 + i, {
      server: first,
      gameType: "tiebreak",
      ...(i === 3 ? { ending: "let_replayed", winner: null } : {}),
    }),
  );
}

/** A vendor stroke seeded with exactly what it holds. */
function seededShot(id: string, fields: Partial<SwapShot> = {}): SwapShot {
  const row: SwapShot = {
    id,
    eventId: 1,
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

/** A serve by `server` and the return, in video order, prefixed by `id`. */
function rally(id: string, server: LabelSide): SwapShot[] {
  const returner = server === "p1" ? "p2" : "p1";
  return [
    seededShot(`${id}-serve`, {
      hitter: server,
      stroke: "first_serve",
      videoTime: 1,
    }),
    seededShot(`${id}-return`, {
      hitter: returner,
      stroke: "backhand",
      videoTime: 2,
    }),
  ];
}

function servers(planned: ReturnType<typeof planGameServer>): LabelSide[] {
  if (!("ok" in planned)) throw new Error(planned.error);
  return planned.writes.map((w) => w.server);
}

function writesOf(
  planned: ReturnType<typeof planGameServer>,
): GamePointWrite[] {
  if (!("ok" in planned)) throw new Error(planned.error);
  return planned.writes;
}

function planOf(planned: ReturnType<typeof planGameServer>) {
  if (!("ok" in planned)) throw new Error(planned.error);
  return planned;
}

// ── The tiebreak rotation ──────────────────────────────────────────────────

test.describe("tiebreak rotation", () => {
  test("1-2-2 over nine points, a let at position 4 taking the next server", () => {
    const planned = planGameServer(tiebreakPoints(), GAME, "p1");
    // Served points: 1 → p1, 2–3 → p2, 4–5 → p1, 6–7 → p2, 8 → p1. The let
    // (row 4) is not served; it sits between served points 3 and 4 and takes
    // the next one's server, p1.
    expect(servers(planned)).toEqual([
      "p1",
      "p2",
      "p2",
      "p1", // the let
      "p1",
      "p1",
      "p2",
      "p2",
      "p1",
    ]);
    expect(writesOf(planned).map((w) => w.id)).toEqual(
      Array.from({ length: 9 }, (_, i) => `tb-${i + 1}`),
    );
  });

  test("a let at the end takes the last served point's server; not_a_point is a let too", () => {
    const points = tiebreakPoints().map((p) =>
      p.id === "tb-4"
        ? { ...p, ending: "winner" as const, winner: "p2" as const }
        : p,
    );
    points.push(
      point("tb-10", 109, {
        gameType: "tiebreak",
        ending: "not_a_point",
        winner: null,
      }),
    );
    // Nine served points: p1 p2 p2 p1 p1 p2 p2 p1 p1 — then the trailing row.
    expect(servers(planGameServer(points, GAME, "p1"))).toEqual([
      "p1",
      "p2",
      "p2",
      "p1",
      "p1",
      "p2",
      "p2",
      "p1",
      "p1",
      "p1",
    ]);
    expect(takesServeTurn({ status: "unchanged", ending: "not_a_point" })).toBe(
      false,
    );
    expect(
      takesServeTurn({ status: "unchanged", ending: "let_replayed" }),
    ).toBe(false);
    // A point with no winner yet was still served: the rotation does not
    // wait for the labeller.
    expect(takesServeTurn({ status: "unchanged", ending: null })).toBe(true);
  });

  test("a match tiebreak rotates the same way; rows arrive in any order", () => {
    const shuffled = [...tiebreakPoints()]
      .map((p) => ({ ...p, gameType: "match_tiebreak" as const }))
      .reverse();
    expect(servers(planGameServer(shuffled, GAME, "p1"))).toEqual([
      "p1",
      "p2",
      "p2",
      "p1",
      "p1",
      "p1",
      "p2",
      "p2",
      "p1",
    ]);
  });

  test("rotateServers on a game of nothing but lets gives the first server", () => {
    const lets = [
      { status: "unchanged" as const, ending: "let_replayed" as const },
      { status: "unchanged" as const, ending: "let_replayed" as const },
    ];
    expect(rotateServers(lets, "tiebreak", "p2")).toEqual(["p2", "p2"]);
    expect(rotateServers(lets, "game", "p1")).toEqual(["p1", "p1"]);
  });
});

// ── An ordinary game ───────────────────────────────────────────────────────

test.describe("an ordinary game", () => {
  test("every live point of the game gets the chosen server, nothing else is named", () => {
    const points = [
      point("g-1", 1),
      point("g-2", 2, { ending: "let_replayed", winner: null }),
      point("g-3", 3, { status: "deleted" }),
      point("g-4", 4),
      point("o-1", 5, { gameNumber: OTHER_GAME.gameNumber }),
      point("o-2", 6, { setNumber: 2 }),
    ];
    const planned = planGameServer(points, GAME, "p2");
    expect(writesOf(planned)).toEqual([
      { id: "g-1", server: "p2", status: "edited" },
      { id: "g-2", server: "p2", status: "edited" },
      { id: "g-4", server: "p2", status: "edited" },
    ]);
  });

  test("a game with no live points is refused", () => {
    expect(
      planGameServer([point("g-1", 1, { status: "deleted" })], GAME, "p1"),
    ).toHaveProperty("error");
    expect(planGameServer([], GAME, "p1")).toHaveProperty("error");
    expect(planGameType([], GAME, "tiebreak")).toHaveProperty("error");
  });
});

// ── The players' swap ──────────────────────────────────────────────────────

test.describe("the players' swap", () => {
  test("a point whose serve the old server hit switches players; one already served by the new server, or with no hitter, is only re-served", () => {
    const points = [
      // Lee's serve, Lee's winner: the strokes contradict p2.
      point("g-1", 1, { shots: rally("g-1", "p1") }),
      // Vargas already serving, under a wrong `server`: only re-served.
      point("g-2", 2, {
        winner: "p2",
        endedBy: "p2",
        shots: rally("g-2", "p2"),
      }),
      // Lee's serve again, this time an error by Vargas, won by Lee.
      point("g-3", 3, {
        ending: "error",
        endedBy: "p2",
        shots: rally("g-3", "p1"),
      }),
      // No stroke names a hitter: nothing to contradict, only re-served.
      point("g-4", 4, {
        shots: [
          seededShot("g-4-serve", { hitter: null, stroke: "first_serve" }),
        ],
      }),
    ];
    const plan = planOf(planGameServer(points, GAME, "p2"));
    expect(plan.writes).toEqual([
      {
        id: "g-1",
        server: "p2",
        status: "edited",
        winner: "p2",
        ended_by: "p2",
      },
      { id: "g-2", server: "p2", status: "edited" },
      {
        id: "g-3",
        server: "p2",
        status: "edited",
        winner: "p2",
        ended_by: "p1",
      },
      { id: "g-4", server: "p2", status: "edited" },
    ]);
    // Every stroke of the two swapped points, flipped; none of the others'.
    expect(plan.shots).toEqual([
      {
        id: "g-1-serve",
        hitter: "p2",
        status: "edited",
        status_before_delete: null,
        was: "kept",
      },
      {
        id: "g-1-return",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
        was: "kept",
      },
      {
        id: "g-3-serve",
        hitter: "p2",
        status: "edited",
        status_before_delete: null,
        was: "kept",
      },
      {
        id: "g-3-return",
        hitter: "p1",
        status: "edited",
        status_before_delete: null,
        was: "kept",
      },
    ]);
  });

  test("a null winner stays null; ending is never named; a tombstone's hitter flips with status_before_delete recomputed", () => {
    const points = [
      point("g-1", 1, {
        winner: null,
        ending: null,
        endedBy: null,
        shots: [
          ...rally("g-1", "p1"),
          seededShot("g-1-phantom", {
            hitter: "p1",
            videoTime: 3,
            status: "deleted",
            statusBeforeDelete: "kept",
          }),
        ],
      }),
    ];
    const plan = planOf(planGameServer(points, GAME, "p2"));
    expect(plan.writes).toEqual([
      {
        id: "g-1",
        server: "p2",
        status: "edited",
        winner: null,
        ended_by: null,
      },
    ]);
    expect(plan.writes[0]).not.toHaveProperty("ending");
    expect(plan.shots.find((s) => s.id === "g-1-phantom")).toEqual({
      id: "g-1-phantom",
      hitter: "p2",
      status: "deleted",
      status_before_delete: "edited",
      was: "deleted",
    });
  });

  test("the status is measured over the whole change: a swap that lands the point back on its seed makes it unchanged", () => {
    // Seeded server p2, winner p2; a move set server p1 and swapped the
    // players (winner p1, Lee's serve). Serving p2 again swaps them back.
    const points = [
      point("g-1", 1, {
        status: "edited",
        server: "p1",
        winner: "p1",
        endedBy: "p1",
        seed: { server: "p2", winner: "p2", ended_by: "p2" },
        shots: [
          {
            ...seededShot("g-1-serve", {
              hitter: "p2",
              stroke: "first_serve",
              videoTime: 1,
            }),
            hitter: "p1",
            status: "edited",
          },
        ],
      }),
    ];
    const plan = planOf(planGameServer(points, GAME, "p2"));
    expect(plan.writes).toEqual([
      {
        id: "g-1",
        server: "p2",
        status: "unchanged",
        winner: "p2",
        ended_by: "p2",
      },
    ]);
    // The stroke lands on its seeded hitter too: back to kept.
    expect(plan.shots).toEqual([
      {
        id: "g-1-serve",
        hitter: "p2",
        status: "kept",
        status_before_delete: null,
        was: "edited",
      },
    ]);
  });

  test("in a tiebreak each point is measured against its own rotated server", () => {
    // Nine points all served by Lee as the rows have it; serving p1 first
    // rotates points 2–3, 6–7 to Vargas, and those four switch players.
    const points = tiebreakPoints().map((p, i) => ({
      ...p,
      shots: i === 3 ? [] : rally(p.id, "p1"),
    }));
    const plan = planOf(planGameServer(points, GAME, "p1"));
    expect(plan.writes.map((w) => "winner" in w)).toEqual([
      false,
      true,
      true,
      false, // the let: no strokes
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(plan.shots.map((s) => s.id)).toEqual(
      ["tb-2", "tb-3", "tb-7", "tb-8"].flatMap((id) => [
        `${id}-serve`,
        `${id}-return`,
      ]),
    );
  });

  test("the type operation never swaps", () => {
    const points = [point("g-1", 1, { shots: rally("g-1", "p2") })];
    const plan = planOf(planGameType(points, GAME, "tiebreak"));
    expect(plan.shots).toEqual([]);
    expect(plan.writes[0]).not.toHaveProperty("winner");
  });
});

// ── The status rule ────────────────────────────────────────────────────────

test.describe("status", () => {
  test("a point moved back to its seeded server returns to unchanged", () => {
    const points = [
      // Seeded p1, currently p2 → edited; back to p1 makes it unchanged.
      point("g-1", 1, {
        server: "p2",
        status: "edited",
        seed: { server: "p1" },
      }),
      // Seeded and held p1: untouched by p1, edited by p2.
      point("g-2", 2),
      // Added points stay added whatever happens.
      point("g-3", 3, { status: "added", seed: null }),
      // No seed and unchanged: a changed value makes it edited.
      point("g-4", 4, { seed: null }),
    ];
    expect(writesOf(planGameServer(points, GAME, "p1"))).toEqual([
      { id: "g-1", server: "p1", status: "unchanged" },
      { id: "g-2", server: "p1", status: "unchanged" },
      { id: "g-3", server: "p1", status: "added" },
      { id: "g-4", server: "p1", status: "unchanged" },
    ]);
    expect(writesOf(planGameServer(points, GAME, "p2"))).toEqual([
      { id: "g-1", server: "p2", status: "edited" },
      { id: "g-2", server: "p2", status: "edited" },
      { id: "g-3", server: "p2", status: "added" },
      { id: "g-4", server: "p2", status: "edited" },
    ]);
  });

  test("in a tiebreak the status follows each point's rotated server", () => {
    // Seeded p1 throughout; the rotation makes points 2–3 p2 (edited) and
    // leaves point 1 as seeded (unchanged).
    const planned = planGameType(
      tiebreakPoints().slice(0, 3),
      GAME,
      "tiebreak",
    );
    expect(writesOf(planned).map((w) => w.status)).toEqual([
      "unchanged",
      "edited",
      "edited",
    ]);
  });

  test("the type itself never moves the status", () => {
    const planned = planGameType([point("g-1", 1)], GAME, "match_tiebreak");
    expect(writesOf(planned)).toEqual([
      {
        id: "g-1",
        server: "p1",
        game_type: "match_tiebreak",
        status: "unchanged",
      },
    ]);
  });
});

// ── Set a game's type ──────────────────────────────────────────────────────

test.describe("planGameType", () => {
  test("to a tiebreak: rotates from the game's current first server, game_type on every write", () => {
    const points = tiebreakPoints("p2").map((p) => ({
      ...p,
      gameType: "game" as const,
    }));
    const planned = planGameType(points, GAME, "tiebreak");
    const writes = writesOf(planned);
    expect(writes.map((w) => w.server)).toEqual([
      "p2",
      "p1",
      "p1",
      "p2",
      "p2",
      "p2",
      "p1",
      "p1",
      "p2",
    ]);
    expect(writes.every((w) => w.game_type === "tiebreak")).toBe(true);
  });

  test("back to game: every point gets the current first server", () => {
    const rotated = tiebreakPoints("p1");
    const asTiebreak = writesOf(planGameType(rotated, GAME, "tiebreak"));
    const points = rotated.map((p, i) => ({
      ...p,
      server: asTiebreak[i].server,
    }));
    const planned = planGameType(points, GAME, "game");
    expect(writesOf(planned)).toEqual(
      points.map((p) => ({
        id: p.id,
        server: "p1",
        game_type: "game",
        status: "unchanged",
      })),
    );
  });

  test("the first server is the first live point's that names one", () => {
    const live = [
      { server: null },
      { server: "p2" as const },
      { server: "p1" as const },
    ];
    expect(gameFirstServer(live)).toBe("p2");
    expect(gameFirstServer([{ server: null }])).toBeNull();
    expect(
      planGameType([point("g-1", 1, { server: null })], GAME, "tiebreak"),
    ).toHaveProperty("error");
  });
});

// ── The console's optimistic rows ──────────────────────────────────────────

test("applyGameWrites applies the writes and leaves the other rows alone", () => {
  const session = labelSessionFixture();
  const [p1, p2, p3, p4] = session.points;
  const writes: GamePointWrite[] = [
    { id: p1.id, server: "p2", status: "edited" },
    { id: p2.id, server: "p2", game_type: "tiebreak", status: "edited" },
  ];
  const next = applyGameWrites(session.points, writes);
  expect(next.map((p) => p.id)).toEqual(session.points.map((p) => p.id));
  expect(next[0]).toEqual({ ...p1, server: "p2", status: "edited" });
  expect(next[1]).toEqual({
    ...p2,
    server: "p2",
    gameType: "tiebreak",
    status: "edited",
  });
  expect(next[2]).toBe(p3);
  expect(next[3]).toBe(p4);
  // The input is not mutated.
  expect(session.points[0].server).toBe("p1");

  // A swapped point's write carries its winner and ended by, null included;
  // its strokes are the plan's `shots`, applied separately.
  const swapped = applyGameWrites(session.points, [
    { id: p2.id, server: "p2", status: "edited", winner: "p2", ended_by: null },
  ]);
  expect(swapped[1]).toEqual({
    ...p2,
    server: "p2",
    status: "edited",
    winner: "p2",
    endedBy: null,
  });
  expect(swapped[1].shots).toBe(p2.shots);
});

// ── The services, over a fake client ───────────────────────────────────────

function fakeClient(rows: {
  gamePoints?: Record<string, unknown>[];
  /** The game's shot rows, as `readShotsOfPoints` reads them. */
  shots?: Record<string, unknown>[];
  sessionStatus?: string | null;
  /** Ids whose compare-and-set matches nothing — another tab got there first. */
  racedIds?: string[];
  /** Shot ids a grouped swap's compare-and-set leaves out: deleted or restored since the read. */
  racedShotIds?: string[];
}) {
  return fakeLabelClient((call) => {
    if (call.op === "update") {
      if (call.table === "label_shots" && call.in?.id) {
        const raced = rows.racedShotIds ?? [];
        return {
          data: call.in.id
            .filter((id) => !raced.includes(id as string))
            .map((id) => ({ id })),
          error: null,
        };
      }
      return (rows.racedIds ?? []).includes(call.filters.id as string)
        ? { data: [], error: null }
        : undefined;
    }
    if (call.table === "label_sessions") {
      return {
        data:
          rows.sessionStatus === null
            ? null
            : { status: rows.sessionStatus ?? "labelling" },
        error: null,
      };
    }
    if (call.table === "label_points") {
      return { data: rows.gamePoints ?? [], error: null };
    }
    if (call.table === "label_shots") {
      return { data: rows.shots ?? [], error: null };
    }
    return undefined;
  });
}

const ADMIN = { requireAdmin: async () => ({ id: "admin" }) };
const NOBODY = { requireAdmin: async () => null };

const ROW_IDS = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
];

function gameRow(
  id: string,
  pointIndex: number,
  fields: Record<string, unknown> = {},
) {
  return {
    id,
    point_index: pointIndex,
    updated_at: `2026-10-03T00:00:0${pointIndex}Z`,
    status: "unchanged",
    server: "p1",
    set_number: GAME.setNumber,
    game_number: GAME.gameNumber,
    serve_side: null,
    winner: "p1",
    ending: "winner",
    ended_by: "p1",
    game_type: "game",
    seed: {
      set_number: GAME.setNumber,
      game_number: GAME.gameNumber,
      server: "p1",
      serve_side: null,
      winner: "p1",
      ending: "winner",
      ended_by: "p1",
    },
    ...fields,
  };
}

test.describe("the services", () => {
  test("both entry points refuse without an admin, before a client is built", async () => {
    let built = 0;
    const deps = {
      ...NOBODY,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    };
    const results = await Promise.all([
      setLabelGameServer(SESSION_ID, GAME, "p2", deps),
      setLabelGameType(SESSION_ID, GAME, "tiebreak", deps),
    ]);
    for (const result of results) {
      expect(result).toEqual({ error: "Administrator access is required." });
    }
    expect(built).toBe(0);
  });

  test("a complete session is refused before anything is read or written", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1)],
      sessionStatus: "complete",
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    expect(await setLabelGameServer(SESSION_ID, GAME, "p2", deps)).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(await setLabelGameType(SESSION_ID, GAME, "tiebreak", deps)).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(fake.calls.every((c) => c.table === "label_sessions")).toBe(true);
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  test("bad input is refused before anything is read", async () => {
    const fake = fakeClient({});
    const cases = [
      writeLabelGameServer({
        supabase: fake.supabase,
        sessionId: "not-a-uuid",
        game: GAME,
        server: "p1",
      }),
      writeLabelGameServer({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        game: { setNumber: 0, gameNumber: 1 },
        server: "p1",
      }),
      writeLabelGameServer({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        game: GAME,
        server: "p3",
      }),
      writeLabelGameType({
        supabase: fake.supabase,
        sessionId: SESSION_ID,
        game: GAME,
        type: "super_tiebreak",
      }),
    ];
    for (const result of await Promise.all(cases)) {
      expect(result).toHaveProperty("error");
    }
    expect(fake.calls).toEqual([]);
  });

  test("the server operation reads the game's live rows and UPDATEs each, compare-and-set on updated_at", async () => {
    const fake = fakeClient({
      gamePoints: [
        gameRow(ROW_IDS[0], 1),
        gameRow(ROW_IDS[1], 2, { server: "p2", status: "edited" }),
        gameRow(ROW_IDS[2], 3, { status: "added", seed: null }),
      ],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    const result = await setLabelGameServer(SESSION_ID, GAME, "p2", deps);
    // Each point as it now stands: the winner and ended by are the rows' own
    // when nothing contradicted the new server — here, no strokes at all.
    const own = { gameType: "game", winner: "p1", endedBy: "p1" };
    expect(result).toEqual({
      ok: true,
      points: [
        { id: ROW_IDS[0], server: "p2", status: "edited", ...own },
        { id: ROW_IDS[1], server: "p2", status: "edited", ...own },
        { id: ROW_IDS[2], server: "p2", status: "added", ...own },
      ],
      shots: [],
    });

    const read = fake.calls.find(
      (c) => c.table === "label_points" && c.op === "select",
    );
    expect(read).toMatchObject({
      filters: {
        session_id: SESSION_ID,
        set_number: GAME.setNumber,
        game_number: GAME.gameNumber,
      },
      negated: { status: "deleted" },
    });
    // A server moved, so the game's strokes were read — by the live rows' ids.
    expect(
      fake.calls.find((c) => c.table === "label_shots" && c.op === "select"),
    ).toMatchObject({ in: { label_point_id: ROW_IDS } });

    const updates = fake.calls.filter((c) => c.op === "update");
    expect(updates).toEqual([
      {
        table: "label_points",
        op: "update",
        values: { server: "p2", status: "edited" },
        filters: { id: ROW_IDS[0], updated_at: "2026-10-03T00:00:01Z" },
      },
      {
        table: "label_points",
        op: "update",
        values: { server: "p2", status: "edited" },
        filters: { id: ROW_IDS[1], updated_at: "2026-10-03T00:00:02Z" },
      },
      {
        table: "label_points",
        op: "update",
        values: { server: "p2", status: "added" },
        filters: { id: ROW_IDS[2], updated_at: "2026-10-03T00:00:03Z" },
      },
    ]);
  });

  test("the type operation writes game_type and the rotated server on every row", async () => {
    const fake = fakeClient({
      gamePoints: [
        gameRow(ROW_IDS[0], 1),
        gameRow(ROW_IDS[1], 2),
        gameRow(ROW_IDS[2], 3),
      ],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    const own = { gameType: "tiebreak", winner: "p1", endedBy: "p1" };
    expect(await setLabelGameType(SESSION_ID, GAME, "tiebreak", deps)).toEqual({
      ok: true,
      points: [
        { id: ROW_IDS[0], server: "p1", status: "unchanged", ...own },
        { id: ROW_IDS[1], server: "p2", status: "edited", ...own },
        { id: ROW_IDS[2], server: "p2", status: "edited", ...own },
      ],
      shots: [],
    });
    expect(
      fake.calls.filter((c) => c.op === "update").map((c) => c.values),
    ).toEqual([
      { server: "p1", game_type: "tiebreak", status: "unchanged" },
      { server: "p2", game_type: "tiebreak", status: "edited" },
      { server: "p2", game_type: "tiebreak", status: "edited" },
    ]);
    // The type operation never swaps, so it never reads the strokes.
    expect(fake.calls.some((c) => c.table === "label_shots")).toBe(false);
  });

  test("the server operation swaps the players of each point whose strokes contradict the new server: winner and ended by on the point row, then the strokes grouped by value tuple", async () => {
    const shotRow = (
      id: string,
      pointId: string,
      fields: Record<string, unknown>,
    ) => labelShotRow(id, pointId, fields);
    const fake = fakeClient({
      gamePoints: [
        gameRow(ROW_IDS[0], 1),
        gameRow(ROW_IDS[1], 2, { winner: "p2", ended_by: "p2" }),
        gameRow(ROW_IDS[2], 3, { winner: null, ending: null, ended_by: null }),
      ],
      shots: [
        // Point 1: Lee's serve — contradicts p2.
        shotRow("s-1a", ROW_IDS[0], {
          hitter: "p1",
          stroke: "first_serve",
          video_time: 1,
        }),
        shotRow("s-1b", ROW_IDS[0], {
          hitter: "p2",
          stroke: "backhand",
          video_time: 2,
        }),
        // Point 2: Vargas already serving — only re-served.
        shotRow("s-2a", ROW_IDS[1], {
          hitter: "p2",
          stroke: "first_serve",
          video_time: 3,
        }),
        // Point 3: Lee's serve, a tombstone in the rally, no winner yet.
        shotRow("s-3a", ROW_IDS[2], {
          hitter: "p1",
          stroke: "first_serve",
          video_time: 4,
        }),
        shotRow("s-3b", ROW_IDS[2], {
          hitter: "p1",
          video_time: 5,
          status: "deleted",
          status_before_delete: "kept",
          delete_reason: "other",
        }),
      ],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    const result = await setLabelGameServer(SESSION_ID, GAME, "p2", deps);
    expect(result).toEqual({
      ok: true,
      points: [
        {
          id: ROW_IDS[0],
          server: "p2",
          gameType: "game",
          status: "edited",
          winner: "p2",
          endedBy: "p2",
        },
        {
          id: ROW_IDS[1],
          server: "p2",
          gameType: "game",
          status: "edited",
          winner: "p2",
          endedBy: "p2",
        },
        {
          id: ROW_IDS[2],
          server: "p2",
          gameType: "game",
          status: "edited",
          winner: null,
          endedBy: null,
        },
      ],
      shots: [
        {
          id: "s-1a",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "s-1b",
          hitter: "p1",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "s-3a",
          hitter: "p2",
          status: "edited",
          status_before_delete: null,
          was: "kept",
        },
        {
          id: "s-3b",
          hitter: "p2",
          status: "deleted",
          status_before_delete: "edited",
          was: "deleted",
        },
      ],
    });
    // Points (compare-and-set on updated_at) first, every one, then the strokes.
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_shots", "update"],
      ["label_shots", "update"],
      ["label_shots", "update"],
    ]);
    const updates = fake.calls.filter((c) => c.op === "update");
    expect(updates.slice(0, 3).map((c) => [c.values, c.filters])).toEqual([
      [
        { server: "p2", status: "edited", winner: "p2", ended_by: "p2" },
        { id: ROW_IDS[0], updated_at: "2026-10-03T00:00:01Z" },
      ],
      [
        { server: "p2", status: "edited" },
        { id: ROW_IDS[1], updated_at: "2026-10-03T00:00:02Z" },
      ],
      [
        { server: "p2", status: "edited", winner: null, ended_by: null },
        { id: ROW_IDS[2], updated_at: "2026-10-03T00:00:03Z" },
      ],
    ]);
    expect(updates.slice(3).map((c) => [c.values, c.in])).toEqual([
      [
        { hitter: "p2", status: "edited", status_before_delete: null },
        { id: ["s-1a", "s-3a"] },
      ],
      [
        { hitter: "p1", status: "edited", status_before_delete: null },
        { id: ["s-1b"] },
      ],
      [
        { hitter: "p2", status: "deleted", status_before_delete: "edited" },
        { id: ["s-3b"] },
      ],
    ]);
  });

  test("the strokes are read only once a dry plan moves a server; re-serving the same player reads none", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1), gameRow(ROW_IDS[1], 2)],
      shots: [
        labelShotRow("s-1", ROW_IDS[0], {
          hitter: "p2",
          stroke: "first_serve",
        }),
      ],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    expect(await setLabelGameServer(SESSION_ID, GAME, "p1", deps)).toEqual({
      ok: true,
      points: [
        {
          id: ROW_IDS[0],
          server: "p1",
          gameType: "game",
          status: "unchanged",
          winner: "p1",
          endedBy: "p1",
        },
        {
          id: ROW_IDS[1],
          server: "p1",
          gameType: "game",
          status: "unchanged",
          winner: "p1",
          endedBy: "p1",
        },
      ],
      shots: [],
    });
    expect(fake.calls.some((c) => c.table === "label_shots")).toBe(false);
  });

  test("a row that changed under the plan before any landed makes the game re-read; a persistent race is refused", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1), gameRow(ROW_IDS[1], 2)],
      racedIds: [ROW_IDS[0]],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    expect(await setLabelGameServer(SESSION_ID, GAME, "p2", deps)).toEqual({
      error: "This game changed while it was saving. Try again.",
    });
    // Three attempts, each a fresh read of the game and one write that
    // misses; the second row is never reached, and no stroke is written.
    expect(
      fake.calls.filter((c) => c.table === "label_points" && c.op === "select")
        .length,
    ).toBe(3);
    expect(
      fake.calls.filter((c) => c.op === "update").map((c) => c.filters.id),
    ).toEqual([ROW_IDS[0], ROW_IDS[0], ROW_IDS[0]]);
    // The session was checked once.
    expect(fake.calls.filter((c) => c.table === "label_sessions").length).toBe(
      1,
    );
  });

  test("a row that changed after an earlier one landed is reported, not retried: the landed rows get their flipped strokes, the rest of the game is left", async () => {
    // Rows 1 and 3 were served by Lee and switch under p2; row 2 changed in
    // another tab between the read and its write.
    const fake = fakeClient({
      gamePoints: [
        gameRow(ROW_IDS[0], 1),
        gameRow(ROW_IDS[1], 2),
        gameRow(ROW_IDS[2], 3),
      ],
      shots: [
        labelShotRow("s-1a", ROW_IDS[0], {
          hitter: "p1",
          stroke: "first_serve",
          video_time: 1,
        }),
        labelShotRow("s-1b", ROW_IDS[0], {
          hitter: "p2",
          stroke: "backhand",
          video_time: 2,
        }),
        labelShotRow("s-3a", ROW_IDS[2], {
          hitter: "p1",
          stroke: "first_serve",
          video_time: 3,
        }),
      ],
      racedIds: [ROW_IDS[1]],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    expect(await setLabelGameServer(SESSION_ID, GAME, "p2", deps)).toEqual({
      error: "This row changed in another tab. Reload to see it.",
    });
    // One read of the game — no re-plan over a half-written game — then
    // row 1 landed, row 2 missed, and only row 1's strokes were flipped:
    // row 3's rows were never written, so its strokes stay as they are.
    expect(fake.calls.map((c) => [c.table, c.op])).toEqual([
      ["label_sessions", "select"],
      ["label_points", "select"],
      ["label_shots", "select"],
      ["label_points", "update"],
      ["label_points", "update"],
      ["label_shots", "update"],
      ["label_shots", "update"],
    ]);
    const updates = fake.calls.filter((c) => c.op === "update");
    expect(updates.slice(0, 2).map((c) => c.filters.id)).toEqual([
      ROW_IDS[0],
      ROW_IDS[1],
    ]);
    expect(updates.slice(2).map((c) => [c.values, c.in, c.filters])).toEqual([
      [
        { hitter: "p2", status: "edited", status_before_delete: null },
        { id: ["s-1a"] },
        { status: "kept" },
      ],
      [
        { hitter: "p1", status: "edited", status_before_delete: null },
        { id: ["s-1b"] },
        { status: "kept" },
      ],
    ]);
  });

  test("a stroke deleted or restored in another tab since the read stops the swap with the raced message: each group is compare-and-set on the status read", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1)],
      shots: [
        labelShotRow("s-1a", ROW_IDS[0], {
          hitter: "p1",
          stroke: "first_serve",
          video_time: 1,
        }),
        labelShotRow("s-1b", ROW_IDS[0], {
          hitter: "p1",
          stroke: "forehand",
          video_time: 2,
          status: "deleted",
          status_before_delete: "kept",
          delete_reason: "other",
        }),
      ],
      racedShotIds: ["s-1b"],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    expect(await setLabelGameServer(SESSION_ID, GAME, "p2", deps)).toEqual({
      error: "This row changed in another tab. Reload to see it.",
    });
    // The live serve's group landed on `kept`; the tombstone's, on
    // `deleted`, matched nothing and was neither resurrected nor retried.
    const swaps = fake.calls.filter(
      (c) => c.table === "label_shots" && c.op === "update",
    );
    expect(swaps.map((c) => [c.in, c.filters])).toEqual([
      [{ id: ["s-1a"] }, { status: "kept" }],
      [{ id: ["s-1b"] }, { status: "deleted" }],
    ]);
    for (const swap of swaps) {
      expect(Object.keys(swap.values ?? {})).not.toContain("was");
    }
  });

  test("a game with no live rows, and a missing session, are refused", async () => {
    const empty = fakeClient({ gamePoints: [] });
    expect(
      await writeLabelGameServer({
        supabase: empty.supabase,
        sessionId: SESSION_ID,
        game: GAME,
        server: "p1",
      }),
    ).toEqual({ error: "That game has no live points." });
    expect(empty.calls.some((c) => c.op === "update")).toBe(false);

    const missing = fakeClient({ sessionStatus: null });
    expect(
      await writeLabelGameType({
        supabase: missing.supabase,
        sessionId: SESSION_ID,
        game: GAME,
        type: "game",
      }),
    ).toEqual({ error: "Session not found." });
  });

  test("every service call stays on label_points / label_shots / label_sessions, and is a select or an update", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1), gameRow(ROW_IDS[1], 2)],
      shots: [
        labelShotRow("s-1", ROW_IDS[0], {
          hitter: "p1",
          stroke: "first_serve",
        }),
      ],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    await setLabelGameServer(SESSION_ID, GAME, "p2", deps);
    await setLabelGameType(SESSION_ID, GAME, "match_tiebreak", deps);
    expect(fake.calls.length).toBeGreaterThan(0);
    const POINT_KEYS = ["server", "game_type", "status", "winner", "ended_by"];
    const SHOT_KEYS = ["hitter", "status", "status_before_delete"];
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
      expect(["select", "update"]).toContain(call.op);
      if (call.op === "update") {
        expect(["label_points", "label_shots"]).toContain(call.table);
        const allowed = call.table === "label_points" ? POINT_KEYS : SHOT_KEYS;
        for (const key of Object.keys(call.values ?? {})) {
          expect(allowed).toContain(key);
        }
      }
    }
    // Both tables were written: the point and its flipped serve.
    expect(
      fake.calls.filter((c) => c.op === "update").map((c) => c.table),
    ).toEqual([
      "label_points",
      "label_points",
      "label_shots",
      "label_points",
      "label_points",
    ]);
  });
});

test("no game operation issues a SQL DELETE or INSERT", () => {
  for (const file of [
    "src/lib/services/labels/game-operations.ts",
    "src/lib/services/labels/game-operations-session.ts",
  ]) {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source, file).not.toMatch(/\.delete\s*\(/);
    expect(source, file).not.toMatch(/\.insert\s*\(/);
    expect(source, file).not.toMatch(/from\(\s*["'](points|shots|matches)["']/);
  }
});
