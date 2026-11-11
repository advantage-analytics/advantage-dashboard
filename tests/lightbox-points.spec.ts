import { expect, test } from "@playwright/test";
import {
  markIsPoint,
  pointsBehind,
} from "@/components/dashboard/matches/match-detail/shots/lightbox-points";
import type { VizDot } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { servePoint } from "./fixtures/viz-serve-points";

const dot = (
  id: string,
  outcome: VizDot["outcome"],
  shotType: string | null,
): VizDot => ({
  id,
  outcome,
  shape: "circle",
  lateralM: 0,
  depthM: 0,
  atNet: false,
  meta: {
    pointId: id,
    setNumber: 1,
    pointScore: null,
    wonBySubject: false,
    shotType,
    result: "Out",
    isAce: false,
    speedMph: null,
  },
});

test("a missed first serve is a fault, not a point; a missed second serve is a double fault, a point", () => {
  expect(markIsPoint("serve", dot("a", "miss", "First Serve"))).toBe(false);
  expect(markIsPoint("serve", dot("b", "miss", "Second Serve"))).toBe(true);
  // Anything else on serve, and every mark on another cut, stands for a point.
  expect(markIsPoint("serve", dot("c", "won", "First Serve"))).toBe(true);
  expect(markIsPoint("returnPlacement", dot("d", "miss", null))).toBe(true);
});

test("Points and Watch keep a double fault and leave out a first-serve fault", () => {
  const points = [
    servePoint({ id: "fault" }),
    servePoint({ id: "double", second: true }),
  ];
  const listed = pointsBehind(
    "serve",
    [
      dot("fault", "miss", "First Serve"),
      dot("double", "miss", "Second Serve"),
    ],
    points,
  );
  expect(listed.map((p) => p.id)).toEqual(["double"]);
});
