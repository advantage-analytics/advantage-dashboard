import { expect, test } from "@playwright/test";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  filterKeysFor,
  subjectFor,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";

/** Pure and offline — same model as tests/report-view.spec.ts. */
function point(over: Partial<MatchPoint>): MatchPoint {
  return {
    id: crypto.randomUUID(),
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Winner",
    eventType: "Rally",
    description: "Test point",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 3,
    duration: 5000,
    videoTime: 10000,
    saved: true,
    firstShotType: "First Serve",
    firstShotResult: "In",
    firstShotLandingX: -1.0,
    firstShotLandingY: 8.0,
    ...over,
  } as MatchPoint;
}

test.describe("computeViz — serve cut", () => {
  const pts = [
    point({ serverIsPlayer1: true, wonByPlayer1: true }),
    point({ serverIsPlayer1: true, wonByPlayer1: false }),
    point({ serverIsPlayer1: false, wonByPlayer1: false }),
  ];

  test("subject = player 1 draws only player 1's serves", () => {
    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.total).toBe(2);
    expect(r.dots.map((d) => d.outcome).sort()).toEqual(["lost", "won"]);
    expect(r.noun).toBe("serves");
    expect(r.zoneStats).not.toBeNull();
  });

  test("subject = player 2: won means player 2 won", () => {
    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, false);
    expect(r.total).toBe(1);
    expect(r.dots[0].outcome).toBe("won"); // p2 served, p1 lost it
  });

  test("result filter is subject-relative", () => {
    const r = computeViz(
      pts,
      "serve",
      { ...EMPTY_VIZ_FILTERS, result: "won" },
      true,
    );
    expect(r.count).toBe(1);
    expect(r.total).toBe(2);
  });
});

test.describe("computeViz — return cuts", () => {
  const ret = point({
    serverIsPlayer1: false,
    wonByPlayer1: true,
    secondShotLandingX: 1.2,
    secondShotLandingY: 4.0,
    secondShotContactX: 0.5,
    secondShotContactY: 23.0,
    secondShotType: "Forehand",
  });

  test("placement keeps landing dots, contact keeps contact dots", () => {
    const place = computeViz([ret], "returnPlacement", EMPTY_VIZ_FILTERS, true);
    const contact = computeViz([ret], "returnContact", EMPTY_VIZ_FILTERS, true);
    expect(place.dots).toHaveLength(1);
    expect(contact.dots).toHaveLength(1);
    // Placement's depthM is distance-from-net (landing); contact's is
    // signed distance from the returner's own baseline — different
    // quantities for the same point, so they should differ.
    expect(place.dots[0].depthM).not.toBe(contact.dots[0].depthM);
    expect(place.zoneStats).toBeNull();
    expect(place.noun).toBe("returns");
  });

  test("return dots carry metres, not the legacy pixel frame", () => {
    const place = computeViz([ret], "returnPlacement", EMPTY_VIZ_FILTERS, true);
    // secondShotLandingX: 1.2, secondShotLandingY: 4.0 — well within the net
    // (REAL_NET_Y=11.885), so no end-change flip: lateralM is the mirrored
    // (leading-minus) landing x, depthM is the landing y unchanged.
    expect(place.dots[0].lateralM).toBeCloseTo(-1.2, 5);
    expect(place.dots[0].depthM).toBeCloseTo(4.0, 5);
  });

  test("a return without contact coords counts for placement only", () => {
    const noContact = {
      ...ret,
      secondShotContactX: null,
      secondShotContactY: null,
    } as MatchPoint;
    expect(
      computeViz([noContact], "returnPlacement", EMPTY_VIZ_FILTERS, true).total,
    ).toBe(1);
    expect(
      computeViz([noContact], "returnContact", EMPTY_VIZ_FILTERS, true).total,
    ).toBe(0);
  });
});

test("filterKeysFor: zone exists on serve only", () => {
  expect(filterKeysFor("serve")).toContain("zone");
  expect(filterKeysFor("returnPlacement")).not.toContain("zone");
});

test("subjectFor flips for the opponent and for a player-2 viewer", () => {
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "you" }, true)).toBe(true);
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "opponent" }, true)).toBe(
    false,
  );
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "you" }, false)).toBe(
    false,
  );
});
