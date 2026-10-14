import { expect, test } from "@playwright/test";

import { labelConfirmCopy } from "@/components/admin/labels/label-confirm";
import {
  dropBeforePoint,
  planGameBoundary,
} from "@/lib/services/labels/game-boundary";
import {
  planGameServer,
  type GameServerPoint,
} from "@/lib/services/labels/game-operations";
import type { SwapShot } from "@/lib/services/labels/player-swap";
import { planServeHitterFollow } from "@/lib/services/labels/serve-hitter";
import { completeWarnings } from "@/lib/services/labels/session-status";
import {
  firstServeFaultAlone,
  markState,
  serveInLandingOut,
} from "@/lib/services/labels/marks-state";
import {
  openFlags,
  slotStops,
  tiebreakServeStops,
} from "@/lib/services/labels/flag-nav";
import {
  liveRowMarks,
  withLiveScoreMarks,
} from "@/lib/services/labels/score-marks";
import { labelSessionFixture } from "./fixtures/label-session";
import type {
  LabelGameType,
  LabelPoint,
  LabelShot,
  LabelSide,
  LabelStroke,
} from "@/lib/services/labels/session";
import {
  tiebreakServeBeforePoints,
  tiebreakServeOrders,
  tiebreakServeReason,
} from "@/lib/services/labels/tiebreak-serve";

// A serve given to the other player asks whether the rest follows it
// (serve-hitter.ts), and a tiebreak is held to its one-then-two-each serve
// order while its rows are edited (tiebreak-serve.ts).

const NAMES = { p1: "Lee", p2: "Kim" };

function shot(
  id: string,
  hitter: LabelSide | null,
  stroke: LabelStroke | null,
  videoTime: number,
): SwapShot {
  return {
    id,
    eventId: null,
    status: "kept",
    statusBeforeDelete: null,
    seed: null,
    hitter,
    stroke,
    result: null,
    spin: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime,
  };
}

/** A point served by `serves`, its rally alternating behind the serve. */
function point(
  index: number,
  server: LabelSide | null,
  serves: LabelSide | null,
  fields: Partial<GameServerPoint> = {},
): GameServerPoint {
  const id = `p${index + 1}`;
  const other = serves === "p1" ? "p2" : "p1";
  return {
    id,
    pointIndex: index,
    status: "unchanged",
    server,
    setNumber: 1,
    gameNumber: 1,
    serveSide: null,
    winner: serves,
    ending: null,
    endedBy: null,
    gameType: "game",
    seed: null,
    shots:
      serves === null
        ? []
        : [
            shot(`${id}-s`, serves, "first_serve", index * 10),
            shot(`${id}-r`, other, "forehand", index * 10 + 1),
            shot(`${id}-3`, serves, "forehand", index * 10 + 2),
          ],
    ...fields,
  };
}

/** A tiebreak whose points are served, and stored, as `servers` says. */
function tiebreak(
  servers: readonly LabelSide[],
  type: LabelGameType = "tiebreak",
): GameServerPoint[] {
  return servers.map((server, i) =>
    point(i, server, server, { gameNumber: 13, gameType: type }),
  );
}

const ORDER: LabelSide[] = ["p1", "p2", "p2", "p1", "p1", "p2", "p2"];

test.describe("a serve given to the other player", () => {
  test("in a game the old hitter serves, the game's server follows it", () => {
    const rows = [
      point(0, "p1", "p1"),
      point(1, "p1", "p1"),
      point(2, "p1", "p1"),
    ];
    const follow = planServeHitterFollow(rows, "p2-s", "p2");
    expect(follow).toEqual({
      pointId: "p2",
      hitter: "p2",
      point: "shots-and-winner",
      game: {
        game: { setNumber: 1, gameNumber: 1 },
        type: "game",
        first: "p2",
        points: 3,
        switched: 2,
      },
      run: "game-server",
    });
    // The operation it names flips the edited point whole, serve included.
    const plan = planGameServer(rows, follow!.game!.game, follow!.game!.first);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.shots.filter((s) => s.id.startsWith("p2-"))).toEqual([
      expect.objectContaining({ id: "p2-s", hitter: "p2" }),
      expect.objectContaining({ id: "p2-r", hitter: "p1" }),
      expect.objectContaining({ id: "p2-3", hitter: "p2" }),
    ]);
  });

  test("the point's server already the new hitter: only the point switches", () => {
    const rows = [point(0, "p2", "p2"), point(1, "p2", "p1")];
    expect(planServeHitterFollow(rows, "p2-s", "p2")).toEqual({
      pointId: "p2",
      hitter: "p2",
      point: "shots-and-winner",
      game: null,
      run: "switch-point",
    });
  });

  test("only the serve was wrong: nothing on the point follows, the game still does", () => {
    // Serve and return both read Lee: the serve alone is Kim's.
    const wrong = point(0, "p1", "p1");
    const shots = wrong.shots.map((s) =>
      s.id === "p1-r" ? { ...s, hitter: "p1" as const } : s,
    );
    const rows = [{ ...wrong, shots }, point(1, "p1", "p2")];
    const follow = planServeHitterFollow(rows, "p1-s", "p2");
    expect(follow?.run).toBe("patch-then-game-server");
    expect(follow?.point).toBeNull();
    expect(follow?.game?.switched).toBe(0);
    // With the server right already, it is the edit and nothing else.
    expect(
      planServeHitterFollow([{ ...wrong, server: "p2", shots }], "p1-s", "p2"),
    ).toBeNull();
  });

  test("not asked of a rally ball, the same player, a blank or a lone serve", () => {
    const rows = [point(0, "p1", "p1")];
    expect(planServeHitterFollow(rows, "p1-r", "p1")).toBeNull();
    expect(planServeHitterFollow(rows, "p1-s", "p1")).toBeNull();
    expect(planServeHitterFollow(rows, "p1-s", null)).toBeNull();
    const lone = point(0, "p2", "p1", { winner: null });
    expect(
      planServeHitterFollow(
        [{ ...lone, shots: lone.shots.slice(0, 1) }],
        "p1-s",
        "p2",
      ),
    ).toBeNull();
  });

  test("in a tiebreak the order is rebuilt so the point is the new hitter's", () => {
    const rows = tiebreak(ORDER);
    // Point 2 is Kim's in Lee's order; given to Lee, Kim must serve first.
    const follow = planServeHitterFollow(rows, "p2-s", "p1");
    expect(follow?.game).toMatchObject({
      type: "tiebreak",
      first: "p2",
      points: 7,
      switched: 6,
    });
  });

  test("the confirm says what follows, and offers the edit alone", () => {
    const rows = [point(0, "p1", "p1"), point(1, "p1", "p1")];
    const follow = planServeHitterFollow(rows, "p2-s", "p2")!;
    const copy = labelConfirmCopy(
      {
        kind: "serve-hitter",
        shotId: "p2-s",
        pointNumber: 2,
        gameInSet: 1,
        follow,
      },
      NAMES,
    );
    expect(copy.title).toBe("Kim served point 2, change the game's server?");
    expect(copy.description).toBe(
      "Kim becomes the server of all 2 points in set 1, game 1. Every other shot in point 2 changes hands, and so does who won it. The players switch on 1 other point too.",
    );
    expect(copy.confirmLabel).toBe("Change server");
    expect(copy.alternativeLabel).toBe("Only this shot");

    const alone = planServeHitterFollow([point(0, "p2", "p1")], "p1-s", "p2")!;
    expect(
      labelConfirmCopy(
        {
          kind: "serve-hitter",
          shotId: "p1-s",
          pointNumber: 1,
          gameInSet: 1,
          follow: alone,
        },
        NAMES,
      ),
    ).toMatchObject({
      title: "Kim served point 1, switch the other shots?",
      description:
        "Every other shot in point 1 changes hands, and so does who won it.",
      confirmLabel: "Switch players",
    });
  });
});

test.describe("a tiebreak's serve order", () => {
  test("one, then two each in turn: nothing to say", () => {
    expect(tiebreakServeOrders(tiebreak(ORDER))).toEqual([]);
    expect(tiebreakServeOrders(tiebreak(ORDER, "match_tiebreak"))).toEqual([]);
  });

  test("an ordinary game is never read against it", () => {
    expect(
      tiebreakServeOrders([point(0, "p1", "p1"), point(1, "p1", "p2")]),
    ).toEqual([]);
  });

  test("a serve hit by the other player is off it", () => {
    const rows = tiebreak(ORDER);
    rows[3] = point(3, "p1", "p2", { gameNumber: 13, gameType: "tiebreak" });
    const [order] = tiebreakServeOrders(rows);
    expect(order).toMatchObject({
      game: { setNumber: 1, gameNumber: 13 },
      first: "p1",
      switched: 1,
      off: [
        {
          pointId: "p4",
          pointNumber: 4,
          expected: "p1",
          server: "p1",
          serve: "p2",
        },
      ],
    });
    expect(tiebreakServeReason(order, NAMES)).toBe(
      "Lee serves point 4, not Kim",
    );
    expect([...tiebreakServeBeforePoints([order]).keys()]).toEqual(["p4"]);
  });

  test("a point added mid-tiebreak shifts every turn behind it", () => {
    const rows = tiebreak(ORDER);
    // A new row after point 2, no strokes yet, given the server beside it.
    const added = point(2, "p2", null, {
      id: "new",
      gameNumber: 13,
      gameType: "tiebreak",
    });
    const shifted = [
      ...rows.slice(0, 2),
      added,
      ...rows.slice(2).map((p) => ({ ...p, pointIndex: p.pointIndex + 1 })),
    ];
    const [order] = tiebreakServeOrders(shifted);
    // The strokes still say Lee served first; every point behind the new one
    // is now a turn late, and the fix re-serves them.
    expect(order.first).toBe("p1");
    expect(order.off.length).toBeGreaterThan(1);
    expect(tiebreakServeReason(order, NAMES)).toBe(
      `${order.off.length} points are off the one-then-two-each order`,
    );
    const plan = planGameServer(shifted, order.game, order.first);
    if ("error" in plan) throw new Error(plan.error);
    const fixed = shifted.map((p) => {
      const write = plan.writes.find((w) => w.id === p.id)!;
      const flips = new Map(plan.shots.map((s) => [s.id, s.hitter]));
      return {
        ...p,
        server: write.server,
        shots: p.shots.map((s) => ({
          ...s,
          hitter: flips.get(s.id) ?? s.hitter,
        })),
      };
    });
    expect(tiebreakServeOrders(fixed)).toEqual([]);
  });

  test("a replayed let takes no turn", () => {
    const rows = tiebreak(["p1", "p2", "p2", "p2", "p1", "p1"]);
    rows[1] = { ...rows[1], ending: "let_replayed" };
    expect(tiebreakServeOrders(rows)).toEqual([]);
  });

  test("the strokes outvote the stored first server", () => {
    // Stored as Lee's order, but every serve was hit the other way round.
    const rows = ORDER.map((server, i) =>
      point(i, server, server === "p1" ? "p2" : "p1", {
        gameNumber: 13,
        gameType: "tiebreak",
      }),
    );
    const [order] = tiebreakServeOrders(rows);
    expect(order.first).toBe("p2");
    expect(order.off).toHaveLength(7);
    expect(order.switched).toBe(0);
  });

  test("Mark complete lists it", () => {
    const rows = tiebreak(ORDER);
    rows[3] = point(3, "p1", "p2", { gameNumber: 13, gameType: "tiebreak" });
    const warnings = completeWarnings({
      points: rows.map(asLabelPoint),
      adScoring: true,
      marks: null,
      finalScore: null,
      videoEndsEarly: true,
      matchScore: null,
    });
    expect(warnings).toContain(
      "Set 1's tiebreak is off its serve order on 1 point",
    );
  });
});

function asLabelPoint(row: GameServerPoint): LabelPoint {
  return {
    vendorRallyIds: [],
    statusBeforeDelete: null,
    checkedAt: null,
    note: null,
    dismissed: [],
    ...row,
  } as unknown as LabelPoint;
}

test.describe("a game's header dragged to where the game starts", () => {
  // Game 1: p1–p3. Game 2: p4–p6. Game 3: p7.
  const rows = [1, 1, 1, 2, 2, 2, 3].map((gameNumber, i) =>
    point(i, gameNumber % 2 === 1 ? "p1" : "p2", null, { gameNumber }),
  );
  const game2 = { setNumber: 1, gameNumber: 2 };
  const plan = (before: string) => planGameBoundary(rows, game2, before);

  test("up: the end of the game before joins it, nearest first", () => {
    expect(plan("p2")).toEqual({
      ok: true,
      write: { to: game2, pointIds: ["p3", "p2"] },
    });
  });

  test("down: its first points go back a game, in order", () => {
    expect(plan("p6")).toEqual({
      ok: true,
      write: {
        to: { setNumber: 1, gameNumber: 1 },
        pointIds: ["p4", "p5"],
      },
    });
  });

  test("where it already is: nothing moves", () => {
    expect(plan("p4")).toEqual({
      ok: true,
      write: { to: game2, pointIds: [] },
    });
  });

  test("refused past either game, and where a game would be left empty", () => {
    expect(plan("p1")).toHaveProperty("error");
    expect(plan("p7")).toHaveProperty("error");
    expect(
      planGameBoundary(rows, { setNumber: 1, gameNumber: 1 }, "p2"),
    ).toHaveProperty("error");
  });

  test("a deleted row is stepped over", () => {
    const withGap = rows.map((row) =>
      row.id === "p3" ? { ...row, status: "deleted" as const } : row,
    );
    expect(planGameBoundary(withGap, game2, "p2")).toEqual({
      ok: true,
      write: { to: game2, pointIds: ["p2"] },
    });
    expect(dropBeforePoint(withGap, "p2", false)).toBe("p4");
    expect(dropBeforePoint(withGap, "p2", true)).toBe("p2");
    expect(dropBeforePoint(withGap, "p7", false)).toBeNull();
  });

  test("the confirm, asked only when players switch", () => {
    expect(
      labelConfirmCopy(
        {
          kind: "move-boundary",
          to: game2,
          gameInSet: 2,
          pointIds: ["p3", "p2"],
          server: "p2",
          swaps: 1,
        },
        NAMES,
      ),
    ).toMatchObject({
      title: "Move 2 points to game 2?",
      description:
        "Kim serves set 1, game 2, and becomes the server of these points. On 1 of them, every shot changes hands, and so does who won it.",
      confirmLabel: "Move points",
    });
  });
});

test.describe("a point that stops on a missed first serve", () => {
  const serve = (
    id: string,
    stroke: LabelStroke,
    result: "in" | "out" | "net" | null,
    videoTime: number,
  ) => ({ ...shot(id, "p1", stroke, videoTime), result }) as LabelShot;
  const lone = (shots: LabelShot[], ending: LabelPoint["ending"] = null) =>
    firstServeFaultAlone({ shots, ending }, true)?.code ?? null;

  test("flagged: out or net, and nothing after it", () => {
    expect(lone([serve("a", "first_serve", "out", 1)])).toBe(
      "first_serve_fault_alone",
    );
    expect(lone([serve("a", "first_serve", "net", 1)])).toBe(
      "first_serve_fault_alone",
    );
  });

  test("not once a second serve or a rally follows, nor on a serve in, a second serve, a let or a non-point", () => {
    expect(
      lone([
        serve("a", "first_serve", "out", 1),
        serve("b", "second_serve", "out", 2),
      ]),
    ).toBeNull();
    expect(
      lone([
        serve("a", "first_serve", "out", 1),
        serve("b", "forehand", null, 2),
      ]),
    ).toBeNull();
    expect(lone([serve("a", "first_serve", "in", 1)])).toBeNull();
    expect(lone([serve("a", "second_serve", "out", 1)])).toBeNull();
    expect(
      lone([serve("a", "first_serve", "out", 1)], "not_a_point"),
    ).toBeNull();
    expect(lone([])).toBeNull();
  });

  test("counted with the row marks, and still open on an edited point", () => {
    const row = {
      id: "p1",
      status: "edited" as const,
      ending: null,
      shots: [serve("a", "first_serve", "out", 1)],
    };
    const [mark] = liveRowMarks([row]).p1;
    expect(mark).toMatchObject({
      code: "first_serve_fault_alone",
      tier: "count",
    });
    expect(
      markState(mark, { ...row, checkedAt: null, dismissed: [] } as never),
    ).toBe("open");
  });
});

test.describe("the new flags are stops for ] and the header's count", () => {
  test("a lone first-serve fault, through the live marks", () => {
    const base = labelSessionFixture().points;
    const [first] = base;
    const lone: LabelPoint = {
      ...first,
      status: "edited",
      checkedAt: null,
      ending: null,
      shots: [
        {
          ...first.shots[0],
          status: "kept",
          stroke: "first_serve",
          result: "out",
          landingX: null,
          landingY: null,
        },
      ],
    };
    const points = [lone, ...base.slice(1)];
    const marks = withLiveScoreMarks(
      { points: {}, shots: {}, suggestions: [], serveSides: {} } as never,
      points,
      true,
    );
    expect(openFlags(points, marks)).toContainEqual({
      pointId: lone.id,
      pointNumber: lone.pointIndex + 1,
      code: "first_serve_fault_alone",
      data: false,
    });
  });

  test("a tiebreak off its serve order, on the first point off it", () => {
    const rows = tiebreak(ORDER);
    rows[3] = point(3, "p1", "p2", { gameNumber: 13, gameType: "tiebreak" });
    expect(tiebreakServeStops(tiebreakServeOrders(rows))).toEqual([
      { pointId: "p4", pointNumber: 4, label: "Tiebreak serve order is off" },
    ]);
  });
});

test("every amber slot between the rows is a stop", () => {
  // Game 1 runs over (Lee wins four, then one more row); game 2 stops short.
  const rows = [1, 1, 1, 1, 1, 2, 2, 3].map((gameNumber, i) =>
    asLabelPoint(point(i, "p1", "p1", { gameNumber })),
  );
  expect(slotStops(rows, true).map((s) => [s.pointId, s.label])).toEqual([
    ["p5", "Game already won, with points after it"],
    ["p7", "Game 2 isn’t finished at 30–0"],
  ]);
});

test.describe("a serve stored in whose landing is outside the box", () => {
  // Hit from the deuce side behind the baseline; the box is across the net.
  const placed = (
    result: "in" | "out",
    landing: { x: number; y: number },
    stroke: LabelStroke = "first_serve",
  ): LabelShot =>
    ({
      ...shot("a", "p1", stroke, 1),
      result,
      contactX: 1,
      contactY: 0,
      landingX: landing.x,
      landingY: landing.y,
    }) as LabelShot;
  // Far past the service line: out by its coordinates.
  const LONG = { x: -1, y: 23 };

  test("a quiet hint on the serve, and no fault flag: the row and the publish say in", () => {
    const shots = [placed("in", LONG)];
    expect(serveInLandingOut({ shots }, true)).toMatchObject({
      code: "serve_in_landing_out",
      tier: "hint",
      params: { shotId: "a", landing: "out" },
    });
    expect(firstServeFaultAlone({ shots, ending: null }, true)).toBeNull();
  });

  test("stored out with the same landing is the fault flag, not this hint", () => {
    const shots = [placed("out", LONG)];
    expect(serveInLandingOut({ shots }, true)).toBeNull();
    expect(firstServeFaultAlone({ shots, ending: null }, true)?.code).toBe(
      "first_serve_fault_alone",
    );
  });

  test("nothing with no landing placed, and nothing on a rally ball", () => {
    expect(
      serveInLandingOut(
        { shots: [{ ...placed("in", LONG), landingX: null, landingY: null }] },
        true,
      ),
    ).toBeNull();
    expect(
      serveInLandingOut({ shots: [placed("in", LONG, "forehand")] }, true),
    ).toBeNull();
  });
});

test("a lone serve with a winner: the confirm names the winner, not shots that are not there", () => {
  const ace = point(0, "p2", "p1");
  const follow = planServeHitterFollow(
    [{ ...ace, shots: ace.shots.slice(0, 1) }],
    "p1-s",
    "p2",
  )!;
  expect(follow).toMatchObject({ point: "winner", run: "switch-point" });
  expect(
    labelConfirmCopy(
      {
        kind: "serve-hitter",
        shotId: "p1-s",
        pointNumber: 1,
        gameInSet: 1,
        follow,
      },
      NAMES,
    ),
  ).toMatchObject({
    title: "Kim served point 1, switch who won it?",
    description: "Who won point 1 changes with it.",
  });
});
