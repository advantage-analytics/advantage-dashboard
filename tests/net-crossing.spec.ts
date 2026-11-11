import { expect, test } from "@playwright/test";

import { netPathX } from "@/components/dashboard/matches/match-detail/net-crossing";
import {
  computeViz,
  EMPTY_VIZ_FILTERS,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

const NET = 11.885;

test.describe("netPathX: where a net ball's path meets the net", () => {
  test("a diagonal shot crosses between its contact and landing x", () => {
    // From (-3, 1) to (4, NET + 6): the net is (NET - 1) / (NET + 5) of the way.
    const t = (NET - 1) / (NET + 5);
    expect(netPathX(-3, 1, 4, NET + 6)).toBeCloseTo(-3 + 7 * t);
    // Read at a drawn depth short of the net instead.
    const ti = (NET - 0.3 - 1) / (NET + 5);
    expect(netPathX(-3, 1, 4, NET + 6, NET - 0.3)).toBeCloseTo(-3 + 7 * ti);
  });

  test("works from the far end too", () => {
    // Struck at (2, 23), recorded landing at (-2, 1): halfway-ish down.
    const t = (23 - NET) / 22;
    expect(netPathX(2, 23, -2, 1)).toBeCloseTo(2 - 4 * t);
  });

  test("never leaves the contact → landing segment", () => {
    // Struck 0.05 m short of the net, landing 0.05 m past it, read 0.3 m
    // short of the net: unclamped, t = -2.5 and x = -10.
    expect(netPathX(0, NET - 0.05, 4, NET + 0.05, NET - 0.3)).toBeCloseTo(0);
    // The same from the far end.
    expect(netPathX(0, NET + 0.05, 4, NET - 0.05, NET + 0.3)).toBeCloseTo(0);
    // A read past the landing stops at the landing.
    expect(netPathX(0, 1, 4, NET + 1, NET + 5)).toBeCloseTo(4);
  });

  test("a straight shot keeps its x", () => {
    expect(netPathX(1.5, 0.5, 1.5, 20)).toBeCloseTo(1.5);
  });

  test("a landing on the net itself crosses at that landing", () => {
    expect(netPathX(-2, 2, 1, NET)).toBeCloseTo(1);
  });

  test("missing or unusable contact has no crossing", () => {
    expect(netPathX(null, 1, 2, 20)).toBeNull();
    expect(netPathX(1, undefined, 2, 20)).toBeNull();
    expect(netPathX(1, Number.NaN, 2, 20)).toBeNull();
    expect(netPathX(1, 1, null, 20)).toBeNull();
  });

  test("a landing on the hitter's own side never reaches the net", () => {
    // SwingVision's imputed net landings all sit here.
    expect(netPathX(1, 1, 3, NET - 1.5)).toBeNull();
    expect(netPathX(1, 22, 3, NET + 1)).toBeNull();
  });

  test("a contact on the net line has no side to cross from", () => {
    expect(netPathX(1, NET, 3, 20)).toBeNull();
  });
});

/* ── The Statistics court dots ───────────────────────────────────────────── */

function shot(over: Partial<MatchShot>): MatchShot {
  return {
    id: crypto.randomUUID(),
    shotNumber: 1,
    isPlayer1: true,
    shotType: "First Serve",
    spinType: null,
    speedMph: null,
    zone: null,
    result: "Net",
    videoTime: null,
    bounceVideoTime: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    ...over,
  };
}

function servePoint(serve: Partial<MatchShot>): MatchPoint {
  const s = shot(serve);
  return {
    id: crypto.randomUUID(),
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    serverIsPlayer1: true,
    wonByPlayer1: false,
    firstShotLandingX: s.landingX,
    firstShotLandingY: s.landingY,
    firstShotResult: s.result,
    firstShotType: s.shotType,
    shots: [s],
  } as unknown as MatchPoint;
}

test.describe("Statistics court: net dots follow the path", () => {
  test("a netted serve's dot lateral is its path at the net, mirrored at the far end", () => {
    // Near end: struck at (1, -0.5), recorded landing (-3, NET + 4).
    const near = servePoint({
      contactX: 1,
      contactY: -0.5,
      landingX: -3,
      landingY: NET + 4,
    });
    const crossNear = netPathX(1, -0.5, -3, NET + 4)!;
    const [d] = computeViz([near], "serve", EMPTY_VIZ_FILTERS, true).dots;
    expect(d.atNet).toBe(true);
    expect(d.lateralM).toBeCloseTo(crossNear);

    // The same serve from the far end: world frame rotated 180°.
    const far = servePoint({
      contactX: -1,
      contactY: 23.77 + 0.5,
      landingX: 3,
      landingY: 23.77 - NET - 4,
    });
    const [f] = computeViz([far], "serve", EMPTY_VIZ_FILTERS, true).dots;
    expect(f.lateralM).toBeCloseTo(crossNear);
  });

  test("an imputed (own-side) net landing keeps its landing lateral", () => {
    const p = servePoint({
      contactX: 1,
      contactY: -0.5,
      landingX: -2,
      landingY: NET - 1,
    });
    const [d] = computeViz([p], "serve", EMPTY_VIZ_FILTERS, true).dots;
    expect(d.lateralM).toBeCloseTo(-2);
  });

  test("a netted return's dot lateral is its path at the net", () => {
    const p = {
      ...servePoint({
        contactX: 0,
        contactY: -0.5,
        landingX: 1,
        landingY: 18,
        result: "In",
      }),
      serverIsPlayer1: false,
      wonByPlayer1: false,
      secondShotType: "Forehand",
      secondShotResult: "Net",
      secondShotContactX: 3,
      secondShotContactY: 0.5,
      secondShotLandingX: -2,
      secondShotLandingY: NET + 5,
    } as MatchPoint;
    const [d] = computeViz(
      [p],
      "returnPlacement",
      EMPTY_VIZ_FILTERS,
      true,
    ).dots;
    expect(d.atNet).toBe(true);
    expect(d.lateralM).toBeCloseTo(netPathX(3, 0.5, -2, NET + 5)!);
  });
});
