import { expect, test } from "@playwright/test";

import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import {
  H2H_GROUPS,
  sideCut,
  tallySide,
} from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { applyFilmCut } from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  outcomeCut,
  outcomeTally,
} from "@/components/dashboard/matches/match-detail/point-endings-card";
import {
  finalShotOf,
  optionAvailability,
  returnResultOf,
  serveResultOf,
  type MatchFilterContext,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  pointDetail,
  shotLabel,
  shotRowCells,
  shotSpinLabel,
} from "@/components/dashboard/matches/match-detail/film/film-shots";
import { vizPoints } from "@/components/dashboard/matches/match-detail/shots/use-viz-points";

/**
 * The words a point or shot is shown under agree with the filter a click
 * opens and the data they describe (label audit, 2026-09-30). Pure and
 * offline, on the shapes the live data was found in.
 */

const SV: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: "right", player2: "right" },
};
const DERIVED: MatchFilterContext = { ...SV, isDerived: true };

function shot(o: Partial<MatchShot> & { id: string }): MatchShot {
  return {
    shotNumber: 1,
    isPlayer1: true,
    shotType: null,
    spinType: null,
    speedMph: null,
    zone: null,
    result: null,
    videoTime: null,
    bounceVideoTime: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    ...o,
  };
}

function pt(o: Partial<MatchPoint> & { id: string }): MatchPoint {
  return {
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "",
    eventType: "",
    description: "",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 3,
    duration: null,
    videoTime: 10,
    saved: false,
    savedBy: [],
    ...o,
  };
}

/** Player 1 served both faults; player 2 swung at the dead second serve. */
const DF_DEAD_BALL = pt({
  id: "df-dead-ball",
  resultType: "Double Fault",
  wonByPlayer1: false,
  rallyLength: 0,
  player: "player2",
  secondShotResult: "In",
  shots: [
    shot({ id: "s1", shotType: "First Serve", result: "Out" }),
    shot({ id: "s2", shotType: "Second Serve", result: "Out" }),
    shot({
      id: "s3",
      shotNumber: 2,
      isPlayer1: false,
      shotType: "Backhand",
      result: "In",
    }),
  ],
});

/** A SwingVision service winner: the last row is the returner's miss. */
const SV_SERVICE_WINNER = pt({
  id: "sv-sw",
  resultType: "Service Winner",
  rallyLength: 2,
  player: "player2",
  shots: [
    shot({ id: "a1", shotType: "First Serve", result: "In" }),
    shot({
      id: "a2",
      shotNumber: 2,
      isPlayer1: false,
      shotType: "Forehand",
      result: "Out",
    }),
  ],
});

/** A derived unreturned serve, stored as a service winner. */
const DERIVED_UNRETURNED = pt({
  id: "ai-sw",
  resultType: "Service Winner",
  rallyLength: 1,
  firstShotType: "First Serve",
  firstShotSpin: "topspin",
  firstShotZone: "T",
  shots: [
    shot({
      id: "b1",
      shotType: "First Serve",
      spinType: "topspin",
      zone: "T",
    }),
  ],
});

const DERIVED_RALLY_WINNER = pt({
  id: "ai-fw",
  resultType: "Forehand Winner",
  rallyLength: 5,
});

function h2hRow(label: string) {
  const row = H2H_GROUPS.flatMap((g) => g.configs).find(
    (r) => r.label === label,
  );
  if (!row?.cut) throw new Error(`no cut row "${label}"`);
  return row;
}

test.describe("double faults", () => {
  test("a dead-ball swing after the second serve does not make it a return", () => {
    expect(finalShotOf(DF_DEAD_BALL)).toEqual({
      kind: "Serve",
      isPlayer1: true,
    });
    expect(returnResultOf(DF_DEAD_BALL)).toBeNull();
  });

  test("both Double faults cuts open it for the server", () => {
    const row = h2hRow("Double faults");
    const h2h = applyFilmCut(
      [DF_DEAD_BALL],
      [DF_DEAD_BALL],
      sideCut(row.cut!, "you", row.sideBy),
      SV,
    );
    expect(h2h.map((p) => p.id)).toEqual(["df-dead-ball"]);
    const endings = applyFilmCut(
      [DF_DEAD_BALL],
      [DF_DEAD_BALL],
      outcomeCut("doubleFaults", "you"),
      SV,
    );
    expect(endings.map((p) => p.id)).toEqual(["df-dead-ball"]);
    expect(outcomeTally([DF_DEAD_BALL], true, false).doubleFaults).toBe(1);
  });
});

test.describe("point endings credit", () => {
  test("a SwingVision service winner is the server's, as its cut opens it", () => {
    expect(outcomeTally([SV_SERVICE_WINNER], true, false).winners).toBe(1);
    expect(outcomeTally([SV_SERVICE_WINNER], false, false).winners).toBe(0);
    expect(tallySide([SV_SERVICE_WINNER], true).winners).toBe(1);
    expect(tallySide([SV_SERVICE_WINNER], false).winners).toBe(0);
    const opened = applyFilmCut(
      [SV_SERVICE_WINNER],
      [SV_SERVICE_WINNER],
      outcomeCut("winners", "you"),
      SV,
    );
    expect(opened.map((p) => p.id)).toEqual(["sv-sw"]);
  });

  test("on a derived match an unreturned serve is an ace, not a winner", () => {
    const points = [DERIVED_UNRETURNED, DERIVED_RALLY_WINNER];
    const t = outcomeTally(points, true, true);
    expect(t.aces).toBe(1);
    expect(t.winners).toBe(1);
    const aces = applyFilmCut(
      points,
      points,
      outcomeCut("aces", "you", true),
      DERIVED,
    );
    expect(aces.map((p) => p.id)).toEqual(["ai-sw"]);
    const winners = applyFilmCut(
      points,
      points,
      outcomeCut("winners", "you", true),
      DERIVED,
    );
    expect(winners.map((p) => p.id)).toEqual(["ai-fw"]);
  });

  test("SwingVision still counts aces by result type alone", () => {
    const t = outcomeTally([DERIVED_UNRETURNED], true, false);
    expect(t.aces).toBe(0);
    expect(t.winners).toBe(1);
  });
});

test.describe("derived Service winner option", () => {
  test("never an answer, so the panel leaves it out", () => {
    expect(serveResultOf(DERIVED_UNRETURNED, DERIVED)).toBe("ace");
    const rallied = { ...DERIVED_UNRETURNED, rallyLength: 2 };
    expect(serveResultOf(rallied, DERIVED)).not.toBe("service-winner");
    expect(
      optionAvailability(
        [DERIVED_UNRETURNED, rallied],
        DERIVED,
      ).serveResult.has("service-winner"),
    ).toBe(false);
    expect(serveResultOf(SV_SERVICE_WINNER, SV)).toBe("service-winner");
  });
});

test.describe("Visualizations aces", () => {
  test("a derived unreturned serve reads as an Ace there", () => {
    const [ace, rally] = vizPoints(
      [DERIVED_UNRETURNED, DERIVED_RALLY_WINNER],
      true,
    );
    expect(ace.resultType).toBe("Ace");
    expect(rally).toBe(DERIVED_RALLY_WINNER);
  });

  test("SwingVision points pass through untouched", () => {
    const points = [SV_SERVICE_WINNER];
    expect(vizPoints(points, false)).toBe(points);
  });
});

test.describe("labels use the filters' words", () => {
  test("a serve's spin is Serve › Spin's", () => {
    expect(
      shotSpinLabel({ shotType: "First Serve", spinType: "topspin" }),
    ).toBe("Kick");
    expect(
      shotSpinLabel({ shotType: "Second Serve", spinType: "sidespin" }),
    ).toBe("Slice");
    // No filter word: printed as recorded.
    expect(
      shotSpinLabel({ shotType: "First Serve", spinType: "backspin" }),
    ).toBe("Backspin");
    // Rally shots are never renamed.
    expect(shotSpinLabel({ shotType: "Forehand", spinType: "topspin" })).toBe(
      "Topspin",
    );
    const serve = DERIVED_UNRETURNED.shots![0];
    expect(shotRowCells(serve, 1, "You").spin).toBe("Kick");
    expect(shotLabel(serve)).toBe("First serve · kick");
  });

  test("the description names a serve by the filter's spin", () => {
    expect(pointDetail(DERIVED_UNRETURNED, SV.hands)).toBe(
      "Kick First Serve T",
    );
  });

  test("a forehand from the backhand half reads Inside Out, as its shot row does", () => {
    // Player 1 at the low-y end, contact at −x: the ad (backhand) half of a
    // right-hander, struck crosscourt.
    const inside = shot({
      id: "c3",
      shotNumber: 3,
      shotType: "Forehand",
      spinType: "topspin",
      zone: "Crosscourt",
      contactX: -2,
      contactY: 1,
    });
    const point = pt({
      id: "io",
      resultType: "Forehand Winner",
      isBreakPoint: true,
      shots: [shot({ id: "c1", shotType: "First Serve" }), inside],
    });
    expect(shotRowCells(inside, 3, "You", null, "right").placement).toBe(
      "Inside Out",
    );
    expect(pointDetail(point, SV.hands)).toBe(
      "Topspin Inside Out · Break point",
    );
    // Hand unknown: the stored direction stands.
    expect(pointDetail(point, { player1: null, player2: null })).toBe(
      "Topspin Crosscourt · Break point",
    );
  });
});
