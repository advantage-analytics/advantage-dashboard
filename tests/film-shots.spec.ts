import { expect, test } from "@playwright/test";

import {
  activeShotAt,
  shotLabel,
  shotStops,
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
  ...extra,
});

const OFFSET = 15;
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

test("labels", () => {
  expect(shotLabel(shot("a", 1, { shotType: "First Serve" }))).toBe(
    "First serve · topspin",
  );
  expect(shotLabel(shot("b", 1, { shotType: null, spinType: null }))).toBe(
    "Shot",
  );
});
