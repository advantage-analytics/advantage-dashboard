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
  type GamePoint,
  type GamePointWrite,
} from "@/lib/services/labels/game-operations";
import {
  setLabelGameServer,
  setLabelGameType,
  writeLabelGameServer,
  writeLabelGameType,
} from "@/lib/services/labels/game-operations-session";
import type {
  LabelPointSeedValues,
  LabelSide,
} from "@/lib/services/labels/session";
import { fakeLabelClient, labelSessionFixture } from "./fixtures/label-session";

// Game operations: set a game's server, set a game's type — the pure rules
// and the admin-gated services over a fake client.

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const GAME = { setNumber: 1, gameNumber: 7 };
const OTHER_GAME = { setNumber: 1, gameNumber: 6 };

type PointFields = Partial<Omit<GamePoint, "seed">> & {
  /** Null: no seed. A partial: the seed is the point's values with these over it. */
  seed?: Partial<LabelPointSeedValues> | null;
};

/** A point of GAME, `unchanged`, served by `server`, seeded as it stands. */
function point(
  id: string,
  pointIndex: number,
  fields: PointFields = {},
): GamePoint {
  const { seed: seedFields, ...rest } = fields;
  const base: GamePoint = {
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
function tiebreakPoints(first: LabelSide = "p1"): GamePoint[] {
  return Array.from({ length: 9 }, (_, i) =>
    point(`tb-${i + 1}`, 100 + i, {
      server: first,
      gameType: "tiebreak",
      ...(i === 3 ? { ending: "let_replayed", winner: null } : {}),
    }),
  );
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
});

// ── The services, over a fake client ───────────────────────────────────────

function fakeClient(rows: {
  gamePoints?: Record<string, unknown>[];
  sessionStatus?: string | null;
  /** Ids whose compare-and-set matches nothing — another tab got there first. */
  racedIds?: string[];
}) {
  return fakeLabelClient((call) => {
    if (call.op === "update") {
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
    expect(result).toEqual({
      ok: true,
      points: [
        { id: ROW_IDS[0], server: "p2", gameType: "game", status: "edited" },
        { id: ROW_IDS[1], server: "p2", gameType: "game", status: "edited" },
        { id: ROW_IDS[2], server: "p2", gameType: "game", status: "added" },
      ],
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
    expect(await setLabelGameType(SESSION_ID, GAME, "tiebreak", deps)).toEqual({
      ok: true,
      points: [
        {
          id: ROW_IDS[0],
          server: "p1",
          gameType: "tiebreak",
          status: "unchanged",
        },
        {
          id: ROW_IDS[1],
          server: "p2",
          gameType: "tiebreak",
          status: "edited",
        },
        {
          id: ROW_IDS[2],
          server: "p2",
          gameType: "tiebreak",
          status: "edited",
        },
      ],
    });
    expect(
      fake.calls.filter((c) => c.op === "update").map((c) => c.values),
    ).toEqual([
      { server: "p1", game_type: "tiebreak", status: "unchanged" },
      { server: "p2", game_type: "tiebreak", status: "edited" },
      { server: "p2", game_type: "tiebreak", status: "edited" },
    ]);
  });

  test("a row that changed under the plan makes the game re-read; a persistent race is refused", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1), gameRow(ROW_IDS[1], 2)],
      racedIds: [ROW_IDS[1]],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    expect(await setLabelGameServer(SESSION_ID, GAME, "p2", deps)).toEqual({
      error: "This game changed while it was saving. Try again.",
    });
    // Three attempts, each a fresh read of the game.
    expect(
      fake.calls.filter((c) => c.table === "label_points" && c.op === "select")
        .length,
    ).toBe(3);
    // The session was checked once.
    expect(fake.calls.filter((c) => c.table === "label_sessions").length).toBe(
      1,
    );
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

  test("every service call stays on label_points / label_sessions, and is a select or an update", async () => {
    const fake = fakeClient({
      gamePoints: [gameRow(ROW_IDS[0], 1), gameRow(ROW_IDS[1], 2)],
    });
    const deps = { ...ADMIN, createAdminClient: () => fake.supabase };
    await setLabelGameServer(SESSION_ID, GAME, "p2", deps);
    await setLabelGameType(SESSION_ID, GAME, "match_tiebreak", deps);
    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|sessions)$/);
      expect(["select", "update"]).toContain(call.op);
      if (call.op === "update") {
        expect(call.table).toBe("label_points");
        for (const key of Object.keys(call.values ?? {})) {
          expect(["server", "game_type", "status"]).toContain(key);
        }
      }
    }
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
