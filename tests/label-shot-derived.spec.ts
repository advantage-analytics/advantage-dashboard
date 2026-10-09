import { expect, test } from "@playwright/test";

import { NET_Y } from "@/components/admin/labels/court-geometry";
import {
  deriveShotResult,
  positionPatch,
  shotPlacement,
  type ShotPosition,
} from "@/lib/services/labels/shot-derived";
import {
  BASELINE_M,
  directionZone,
  serveZone,
} from "@/lib/services/splitstep/derivation/court";

/** A forehand struck near the near baseline, landing where `landing` says. */
function rally(
  landing: { x: number; y: number },
  overrides: Partial<ShotPosition> = {},
): ShotPosition {
  return {
    stroke: "forehand",
    contact_x: 2,
    contact_y: 0.5,
    landing_x: landing.x,
    landing_y: landing.y,
    ...overrides,
  };
}

/** A first serve from the near deuce side (right of the centre mark). */
function serve(
  landing: { x: number; y: number },
  overrides: Partial<ShotPosition> = {},
): ShotPosition {
  return rally(landing, {
    stroke: "first_serve",
    contact_x: 1,
    contact_y: -0.3,
    ...overrides,
  });
}

test.describe("deriveShotResult", () => {
  test("the net sits where the derivation's court puts it", () => {
    expect(BASELINE_M).toBe(NET_Y);
  });

  test("a ball that comes down on the hitter's side is a net ball", () => {
    expect(deriveShotResult(rally({ x: 0.5, y: 11.2 }))).toBe("net");
    expect(deriveShotResult(serve({ x: -1, y: 10 }))).toBe("net");
    // The same for the far player, whose side is past the net.
    expect(
      deriveShotResult(rally({ x: 0.5, y: 12.4 }, { contact_y: 23 })),
    ).toBe("net");
    // On the net line itself: it never crossed.
    expect(deriveShotResult(rally({ x: 0, y: NET_Y }))).toBe("net");
  });

  test("a serve into the diagonal box is in", () => {
    expect(deriveShotResult(serve({ x: -2, y: 16 }))).toBe("in");
    expect(
      deriveShotResult(serve({ x: -2, y: 16 }, { stroke: "second_serve" })),
    ).toBe("in");
    // Lines are in: the service line, the singles sideline, the centre line.
    expect(deriveShotResult(serve({ x: -4.115, y: NET_Y + 6.4 }))).toBe("in");
    expect(deriveShotResult(serve({ x: 0, y: 15 }))).toBe("in");
    // From the far end, the box is on the near side of the net.
    expect(
      deriveShotResult(
        serve({ x: 2, y: 7 }, { contact_x: -1, contact_y: 24.1 }),
      ),
    ).toBe("in");
  });

  test("a serve into the wrong box is out", () => {
    // Same side of the centre line as the server: the other service box.
    expect(deriveShotResult(serve({ x: 2, y: 16 }))).toBe("out");
    // Right box, but past the service line or into the doubles alley.
    expect(deriveShotResult(serve({ x: -2, y: 18.5 }))).toBe("out");
    expect(deriveShotResult(serve({ x: -4.5, y: 16 }))).toBe("out");
  });

  test("a server on the centre mark may hit either box", () => {
    expect(deriveShotResult(serve({ x: 2, y: 16 }, { contact_x: 0 }))).toBe(
      "in",
    );
    expect(deriveShotResult(serve({ x: -2, y: 16 }, { contact_x: 0 }))).toBe(
      "in",
    );
  });

  test("a rally ball inside the singles court is in", () => {
    expect(deriveShotResult(rally({ x: -3, y: 21 }))).toBe("in");
    // Past the service line, where a serve would be long.
    expect(deriveShotResult(rally({ x: 4.115, y: 23.77 }))).toBe("in");
    // The far player hitting into the near court, down to its baseline.
    expect(deriveShotResult(rally({ x: 1, y: 0 }, { contact_y: 24.5 }))).toBe(
      "in",
    );
    // A stroke nobody has typed yet is judged as a rally ball.
    expect(deriveShotResult(rally({ x: -3, y: 21 }, { stroke: null }))).toBe(
      "in",
    );
  });

  test("a long rally ball is out", () => {
    expect(deriveShotResult(rally({ x: 0, y: 23.78 }))).toBe("out");
    expect(deriveShotResult(rally({ x: 1, y: 25.4 }))).toBe("out");
    expect(
      deriveShotResult(rally({ x: 1, y: -0.2 }, { contact_y: 24.5 })),
    ).toBe("out");
  });

  test("a wide rally ball is out", () => {
    expect(deriveShotResult(rally({ x: 4.12, y: 18 }))).toBe("out");
    expect(deriveShotResult(rally({ x: -5.2, y: 18 }))).toBe("out");
  });

  test("a missing coordinate derives nothing", () => {
    const whole = rally({ x: 1, y: 18 });
    for (const field of [
      "contact_x",
      "contact_y",
      "landing_x",
      "landing_y",
    ] as const) {
      expect(deriveShotResult({ ...whole, [field]: null }), field).toBeNull();
    }
  });
});

test.describe("shotPlacement", () => {
  test("a serve is bucketed by serveZone on its landing x", () => {
    for (const x of [0.4, -1.37, 2, -2.74, 3.9]) {
      expect(shotPlacement(serve({ x, y: 16 })), String(x)).toBe(serveZone(x));
    }
    expect(shotPlacement(serve({ x: 0.4, y: 16 }))).toBe("T");
    expect(shotPlacement(serve({ x: 2, y: 16 }))).toBe("Body");
    expect(
      shotPlacement(serve({ x: -3.9, y: 16 }, { stroke: "second_serve" })),
    ).toBe("Wide");
  });

  test("anything else is bucketed by directionZone", () => {
    // Struck from x = +2: across the centre line is crosscourt.
    expect(shotPlacement(rally({ x: -3, y: 20 }))).toBe("Crosscourt");
    expect(shotPlacement(rally({ x: 3, y: 20 }))).toBe("Down the Line");
    expect(shotPlacement(rally({ x: 0.6, y: 20 }))).toBe("Middle");
    expect(shotPlacement(rally({ x: -3, y: 20 }))).toBe(directionZone(-3, 2));
    // The frame does not flip with the hitter's end.
    expect(shotPlacement(rally({ x: -3, y: 3 }, { contact_y: 23 }))).toBe(
      "Crosscourt",
    );
  });

  test("placement is unmeasured without the coordinates it reads", () => {
    expect(
      shotPlacement(serve({ x: 1, y: 16 }, { landing_x: null })),
    ).toBeNull();
    expect(
      shotPlacement(rally({ x: -3, y: 20 }, { contact_x: null })),
    ).toBeNull();
  });
});

test.describe("positionPatch", () => {
  test("a moved end carries the derived result with the coordinates", () => {
    expect(
      positionPatch(serve({ x: -2, y: 16 }, { result: "out" }), "landing", {
        x: -2,
        y: 16,
      }),
    ).toEqual({ landing_x: -2, landing_y: 16, result: "in" });
    expect(
      positionPatch(rally({ x: 1, y: 18 }, { result: "in" }), "landing", {
        x: 1,
        y: 25,
      }),
    ).toEqual({ landing_x: 1, landing_y: 25, result: "out" });
  });

  test("a stored let is left alone: coordinates only, no result key", () => {
    const patch = positionPatch(
      serve({ x: -2, y: 16 }, { result: "let" }),
      "landing",
      { x: -2, y: 16 },
    );
    expect(patch).toEqual({ landing_x: -2, landing_y: 16 });
    expect("result" in patch).toBe(false);
    expect(
      positionPatch(serve({ x: -2, y: 16 }, { result: "let" }), "contact", {
        x: 0.5,
        y: -0.2,
      }),
    ).toEqual({ contact_x: 0.5, contact_y: -0.2 });
  });

  test("a stray let on a rally stroke is not kept: the derived result replaces it", () => {
    expect(
      positionPatch(rally({ x: 1, y: 18 }, { result: "let" }), "landing", {
        x: 1,
        y: 25,
      }),
    ).toEqual({ landing_x: 1, landing_y: 25, result: "out" });
  });

  test("a cleared end carries no result either way", () => {
    expect(
      positionPatch(serve({ x: -2, y: 16 }, { result: "in" }), "landing", null),
    ).toEqual({ landing_x: null, landing_y: null });
  });
});
