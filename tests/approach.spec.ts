import { expect, test } from "@playwright/test";

import {
  approachLateralM,
  approachOf,
  laneOf,
  wingOf,
} from "@/components/dashboard/matches/match-detail/match-filters/approach";
import { cameToNet } from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  netApproachShotOf,
  netEndingOf,
  netEntryOf,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";

import {
  BASELINE,
  DRAWN_IN,
  LOBBED,
  LOBS,
  LOB_T,
  MATCH,
  OPP_APPROACH,
  OPP_ERROR,
  PASSED_CC,
  PASSED_DTL,
  SERVE_VOLLEY,
  p,
  passedBy,
  s,
} from "./fixtures/approach-points";

/**
 * The approach classifier (`match-filters/approach.ts`) against the Net game
 * classifiers it builds on. Pure and offline. The points are `tests/fixtures/approach-points.ts`.
 */

test.describe("approachOf agrees with the Net game", () => {
  test("null exactly where cameToNet is false", () => {
    for (const point of MATCH) {
      for (const seat of [true, false]) {
        for (const lobs of [LOBS, null]) {
          const a = approachOf(point, seat, lobs, null);
          expect(a === null, `${point.id} p1=${seat}`).toBe(
            !cameToNet(point, seat),
          );
        }
      }
    }
    // Both kinds are in the fixture.
    expect(approachOf(BASELINE, true, LOBS, null)).toBeNull();
    expect(approachOf(PASSED_DTL, true, LOBS, null)).not.toBeNull();
  });

  test("entry, ending and shot equal netEntryOf / netEndingOf / netApproachShotOf", () => {
    let seen = 0;
    for (const point of MATCH) {
      for (const seat of [true, false]) {
        for (const lobs of [LOBS, null]) {
          const a = approachOf(point, seat, lobs, "right");
          if (a === null) continue;
          seen += 1;
          expect(a.entry).toBe(netEntryOf(point, seat));
          expect(a.ending).toBe(netEndingOf(point, seat, lobs));
          expect(a.shot).toBe(netApproachShotOf(point, seat));
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    // The fixture covers all three entries.
    expect(approachOf(SERVE_VOLLEY, true, LOBS, null)?.entry).toBe(
      "serve-volley",
    );
    expect(approachOf(PASSED_DTL, true, LOBS, null)?.entry).toBe("approach");
    expect(approachOf(DRAWN_IN, true, LOBS, null)?.entry).toBe("drawn-in");
  });
});

test.describe("lane and wing", () => {
  test("lane is the hitter's-view third, mirrored at the high end", () => {
    // Low end: x < 0 is the hitter's left.
    expect(approachOf(PASSED_DTL, true, LOBS, "right")?.lane).toBe("left");
    expect(approachOf(LOBBED, true, LOBS, "right")?.lane).toBe("right");
    expect(approachOf(DRAWN_IN, true, LOBS, "right")?.lane).toBe("middle");
    // High end: the hitter faces −y, so world x > 0 is their left.
    expect(approachOf(OPP_APPROACH, false, LOBS, "right")?.lane).toBe("left");

    expect(laneOf(-1.5)).toBe("left");
    expect(laneOf(1.3)).toBe("middle");
    expect(laneOf(1.5)).toBe("right");
  });

  test("the same lane is the opposite wing for a left-handed opponent", () => {
    const right = approachOf(PASSED_DTL, true, LOBS, "right");
    const left = approachOf(PASSED_DTL, true, LOBS, "left");
    expect(right?.lane).toBe(left?.lane);
    // A right-hander facing the hitter has their forehand on the hitter's left.
    expect(right?.wing).toBe("forehand");
    expect(left?.wing).toBe("backhand");
    expect(right?.handAssumed).toBe(false);
    expect(left?.handAssumed).toBe(false);

    expect(wingOf("right", "right")).toBe("backhand");
    expect(wingOf("right", "left")).toBe("forehand");
    expect(wingOf("middle", "left")).toBe("middle");
  });

  test("an unknown hand reads as right-handed, flagged handAssumed", () => {
    for (const point of [PASSED_DTL, LOBBED, DRAWN_IN]) {
      const unknown = approachOf(point, true, LOBS, null);
      const right = approachOf(point, true, LOBS, "right");
      expect(unknown?.wing).toBe(right?.wing);
      expect(unknown?.handAssumed).toBe(true);
    }
  });

  test("no lane or wing when the approach shot never crossed the net", () => {
    expect(
      approachLateralM({ contactY: 3, landingX: 1, landingY: 8, result: "In" }),
    ).toBeNull();
    expect(
      approachLateralM({
        contactY: 3,
        landingX: 1,
        landingY: 20,
        result: "Net",
      }),
    ).toBeNull();
    expect(
      approachLateralM({
        contactY: 3,
        landingX: null,
        landingY: 20,
        result: "In",
      }),
    ).toBeNull();
    const noLanding = p("no-landing", {
      server: 2,
      winner: 2,
      resultType: "Forehand Winner",
      shots: [
        s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
        s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
        s(3, false, "Backhand", { cy: 22, ly: 2 }),
        s(4, true, "Forehand", { cy: 3, lx: null, ly: null }),
        s(5, false, "Backhand", { cy: 22, ly: 6 }),
        s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
        s(7, false, "Forehand", { cy: 21, ly: 3 }),
      ],
    });
    const a = approachOf(noLanding, true, LOBS, null);
    expect(a).not.toBeNull();
    expect(a?.lane).toBeNull();
    expect(a?.wing).toBeNull();
  });
});

test.describe("direction", () => {
  test("a serve-and-volley approach has no direction", () => {
    const a = approachOf(SERVE_VOLLEY, true, LOBS, null);
    expect(a?.entry).toBe("serve-volley");
    expect(a?.shot.shotType).toBe("First Serve");
    expect(a?.direction).toBeNull();
  });

  test("a rally approach takes its shot's zone", () => {
    expect(approachOf(PASSED_DTL, true, LOBS, null)?.direction).toBe(
      "Down the Line",
    );
    expect(approachOf(LOBBED, true, LOBS, null)?.direction).toBe("Crosscourt");
    expect(approachOf(DRAWN_IN, true, LOBS, null)?.direction).toBe("Middle");
  });
});

test.describe("how it ended", () => {
  test("the five buckets with lob keys", () => {
    const passedDtl = approachOf(PASSED_DTL, true, LOBS, null);
    expect(passedDtl?.bucket).toBe("passed-dtl");
    expect(passedDtl?.reply?.zone).toBe("Down the Line");

    const passedCc = approachOf(PASSED_CC, true, LOBS, null);
    expect(passedCc?.bucket).toBe("passed-crosscourt");
    expect(passedCc?.reply?.isPlayer1).toBe(false);

    const lobbed = approachOf(LOBBED, true, LOBS, null);
    expect(lobbed?.ending).toBe("lobbed");
    expect(lobbed?.bucket).toBe("lobbed");
    expect(lobbed?.reply?.videoTime).toBe(LOB_T);

    // Won at the net: the side's winner and the opponent's error together.
    const winner = approachOf(SERVE_VOLLEY, true, LOBS, null);
    const oppError = approachOf(OPP_ERROR, true, LOBS, null);
    expect(winner?.ending).toBe("winner");
    expect(oppError?.ending).toBe("opponent-error");
    expect(winner?.bucket).toBe("won-at-net");
    expect(oppError?.bucket).toBe("won-at-net");
    expect(winner?.reply).toBeNull();
    expect(oppError?.reply).toBeNull();

    const ownError = approachOf(DRAWN_IN, true, LOBS, null);
    expect(ownError?.bucket).toBe("own-error");
    expect(ownError?.reply).toBeNull();
  });

  test("with lobKeys null nothing is lobbed and passes read passed or lobbed", () => {
    const buckets = MATCH.flatMap((point) =>
      [true, false].map((seat) => approachOf(point, seat, null, null)?.bucket),
    ).filter((b) => b !== undefined);
    expect(buckets).not.toContain("lobbed");
    expect(buckets).not.toContain("passed-dtl");
    expect(buckets).not.toContain("passed-crosscourt");

    expect(approachOf(PASSED_DTL, true, null, null)?.bucket).toBe(
      "passed-or-lobbed-dtl",
    );
    expect(approachOf(PASSED_CC, true, null, null)?.bucket).toBe(
      "passed-or-lobbed-crosscourt",
    );
    // The lob, unknown as one, is a crosscourt pass.
    const lob = approachOf(LOBBED, true, null, null);
    expect(lob?.ending).toBe("passed");
    expect(lob?.bucket).toBe("passed-or-lobbed-crosscourt");
    // Wins and own errors are unchanged.
    expect(approachOf(SERVE_VOLLEY, true, null, null)?.bucket).toBe(
      "won-at-net",
    );
    expect(approachOf(DRAWN_IN, true, null, null)?.bucket).toBe("own-error");
  });

  test("a pass with no down-the-line zone counts as crosscourt", () => {
    expect(
      approachOf(passedBy("mid", "Middle"), true, LOBS, null)?.bucket,
    ).toBe("passed-crosscourt");
    expect(approachOf(passedBy("none", null), true, LOBS, null)?.bucket).toBe(
      "passed-crosscourt",
    );
  });
});
