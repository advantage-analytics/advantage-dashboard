import { expect, test } from "@playwright/test";

import {
  hitterHalf,
  inferHand,
  shotDirection,
  type Hand,
} from "@/components/dashboard/matches/match-detail/match-filters/shot-geometry";
import {
  normalizeReturnSpin,
  normalizeServeSpin,
} from "@/components/dashboard/matches/match-detail/match-filters/spin";
import type { MatchShot } from "@/lib/data/match-points-server";
import { serveCourtSide } from "@/lib/services/splitstep/derivation/court";

import { pt } from "./fixtures/film-point";

const NET_Y = 23.77 / 2;
/** Where a player stands behind each baseline, in the stored frame. */
const LOW_END_Y = -0.5;
const HIGH_END_Y = 24.3;

let seq = 0;
function shot(overrides: Partial<MatchShot>): MatchShot {
  seq += 1;
  return {
    id: `s${seq}`,
    shotNumber: 3,
    isPlayer1: true,
    shotType: "Forehand",
    spinType: null,
    speedMph: null,
    zone: null,
    result: "In",
    videoTime: null,
    bounceVideoTime: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    ...overrides,
  };
}

/**
 * A shot struck from `half` of the court, as the hitter at `end` faces the
 * net — the geometry every case below is built from, so the cases read in
 * tennis terms rather than signs of x.
 */
function from(
  end: "low" | "high",
  half: "deuce" | "ad",
  overrides: Partial<MatchShot> = {},
): MatchShot {
  const facing = end === "low" ? 1 : -1;
  const x = (half === "deuce" ? 2 : -2) * facing;
  return shot({
    contactX: x,
    contactY: end === "low" ? LOW_END_Y : HIGH_END_Y,
    ...overrides,
  });
}

test.describe("hitterHalf", () => {
  for (const end of ["low", "high"] as const) {
    test(`a 0-0 deuce-court serve reads "deuce" for a server at the ${end}-y end`, () => {
      // Deuce court at 0-0 is the server's right. Place the server by the
      // derivation's own rule (vendor y = stored y − 11.885), which labels
      // every Advantage Intelligence serve, so this spec pins hitterHalf to
      // proven code rather than to itself.
      const y = end === "low" ? LOW_END_Y : HIGH_END_Y;
      const x = end === "low" ? 1.2 : -1.2;
      expect(serveCourtSide(x, y - NET_Y)).toBe("deuce");

      const serve = pt({
        id: `serve-${end}`,
        pointScore: "0-0",
        shots: [
          shot({
            shotNumber: 1,
            shotType: "First Serve",
            contactX: x,
            contactY: y,
          }),
        ],
      });
      expect(hitterHalf(serve.shots![0])).toBe("deuce");
    });

    test(`an ad-court serve reads "ad" at the ${end}-y end`, () => {
      const y = end === "low" ? LOW_END_Y : HIGH_END_Y;
      const x = end === "low" ? -1.2 : 1.2;
      expect(serveCourtSide(x, y - NET_Y)).toBe("ad");
      expect(hitterHalf(shot({ contactX: x, contactY: y }))).toBe("ad");
    });
  }

  test("the same x is opposite halves at opposite ends", () => {
    expect(hitterHalf(shot({ contactX: 3, contactY: 2 }))).toBe("deuce");
    expect(hitterHalf(shot({ contactX: 3, contactY: 21 }))).toBe("ad");
  });

  test("unmeasured, centre-line or at-net contacts are null", () => {
    expect(hitterHalf(shot({ contactX: null, contactY: 2 }))).toBeNull();
    expect(hitterHalf(shot({ contactX: 2, contactY: null }))).toBeNull();
    expect(hitterHalf(shot({ contactX: 0, contactY: 2 }))).toBeNull();
    expect(hitterHalf(shot({ contactX: 2, contactY: NET_Y }))).toBeNull();
    expect(hitterHalf(shot({ contactX: NaN, contactY: 2 }))).toBeNull();
  });
});

test.describe("shotDirection", () => {
  const cases: {
    hand: Hand;
    backhand: "deuce" | "ad";
    forehand: "deuce" | "ad";
  }[] = [
    { hand: "right", backhand: "ad", forehand: "deuce" },
    { hand: "left", backhand: "deuce", forehand: "ad" },
  ];

  for (const { hand, backhand, forehand } of cases) {
    for (const end of ["low", "high"] as const) {
      test(`${hand}-hander at the ${end}-y end`, () => {
        // Forehand from the backhand half → Inside-*.
        expect(
          shotDirection(from(end, backhand, { zone: "Crosscourt" }), hand),
        ).toBe("Inside Out");
        expect(
          shotDirection(from(end, backhand, { zone: "Down the Line" }), hand),
        ).toBe("Inside In");
        // Forehand from the forehand half stays plain.
        expect(
          shotDirection(from(end, forehand, { zone: "Crosscourt" }), hand),
        ).toBe("Crosscourt");
        expect(
          shotDirection(from(end, forehand, { zone: "Down the Line" }), hand),
        ).toBe("Down the Line");
        // A backhand from the backhand half is never Inside-*.
        expect(
          shotDirection(
            from(end, backhand, { zone: "Crosscourt", shotType: "Backhand" }),
            hand,
          ),
        ).toBe("Crosscourt");
        expect(
          shotDirection(
            from(end, backhand, {
              zone: "Down the Line",
              shotType: "Backhand",
            }),
            hand,
          ),
        ).toBe("Down the Line");
        // Middle is no direction, from anywhere.
        expect(
          shotDirection(from(end, backhand, { zone: "Middle" }), hand),
        ).toBeNull();
      });
    }
  }

  test("an unknown hand never yields Inside-*", () => {
    for (const end of ["low", "high"] as const) {
      for (const half of ["deuce", "ad"] as const) {
        expect(
          shotDirection(from(end, half, { zone: "Crosscourt" }), null),
        ).toBe("Crosscourt");
        expect(
          shotDirection(from(end, half, { zone: "Down the Line" }), null),
        ).toBe("Down the Line");
      }
    }
  });

  test("null, Middle and serve zones return null", () => {
    expect(shotDirection(from("low", "ad", { zone: null }), "right")).toBe(
      null,
    );
    expect(shotDirection(from("low", "ad", { zone: "Middle" }), "right")).toBe(
      null,
    );
    expect(
      shotDirection(
        from("low", "ad", { zone: "T", shotType: "First Serve" }),
        "right",
      ),
    ).toBeNull();
  });

  test("an unmeasured contact keeps the plain zone", () => {
    expect(
      shotDirection(
        shot({ zone: "Crosscourt", contactX: null, contactY: null }),
        "right",
      ),
    ).toBe("Crosscourt");
  });
});

test.describe("inferHand", () => {
  /** `n` forehands by player 1, `deuce` of them from the deuce half, spread over both ends. */
  function forehands(n: number, deuce: number, isPlayer1 = true) {
    const shots: MatchShot[] = [];
    for (let i = 0; i < n; i += 1) {
      const end = i % 2 === 0 ? "low" : "high";
      shots.push(from(end, i < deuce ? "deuce" : "ad", { isPlayer1 }));
    }
    return [pt({ id: `p-${n}-${deuce}-${isPlayer1}`, shots })];
  }

  test("≥10 forehands, ≥65% from the deuce half → right", () => {
    expect(inferHand(forehands(10, 7), true)).toBe("right");
    expect(inferHand(forehands(20, 13), true)).toBe("right"); // exactly 65%
  });

  test("≥10 forehands, ≥65% from the ad half → left", () => {
    expect(inferHand(forehands(10, 3), true)).toBe("left");
    expect(inferHand(forehands(20, 7), true)).toBe("left"); // exactly 65% ad
  });

  test("below the sample size → null, however lopsided", () => {
    expect(inferHand(forehands(9, 9), true)).toBeNull();
    expect(inferHand(forehands(9, 0), true)).toBeNull();
  });

  test("below the margin → null", () => {
    expect(inferHand(forehands(20, 12), true)).toBeNull(); // 60% deuce
    expect(inferHand(forehands(20, 8), true)).toBeNull(); // 60% ad
    expect(inferHand(forehands(10, 5), true)).toBeNull();
  });

  test("counts only that player's measured forehands with shotNumber ≥ 1", () => {
    const noise: MatchShot[] = [
      // The other player's forehands.
      ...Array.from({ length: 12 }, () =>
        from("low", "ad", { isPlayer1: false }),
      ),
      // This player's backhands and serves.
      ...Array.from({ length: 12 }, () =>
        from("low", "ad", { shotType: "Backhand" }),
      ),
      ...Array.from({ length: 12 }, () =>
        from("low", "ad", { shotType: "First Serve", shotNumber: 1 }),
      ),
      // Faulted serves / feeds and unmeasured contacts.
      ...Array.from({ length: 12 }, () => from("low", "ad", { shotNumber: 0 })),
      ...Array.from({ length: 12 }, () =>
        shot({ contactX: null, contactY: null }),
      ),
    ];
    const points = [...forehands(10, 10), pt({ id: "noise", shots: noise })];
    expect(inferHand(points, true)).toBe("right");
    // Player 2 has 12 ad-half forehands of their own.
    expect(inferHand(points, false)).toBe("left");
  });

  test("points without shots infer nothing", () => {
    expect(inferHand([pt({ id: "bare" })], true)).toBeNull();
  });
});

test.describe("spin normalisation", () => {
  test("serve spins", () => {
    expect(normalizeServeSpin("flat")).toBe("Flat");
    expect(normalizeServeSpin("slice")).toBe("Slice");
    expect(normalizeServeSpin("sidespin")).toBe("Slice");
    expect(normalizeServeSpin("kick")).toBe("Kick");
    expect(normalizeServeSpin("topspin")).toBe("Kick");
    expect(normalizeServeSpin("FLAT")).toBe("Flat");
    expect(normalizeServeSpin(" Sidespin ")).toBe("Slice");
    expect(normalizeServeSpin("TopSpin")).toBe("Kick");
    expect(normalizeServeSpin("backspin")).toBeNull();
    expect(normalizeServeSpin("unknown")).toBeNull();
    expect(normalizeServeSpin("")).toBeNull();
    expect(normalizeServeSpin(null)).toBeNull();
    expect(normalizeServeSpin(undefined)).toBeNull();
    expect(normalizeServeSpin("constructor")).toBeNull();
  });

  test("return spins", () => {
    expect(normalizeReturnSpin("topspin")).toBe("Topspin");
    expect(normalizeReturnSpin("slice")).toBe("Slice");
    expect(normalizeReturnSpin("backspin")).toBe("Slice");
    expect(normalizeReturnSpin("TOPSPIN")).toBe("Topspin");
    expect(normalizeReturnSpin(" BackSpin ")).toBe("Slice");
    expect(normalizeReturnSpin("flat")).toBeNull();
    expect(normalizeReturnSpin("sidespin")).toBeNull();
    expect(normalizeReturnSpin("kick")).toBeNull();
    expect(normalizeReturnSpin(null)).toBeNull();
    expect(normalizeReturnSpin("toString")).toBeNull();
  });
});
