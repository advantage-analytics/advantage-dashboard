import { expect, test } from "@playwright/test";

import {
  HAND_LABELLED_FLAG,
  buildAppliedRows,
  expectedStats,
  pointInsertRow,
  pointScoreOf,
  resultTypeOf,
  shotResultOf,
  shotTypeOf,
  spinTypeOf,
  vendorShotFacts,
  type AppliedPointRow,
} from "@/lib/services/labels/apply";
import {
  labelShotResult,
  labelSpin,
  labelStroke,
} from "@/lib/services/labels/seed";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
  LabelStroke,
} from "@/lib/services/labels/session";
import { labelPoint, labelShot } from "./fixtures/label-session";

/**
 * The inverse of the label seed: a completed session's rows back into
 * `points` / `shots` insert rows (scripts/label-apply.ts). Anonymised: the
 * sides are p1 and p2 and nothing here names a player.
 */

test.describe("vocabulary: the seed's mappings, inverted", () => {
  test("result_type from the ending and the last stroke's side", () => {
    expect(resultTypeOf("ace", "first_serve")).toBe("Ace");
    expect(resultTypeOf("double_fault", "second_serve")).toBe("Double Fault");
    expect(resultTypeOf("service_winner", "backhand")).toBe("Service Winner");
    expect(resultTypeOf("winner", "forehand")).toBe("Forehand Winner");
    expect(resultTypeOf("winner", "backhand")).toBe("Backhand Winner");
    expect(resultTypeOf("winner", "overhead")).toBe("Overhead Winner");
    // A volley names no side.
    expect(resultTypeOf("winner", "forehand_volley")).toBe("Winner");
    expect(resultTypeOf("winner", "backhand_volley")).toBe("Winner");
    // Every error is unforced: the one error string the stats count.
    expect(resultTypeOf("error", "forehand")).toBe("Forehand Unforced Error");
    expect(resultTypeOf("error", "backhand")).toBe("Backhand Unforced Error");
    expect(resultTypeOf("error", "backhand_volley")).toBe("Unforced Error");
    expect(resultTypeOf("error", null)).toBe("Unforced Error");
    expect(resultTypeOf("let_replayed", "first_serve")).toBeNull();
    expect(resultTypeOf("not_a_point", null)).toBeNull();
    expect(resultTypeOf(null, "forehand")).toBeNull();
  });

  test("shot_type, result and spin round-trip through the seed's mappings", () => {
    const strokes: LabelStroke[] = [
      "first_serve",
      "second_serve",
      "forehand",
      "backhand",
      "overhead",
    ];
    for (const stroke of strokes) {
      expect(labelStroke(shotTypeOf(stroke), null)).toBe(stroke);
    }
    // Volleys are filed as a bare `Volley`, as the derivation files them.
    expect(shotTypeOf("forehand_volley")).toBe("Volley");
    expect(labelStroke(shotTypeOf("backhand_volley"), "backhand")).toBe(
      "backhand_volley",
    );
    expect(shotTypeOf(null)).toBeNull();

    for (const result of ["in", "out", "net"] as const) {
      expect(labelShotResult(shotResultOf(result))).toBe(result);
    }
    expect(shotResultOf("let")).toBeNull();
    expect(shotResultOf(null)).toBeNull();

    for (const spin of ["topspin", "flat", "backspin", "sidespin"] as const) {
      expect(labelSpin(spinTypeOf(spin))).toBe(spin);
    }
    expect(spinTypeOf("topspin")).toBe("Topspin");
    expect(spinTypeOf(null)).toBeNull();
  });

  test("the scoreboard's call becomes a server-first point_score", () => {
    expect(pointScoreOf("0–0")).toBe("0-0");
    expect(pointScoreOf("30–15")).toBe("30-15");
    expect(pointScoreOf("Ad–40")).toBe("AD-40");
    expect(pointScoreOf("40–Ad")).toBe("40-AD");
    expect(pointScoreOf("3–2")).toBe("3-2");
    // A point past the end of its game has no honest starting score.
    expect(pointScoreOf("Game–30")).toBeNull();
    expect(pointScoreOf(null)).toBeNull();
  });
});

// ── A small session: one full game served by p1, then one point of game 2 ──

let clock = 100;
let id = 0;
function shot(
  pointId: string,
  hitter: LabelSide,
  stroke: LabelStroke,
  result: LabelShot["result"],
  fields: Partial<LabelShot> = {},
): LabelShot {
  clock += 1;
  id += 1;
  return labelShot(`s-${id}`, pointId, {
    eventId: 1000 + id,
    hitter,
    stroke,
    result,
    videoTime: clock,
    ...fields,
  });
}

function pt(
  index: number,
  winner: LabelSide | null,
  ending: LabelPoint["ending"],
  build: (pointId: string) => LabelShot[],
  fields: Partial<LabelPoint> = {},
): LabelPoint {
  const pointId = `p-${index}`;
  return labelPoint(pointId, index, {
    winner,
    ending,
    shots: build(pointId),
    ...fields,
  });
}

function session(): LabelPoint[] {
  clock = 100;
  id = 0;
  return [
    // 0–0: an ace.
    pt(0, "p1", "ace", (p) => [shot(p, "p1", "first_serve", "in")]),
    // 15–0: a double fault.
    pt(1, "p2", "double_fault", (p) => [
      shot(p, "p1", "first_serve", "out"),
      shot(p, "p1", "second_serve", "net"),
    ]),
    // 15–15: a let, the serve replayed, then a forehand winner.
    pt(2, "p1", "winner", (p) => [
      shot(p, "p1", "first_serve", "let"),
      shot(p, "p1", "first_serve", "in"),
      shot(p, "p2", "backhand", "in"),
      shot(p, "p1", "forehand", "in"),
    ]),
    // A tombstone: never written.
    pt(
      3,
      "p2",
      "winner",
      (p) => [shot(p, "p2", "forehand", "in", { status: "deleted" })],
      { status: "deleted", statusBeforeDelete: "unchanged" },
    ),
    // A replayed let as its own row: never written.
    pt(4, null, "let_replayed", (p) => [shot(p, "p1", "first_serve", "let")]),
    // 30–15: an error, around a ghost, a deleted stroke and a restored ghost.
    pt(5, "p2", "error", (p) => [
      shot(p, "p1", "first_serve", "out"),
      shot(p, "p2", "forehand", null, { siteRemoval: "hit_after_fault" }),
      shot(p, "p1", "second_serve", "in"),
      shot(p, "p2", "forehand", "in", {
        siteRemoval: "hit_after_fault",
        siteRemovalRestoredAt: "2026-10-01T00:00:00Z",
      }),
      shot(p, "p1", "forehand", "in", {
        status: "deleted",
        statusBeforeDelete: "kept",
      }),
      shot(p, "p1", "backhand", "out"),
    ]),
    // 30–30: a return volley winner.
    pt(6, "p2", "winner", (p) => [
      shot(p, "p1", "first_serve", "in"),
      shot(p, "p2", "forehand_volley", "in"),
    ]),
    // 30–40, break point: the return missed.
    pt(7, "p1", "service_winner", (p) => [
      shot(p, "p1", "first_serve", "in", { landingX: 0.4, landingY: 18 }),
      shot(p, "p2", "backhand", "out"),
    ]),
    // 40–40: an ace.
    pt(8, "p1", "ace", (p) => [shot(p, "p1", "first_serve", "in")]),
    // Ad–40: game p1.
    pt(9, "p1", "winner", (p) => [
      shot(p, "p1", "first_serve", "in"),
      shot(p, "p2", "forehand", "in", { contactX: 2, landingX: -3 }),
      shot(p, "p1", "overhead", "in"),
    ]),
    // Game 2, served by p2.
    pt(
      10,
      "p2",
      "ace",
      (p) => [shot(p, "p2", "first_serve", "in", { landingX: -3.1 })],
      { gameNumber: 2, server: "p2" },
    ),
  ];
}

function build(points = session()) {
  return buildAppliedRows({ points, adScoring: true, bestOf: 3 });
}

test.describe("buildAppliedRows", () => {
  test("skips tombstones and let_replayed / not_a_point rows", () => {
    const { points, problems, warnings } = build();
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(points.map((p) => p.pointIndex)).toEqual([
      0, 1, 2, 5, 6, 7, 8, 9, 10,
    ]);
    expect(points.map((p) => p.point_number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);

    const notAPoint = session().map((p) =>
      p.pointIndex === 0 ? { ...p, ending: "not_a_point" as const } : p,
    );
    expect(build(notAPoint).points.map((p) => p.pointIndex)).not.toContain(0);
  });

  test("maps every ending to its result_type", () => {
    expect(build().points.map((p) => p.result_type)).toEqual([
      "Ace",
      "Double Fault",
      "Forehand Winner",
      "Backhand Unforced Error",
      "Winner",
      "Service Winner",
      "Ace",
      "Overhead Winner",
      "Ace",
    ]);
  });

  test("scores each point from the scoreboard, server-first", () => {
    const { points } = build();
    expect(points.map((p) => p.point_score)).toEqual([
      "0-0",
      "15-0",
      "15-15",
      "30-15",
      "30-30",
      "30-40",
      "40-40",
      "AD-40",
      "0-0",
    ]);
    // Game 2 is served by p2, who has won no game: server-first 0-1.
    const last = points.at(-1)!;
    expect(last.server_is_player1).toBe(false);
    expect(last.game_score).toBe("0-1");
    expect(last.set_score).toBe("0-0");
    expect(points[0].game_score).toBe("0-0");
  });

  test("30–40 on p1's serve is p2's break point, and nothing else is", () => {
    const { points } = build();
    expect(
      points.filter((p) => p.is_break_point).map((p) => p.point_score),
    ).toEqual(["30-40"]);
  });

  test("a let serve is not written: it neither counts nor shifts the serve", () => {
    const point = build().points[2];
    expect(point.shots.map((s) => s.shot_type)).toEqual([
      "First Serve",
      "Backhand",
      "Forehand",
    ]);
    expect(point.shots.map((s) => s.shot_number)).toEqual([1, 2, 3]);
    expect(point.rally_length).toBe(3);
    // The clip window still opens on the let.
    expect(point.video_time).toBe(104);
    expect(point.duration).toBe(3);
  });

  test("a deleted stroke and an unrestored ghost are left out; a restored one is kept", () => {
    const point = build().points[3];
    expect(
      point.shots.map((s) => [s.shot_number, s.shot_type, s.result]),
    ).toEqual([
      [0, "First Serve", "Out"],
      [1, "Second Serve", "In"],
      [2, "Forehand", "In"],
      [3, "Backhand", "Out"],
    ]);
    expect(point.rally_length).toBe(3);
    expect(point.won_by_player1).toBe(false);
  });

  test("a double fault numbers its faulted first serve 0", () => {
    const point = build().points[1];
    expect(point.shots.map((s) => s.shot_number)).toEqual([0, 1]);
    expect(point.rally_length).toBe(1);
    expect(point.won_by_player1).toBe(false);
  });

  test("rows are derived, flagged hand_labelled, and oriented p1 = player1", () => {
    const { points } = build();
    for (const point of points) {
      expect(point.flags).toEqual([HAND_LABELLED_FLAG]);
      expect(point.derived).toBe(true);
      for (const s of point.shots) expect(s.derived).toBe(true);
    }
    const rally = points[2];
    expect(rally.shots.map((s) => s.is_player1)).toEqual([true, false, true]);
    expect(rally.server_is_player1).toBe(true);
    expect(rally.won_by_player1).toBe(true);
  });

  test("zones: a serve by landing, a rally ball by direction", () => {
    const { points } = build();
    expect(points[5].shots[0].zone).toBe("T");
    expect(points[8].shots[0].zone).toBe("Wide");
    // Struck from +x, landing on -x: crosscourt.
    expect(points[7].shots[1].zone).toBe("Crosscourt");
  });

  test("a point with no winner is a problem, not a row", () => {
    const points = session().map((p) =>
      p.pointIndex === 6 ? { ...p, winner: null } : p,
    );
    const built = build(points);
    expect(built.problems).toEqual(["point 7: no winner"]);
    expect(built.points.map((p) => p.pointIndex)).not.toContain(6);
  });

  test("the insert row carries only columns", () => {
    const row = pointInsertRow("m-1", build().points[0]);
    expect(row.match_id).toBe("m-1");
    expect(Object.keys(row)).not.toContain("shots");
    expect(Object.keys(row)).not.toContain("labelPointId");
    expect(Object.keys(row)).not.toContain("pointIndex");
  });

  test("the preview counts aces, double faults and winners per side", () => {
    const stats = expectedStats(build().points);
    expect(stats.points).toBe(9);
    expect(stats.games).toBe(2);
    expect(stats.p1.aces).toBe(2);
    expect(stats.p2.aces).toBe(1);
    expect(stats.p1.doubleFaults).toBe(1);
    expect(stats.p1.serviceWinners).toBe(1);
    expect(stats.p1.winners).toBe(2);
    expect(stats.p2.winners).toBe(1);
    expect(stats.p1.unforcedErrors).toBe(1);
    expect(stats.p1.pointsWon + stats.p2.pointsWon).toBe(9);
    expect(stats.p1.serviceGames).toBe(1);
    expect(stats.p2.serviceGames).toBe(1);
    expect(stats.p1.breakPointsFaced).toBe(1);
    expect(stats.p2.breakPointsWon).toBe(0);
  });
});

test.describe("vendorShotFacts", () => {
  test("speed in mph, bounce on the fitted clock plus the trim offset", () => {
    const raw = (eventId: number, frame: number, time: number, extra = {}) => ({
      event_id: eventId,
      pred_rally_id: 1,
      pred_rally_stroke_number: eventId,
      pred_player_id: "a",
      frame,
      time,
      ...extra,
    });
    const facts = vendorShotFacts(
      [
        raw(1, 0, 0, { speed_kmh: 100 }),
        raw(2, 30, 1, { bounce_frame: 45 }),
        raw(3, 60, 2),
        null,
      ],
      10,
    );
    expect(facts.get(1)?.speedMph).toBeCloseTo(62.1371, 3);
    expect(facts.get(1)?.bounceVideoTime).toBeNull();
    expect(facts.get(2)?.speedMph).toBeNull();
    expect(facts.get(2)?.bounceVideoTime).toBeCloseTo(11.5, 6);
  });

  test("the built shots read them by event_id", () => {
    const points = session();
    const eventId = points[0].shots[0].eventId!;
    const vendor = new Map([
      [eventId, { speedMph: 110, bounceVideoTime: 101.5 }],
    ]);
    const built = buildAppliedRows({
      points,
      adScoring: true,
      bestOf: 3,
      vendor,
    });
    const [ace] = built.points[0].shots;
    expect(ace.speed_mph).toBe(110);
    expect(ace.bounce_video_time).toBe(101.5);
    const other: AppliedPointRow = built.points[1];
    expect(other.shots[0].speed_mph).toBeNull();
  });
});
