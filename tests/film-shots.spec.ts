import { expect, test } from "@playwright/test";

import {
  activeShotAt,
  pointReturnShotId,
  shotLabel,
  shotRowCells,
  shotStops,
  shotTypeLabel,
} from "@/components/dashboard/matches/match-detail/film/film-shots";
import { filmStops } from "@/components/dashboard/matches/match-detail/film/film-timeline";

import { pt } from "./fixtures/film-point";

const shot = (id: string, videoTime: number | null, extra = {}) => ({
  id,
  shotNumber: 1,
  isPlayer1: true,
  shotType: "Forehand",
  spinType: "topspin",
  speedMph: 70,
  zone: null,
  result: "In",
  videoTime,
  bounceVideoTime: null,
  contactX: null,
  contactY: null,
  landingX: null,
  landingY: null,
  ...extra,
});

/** The legacy Advantage Intelligence shape: a trim offset, no measured file. */
const OFFSET = { offset: 15, duration: null };
const points = [
  pt({
    id: "p1",
    videoTime: 65,
    duration: 6,
    shots: [shot("s2", 66.2), shot("s1", 65), shot("s3", 67.4)],
  }),
  pt({
    id: "p2",
    videoTime: 95,
    duration: 4,
    shots: [shot("t1", 95), shot("untimed", null)],
  }),
];

test("shots are placed on the film clock in time order, untimed ones dropped", () => {
  const stops = shotStops(filmStops(points, OFFSET), OFFSET);
  expect(stops.map((s) => s.shot.id)).toEqual(["s1", "s2", "s3", "t1"]);
  expect(stops[0].start).toBeCloseTo(50, 6);
  expect(stops[0].end).toBeCloseTo(51.2, 6);
  // The last shot of a point runs to the point's padded end
  // (65 + 6 - 15 = 56, plus the 1.5s run-out).
  expect(stops[2].end).toBeCloseTo(57.5, 6);
});

test("the playing shot, and nothing in the dead time between points", () => {
  const stops = shotStops(filmStops(points, OFFSET), OFFSET);
  expect(activeShotAt(stops, 49)).toBeNull();
  expect(activeShotAt(stops, 50.6)?.stop.shot.id).toBe("s1");
  expect(activeShotAt(stops, 50.6)?.progress).toBeCloseTo(0.5, 6);
  expect(activeShotAt(stops, 53)?.stop.shot.id).toBe("s3");
  expect(activeShotAt(stops, 70)).toBeNull();
  expect(activeShotAt(stops, 80.5)?.stop.shot.id).toBe("t1");
});

test("shots convert through the same clock as their point, once", () => {
  // The camera rolled 20s before the source clock's first point, in a file
  // measured at 300s. A doubled offset would put s1 at 105, not 85.
  const attached = { offset: -20, duration: 300 };
  const stops = shotStops(filmStops(points, attached), attached);
  expect(stops[0].shot.id).toBe("s1");
  expect(stops[0].start).toBeCloseTo(85, 6);
  expect(stops[0].start).not.toBeCloseTo(65 + 2 * 20, 6);
  // A shot shares its point's serve contact, so the two agree exactly.
  expect(stops[0].start).toBeCloseTo(filmStops(points, attached)[0].serve, 6);
});

test("a shot past the last frame sits on it rather than off the end", () => {
  const attached = { offset: -20, duration: 300 };
  const late = [
    pt({
      id: "p",
      videoTime: 275,
      duration: 4,
      shots: [shot("s", 275), shot("edge", 280.04)],
    }),
  ];
  const stops = shotStops(filmStops(late, attached), attached);
  expect(stops[1].start).toBe(300);
  expect(stops[1].end).toBe(300);
  expect(stops[0].end).toBe(300);
});

test("a stored landing converts through the same clock, nonsense dropped", () => {
  const bounced = [
    pt({
      id: "b",
      videoTime: 65,
      duration: 6,
      shots: [
        shot("measured", 65, { bounceVideoTime: 65.8 }),
        shot("missing", 66.2),
        shot("early", 67.4, { bounceVideoTime: 67.1 }),
      ],
    }),
  ];
  const stops = shotStops(filmStops(bounced, OFFSET), OFFSET);
  const of = (id: string) => stops.find((s) => s.shot.id === id)!;

  // Film seconds, not source: 65.8 − 15. The raw 65.8 would be 15s off.
  expect(of("measured").bounce).toBeCloseTo(50.8, 6);
  expect(of("measured").bounce!).toBeGreaterThanOrEqual(of("measured").start);
  // No reading at all: the court falls back to its estimate.
  expect(of("missing").bounce).toBeNull();
  // A landing 0.3s BEFORE its own strike is not a reading either.
  expect(of("early").bounce).toBeNull();
});

test("labels", () => {
  expect(shotLabel(shot("a", 1, { shotType: "First Serve" }))).toBe(
    "First serve · topspin",
  );
  expect(shotLabel(shot("b", 1, { shotType: null, spinType: null }))).toBe(
    "Shot",
  );
});

test("the serve row: Stroke is Serve, Type is First or Second", () => {
  const serve = shot("a", 1, {
    shotType: "Second Serve",
    spinType: "flat",
    speedMph: 111.6,
    zone: "Body, deuce court",
    result: "In",
  });
  expect(shotRowCells(serve, 1, "Reid")).toEqual({
    order: "1",
    player: "Reid",
    spin: "Flat",
    stroke: "Serve",
    type: "Second",
    placement: "Body, deuce court",
    mph: "112",
    result: "In",
  });
  expect(shotTypeLabel(shot("f", 1, { shotType: "First Serve" }), null)).toBe(
    "First",
  );
  // A bare "Serve" (older imports) is still a serve, and reads First.
  expect(shotTypeLabel(shot("g", 1, { shotType: "Serve" }), null)).toBe(
    "First",
  );
});

test("a rally row: the point's return reads Return, every later shot Rally", () => {
  const rally = shot("b", 1, {
    shotType: "FOREHAND",
    spinType: "topspin",
    speedMph: 74,
    zone: "Inside-out, deep",
    result: "Out",
  });
  expect(shotRowCells(rally, 2, "Lee", "b")).toMatchObject({
    order: "2",
    stroke: "Forehand",
    type: "Return",
    placement: "Inside-out, deep",
    mph: "74",
    result: "Out",
  });
  // Not the return: Rally, wherever the row sits — the stroke is Stroke's job.
  expect(shotRowCells(rally, 2, "Lee", "other").type).toBe("Rally");
  // SwingVision's side-carrying volley keeps its side in Stroke.
  expect(
    shotRowCells(shot("v", 1, { shotType: "Forehand Volley" }), 5, "Lee", "x"),
  ).toMatchObject({ stroke: "Forehand volley", type: "Rally" });
  expect(shotTypeLabel(shot("c", 1, { shotType: "Backhand" }), "x")).toBe(
    "Rally",
  );
  expect(shotTypeLabel(shot("d", 1, { shotType: "Volley" }), "x")).toBe(
    "Rally",
  );
  expect(shotTypeLabel(shot("e", 1, { shotType: "Overhead" }), "x")).toBe(
    "Rally",
  );
});

test("Type follows shot_type, not row position: faults, feeds, volleyed returns", () => {
  // A faulted first serve, the second serve, then the real return on row 3 —
  // the old position rule called that return "Rally".
  const fault = [
    shot("f0", 1, { shotType: "Feed", shotNumber: 0 }),
    shot("f1", 1, { shotType: "First Serve" }),
    shot("f2", 2, { shotType: "Second Serve" }),
    shot("f3", 3, { shotType: "Volley", shotNumber: 2 }),
    shot("f4", 4, { shotType: "Forehand", shotNumber: 3 }),
    shot("f5", 5, { shotType: "Overhead", shotNumber: 4 }),
  ];
  const ret = pointReturnShotId(fault);
  expect(ret).toBe("f3");
  expect(fault.map((s) => shotTypeLabel(s, ret))).toEqual([
    "—", // the Feed is no shot in the rally
    "First",
    "Second",
    "Return", // a volleyed return is still the Return
    "Rally",
    "Rally",
  ]);
  // An ace or a double fault has no return at all.
  expect(
    pointReturnShotId([
      shot("a1", 1, { shotType: "First Serve" }),
      shot("a2", 2, { shotType: "Second Serve" }),
    ]),
  ).toBeNull();
  expect(pointReturnShotId(undefined)).toBeNull();
});

test("nothing unmeasured is ever rendered as a zero", () => {
  const blank = shot("c", 1, {
    shotType: null,
    spinType: null,
    speedMph: null,
    zone: null,
    result: null,
  });
  expect(shotRowCells(blank, 4, "Lee")).toEqual({
    order: "4",
    player: "Lee",
    spin: "—",
    stroke: "—",
    type: "—",
    placement: "—",
    mph: "—",
    result: "—",
  });
  // A measured zero still reads as zero — the dash means "not measured".
  expect(shotRowCells({ ...blank, speedMph: 0 }, 4, "Lee").mph).toBe("0");
});
