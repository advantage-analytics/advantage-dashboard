import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { planGameServer } from "@/lib/services/labels/game-operations";
import {
  gameServeFix,
  gameServeFixKey,
} from "@/lib/services/labels/game-serve-fix";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
  LabelStroke,
} from "@/lib/services/labels/session";
import { labelPoint, labelShot } from "./fixtures/label-session";

// One player serves every point of an ordinary game: the rule that finds a
// game whose rows say otherwise, and the console running its fix by itself.

/** A vendor stroke: its seed is what it holds. */
function seededShot(id: string, pointId: string, fields: Partial<LabelShot>) {
  const shot = labelShot(id, pointId, fields);
  return {
    ...shot,
    seed: {
      hitter: shot.hitter,
      stroke: shot.stroke,
      result: shot.result,
      spin: shot.spin,
      contact_x: shot.contactX,
      contact_y: shot.contactY,
      landing_x: shot.landingX,
      landing_y: shot.landingY,
      video_time: shot.videoTime,
    },
  };
}

/** A point of game 1 served by `server`, its strokes hit by `hitters` in order. */
function point(
  n: number,
  server: LabelSide | null,
  hitters: LabelSide[],
  over: Partial<LabelPoint> = {},
): LabelPoint {
  const id = `p${n}`;
  return labelPoint(id, n, {
    server,
    winner: "p1",
    ending: "winner",
    shots: hitters.map((hitter, i) =>
      seededShot(`${id}-s${i}`, id, {
        hitter,
        stroke: (i === 0 ? "first_serve" : "forehand") as LabelStroke,
        videoTime: n * 10 + i,
      }),
    ),
    ...over,
  });
}

const served = (n: number, server: LabelSide) =>
  point(n, server, [server, server === "p1" ? "p2" : "p1"]);

test.describe("gameServeFix", () => {
  test("a game whose points all agree needs nothing", () => {
    expect(
      gameServeFix([served(0, "p1"), served(1, "p1"), served(2, "p1")]),
    ).toBeNull();
  });

  test("a stray point takes the game's server, and its players switch with it", () => {
    const rows = [
      served(0, "p1"),
      served(1, "p1"),
      served(2, "p2"),
      served(3, "p1"),
    ];
    const fix = gameServeFix(rows);
    expect(fix).toEqual({
      kind: "server",
      game: { setNumber: 1, gameNumber: 1 },
      server: "p1",
    });
    expect(gameServeFixKey(fix!)).toBe("server:1·1:p1:");
    // What the console then runs: the stray's strokes and winner flip.
    const plan = planGameServer(rows, fix!.game, "p1");
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.shots.map((s) => [s.id, s.hitter])).toEqual([
      ["p2-s0", "p1"],
      ["p2-s1", "p2"],
    ]);
    expect(plan.writes.find((w) => w.id === "p2")).toMatchObject({
      server: "p1",
      winner: "p2",
    });
  });

  test("a stray first point never turns the game round: the majority serves", () => {
    const fix = gameServeFix([
      served(0, "p2"),
      served(1, "p1"),
      served(2, "p1"),
      served(3, "p1"),
    ]);
    expect(fix).toMatchObject({ kind: "server", server: "p1" });
  });

  test("a game split between two servers is left for the labeller to cut", () => {
    expect(
      gameServeFix([
        served(0, "p1"),
        served(1, "p1"),
        served(2, "p2"),
        served(3, "p2"),
      ]),
    ).toBeNull();
  });

  test("a point hit the other way round under the right server switches as a whole", () => {
    const fix = gameServeFix([
      served(0, "p1"),
      point(1, "p1", ["p2", "p1", "p2"]),
      served(2, "p1"),
    ]);
    expect(fix).toEqual({
      kind: "switch",
      game: { setNumber: 1, gameNumber: 1 },
      server: "p1",
      pointIds: ["p1"],
    });
    expect(gameServeFixKey(fix!)).toBe("switch:1·1:p1:p1");
  });

  test("a serve alone given to the wrong player is handed back, the rally left", () => {
    const fix = gameServeFix([
      served(0, "p1"),
      served(2, "p1"),
      // The serve and the return both read as player 2's.
      point(1, "p1", ["p2", "p2", "p1"]),
    ]);
    expect(fix).toEqual({
      kind: "serve-hitter",
      game: { setNumber: 1, gameNumber: 1 },
      server: "p1",
      shotIds: ["p1-s0"],
    });
  });

  test("most of a game hit the other way round is a wrong stored server: left alone", () => {
    // Every point names player 1, every point's strokes read player 2
    // serving. Switching them all would flip the game's winner on a page load.
    const other = (n: number) => point(n, "p1", ["p2", "p1"]);
    expect(gameServeFix([other(0), other(1), other(2), other(3)])).toBeNull();
    expect(
      gameServeFix([served(0, "p1"), served(1, "p1"), other(2), other(3)]),
    ).toBeNull();
  });

  test("a serve the labeller gave its hitter stands", () => {
    // "Only this shot": the serve handed to player 2 by hand, off its seed.
    const byHand = point(1, "p1", ["p2", "p2", "p1"]);
    byHand.shots[0] = {
      ...byHand.shots[0],
      status: "edited",
      seed: { ...byHand.shots[0].seed!, hitter: "p1" },
    };
    expect(gameServeFix([served(0, "p1"), byHand, served(2, "p1")])).toBeNull();
    // An added serve has no seed: the labeller's too.
    const added = point(1, "p1", ["p2", "p1"]);
    added.shots[0] = { ...added.shots[0], status: "added", seed: null };
    expect(gameServeFix([served(0, "p1"), added, served(2, "p1")])).toBeNull();
  });

  test("a stroke typed a serve after the rally began is not re-handed", () => {
    const late = point(1, "p1", ["p1", "p2", "p1", "p2"]);
    late.shots[3] = { ...late.shots[3], stroke: "second_serve" };
    expect(gameServeFix([served(0, "p1"), late, served(2, "p1")])).toBeNull();
  });

  test("tiebreaks, tombstones, unnamed servers and points with no serve are left alone", () => {
    const tiebreak = [served(0, "p1"), served(1, "p2"), served(2, "p2")].map(
      (p) => ({ ...p, gameType: "tiebreak" as const }),
    );
    expect(gameServeFix(tiebreak)).toBeNull();
    expect(
      gameServeFix([
        served(0, "p1"),
        served(1, "p1"),
        served(2, "p1"),
        { ...served(3, "p2"), status: "deleted" as const },
      ]),
    ).toBeNull();
    expect(gameServeFix([point(0, null, ["p1", "p2"])])).toBeNull();
    // No serve stroke: a rally ball by the other player says nothing.
    const noServe = point(1, "p1", ["p2", "p1"]);
    noServe.shots[0].stroke = "forehand";
    expect(gameServeFix([served(0, "p1"), noServe])).toBeNull();
  });

  test("games are taken in point order, one fix at a time", () => {
    const second = (n: number, server: LabelSide) => ({
      ...served(n, server),
      gameNumber: 2,
    });
    const fix = gameServeFix([
      second(4, "p2"),
      second(5, "p2"),
      second(6, "p2"),
      second(7, "p1"),
      served(0, "p1"),
      served(1, "p1"),
      served(2, "p1"),
      served(3, "p2"),
    ]);
    expect(fix?.game).toEqual({ setNumber: 1, gameNumber: 1 });
  });
});

test("the console runs the fix by itself, once, after any cut still to run", () => {
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  expect(source).toContain(
    "if (!autoFixes || !operations || cutPending || gameFixPending) return null;",
  );
  expect(source).toContain("`${session.id}:serve-fix`,");
  expect(source).toContain("setGameServer(serveFix.game, serveFix.server);");
  expect(source).toContain("void switchPlayersByEnd(serveFix.pointIds, true);");
  expect(source).toContain("await patchShot(shotId, { hitter: server });");
});
