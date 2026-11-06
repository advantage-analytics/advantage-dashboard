import { expect, test } from "@playwright/test";

import {
  lineCallsFor,
  netByTrajectory,
  singlesMargin,
  type SplitStepStroke,
} from "@/lib/services/splitstep/derivation";

/**
 * Our own line calls from the vendor's trajectories file. Node-style, inline
 * fixtures only. Coordinates are vendor metres: origin at the net centre, the
 * singles court spans x ±4.115 and y ±11.885.
 */

function stroke(over: Partial<SplitStepStroke>): SplitStepStroke {
  return {
    eventId: 0,
    videoTime: 0,
    trimmedFrame: 0,
    bounceFrame: null,
    rallyId: 1,
    strokeNumber: 1,
    playerLabel: "A",
    predPointScore: "0-0",
    predGameScore: "0-0",
    predSetScore: "0-0",
    strokeType: "groundstroke",
    strokeSide: "forehand",
    strokeScore: 1,
    sideScore: 1,
    playerX: 0,
    playerY: -11,
    opponentX: 0,
    opponentY: 11,
    speedKmh: 100,
    spinType: "flat",
    initialHeightM: 1,
    heightAtNetM: 1.5,
    netHit: false,
    bounceX: null,
    bounceY: null,
    bounceScore: 1,
    in: true,
    lineConfidence: 0.9,
    ...over,
  };
}

/** One trajectory row; every flight here starts at stroke frame 100. */
function row(
  frame: number,
  x: number,
  y: number,
  z: number,
  bounceFrame = 110,
  strokeFrame = 100,
) {
  return {
    stroke_frame: strokeFrame,
    bounce_frame: bounceFrame,
    frame,
    ball_x_px: 0,
    ball_y_px: 0,
    ball_x_m: x,
    ball_y_m: y,
    ball_z_m: z,
  };
}

test.describe("singlesMargin", () => {
  test("is the distance to the nearest singles line, negative outside", () => {
    expect(singlesMargin(0, 0)).toBeCloseTo(4.115);
    expect(singlesMargin(3.9, 5)).toBeCloseTo(0.215);
    expect(singlesMargin(0, 12.3)).toBeCloseTo(-0.415);
    expect(singlesMargin(-4.5, -3)).toBeCloseTo(-0.385);
  });
});

test.describe("lineCallsFor", () => {
  const s = stroke({ trimmedFrame: 100 });
  const flight = [
    row(100, 0, -11, 1),
    row(104, 0, -2, 1.6),
    row(106, 0, 2, 1.4),
    row(110, 1, 12.4, 0.03),
    row(112, 1.2, 13.5, 0.4),
  ];

  test("takes the bounce from the trajectory row at bounce_frame", () => {
    const call = lineCallsFor([s], flight).get(s)!;
    expect(call.source).toBe("trajectory");
    expect(call.margin).toBeCloseTo(11.885 - 12.4);
  });

  test("interpolates the height where the flight crosses the net", () => {
    // y goes -2 → 2 between frames 104 and 106: halfway, z = 1.5.
    expect(lineCallsFor([s], flight).get(s)!.netClearance).toBe(1.5);
  });

  test("a flight that never crosses the net has no clearance", () => {
    const short = [row(100, 0, -11, 1), row(110, 0, -3, 0.02)];
    expect(lineCallsFor([s], short).get(s)!.netClearance).toBeNull();
  });

  test("falls back to the stroke's own bounce when there is no flight", () => {
    const own = stroke({ trimmedFrame: 200, bounceX: 4.3, bounceY: 6 });
    const call = lineCallsFor([own], flight).get(own)!;
    expect(call.source).toBe("strokes");
    expect(call.margin).toBeCloseTo(4.115 - 4.3);
  });

  test("with no file at all, every call comes from the strokes", () => {
    const own = stroke({ trimmedFrame: 100, bounceX: 0, bounceY: 5 });
    expect(lineCallsFor([own], null).get(own)!.source).toBe("strokes");
  });

  test("no bounce anywhere means no margin", () => {
    const bare = stroke({ trimmedFrame: 300 });
    expect(lineCallsFor([bare], flight).get(bare)).toEqual({
      margin: null,
      netClearance: null,
      source: null,
    });
  });

  test("a bounce frame before the contact is not a bounce", () => {
    const early = flight.map((r) => ({ ...r, bounce_frame: 90 }));
    const own = stroke({ trimmedFrame: 100, bounceX: 0, bounceY: 5 });
    expect(lineCallsFor([own], early).get(own)!.source).toBe("strokes");
  });

  test("anything but an array is refused, as for the strokes file", () => {
    expect(() => lineCallsFor([s], { rows: [] })).toThrow();
  });
});

test.describe("pastBounce and net_by_trajectory", () => {
  // A flight from y -11 crossing the net plane at `netZ`, bouncing at frame
  // 110 near y +6, and either stopping there (old model) or running on.
  const flight = (netZ: number, runOn: boolean) => {
    const rows = [
      row(100, 0, -11, 1),
      row(105, 0, -0.5, netZ),
      row(106, 0, 0.5, netZ),
      row(110, 0, 6, 0),
    ];
    if (runOn) rows.push(row(115, 0, 9, 0.6), row(125, 0, 13, 0.8));
    return rows;
  };
  const last = stroke({
    trimmedFrame: 100,
    bounceFrame: 110,
    bounceX: 0,
    bounceY: 6,
  });
  const serve = stroke({ playerLabel: "B", strokeType: "serve", eventId: 9 });
  const rally = {
    rallyId: 1,
    strokes: [serve, last],
    server: "B",
    serves: [serve],
  };

  test("reads true only when the file's flights run past the bounce", () => {
    expect(lineCallsFor([last], flight(0.5, true)).get(last)?.pastBounce).toBe(
      true,
    );
    expect(
      lineCallsFor([last], flight(0.5, false)).get(last)?.pastBounce,
    ).toBeUndefined();
  });

  test("a low crossing on a run-on file, no net call, bounce past the net", () => {
    expect(
      netByTrajectory(rally, lineCallsFor([last], flight(0.5, true))),
    ).toBe(true);
    // Old-model file: the same low crossing says nothing.
    expect(
      netByTrajectory(rally, lineCallsFor([last], flight(0.5, false))),
    ).toBe(false);
    // Cleared the tape by enough.
    expect(
      netByTrajectory(rally, lineCallsFor([last], flight(1.2, true))),
    ).toBe(false);
    // The vendor already called it net.
    const called = { ...last, netHit: true };
    expect(
      netByTrajectory(
        { ...rally, strokes: [serve, called] },
        lineCallsFor([called], flight(0.5, true)),
      ),
    ).toBe(false);
    // A bounce on the hitter's own side already reads as net.
    const ownSide = { ...last, bounceY: -3 };
    expect(
      netByTrajectory(
        { ...rally, strokes: [serve, ownSide] },
        lineCallsFor([ownSide], flight(0.5, true)),
      ),
    ).toBe(false);
  });

  test("a serve the point ends on is never asked", () => {
    const ace = stroke({
      strokeType: "serve",
      trimmedFrame: 100,
      bounceFrame: 110,
      bounceX: 0,
      bounceY: 6,
    });
    expect(
      netByTrajectory(
        { rallyId: 1, strokes: [ace], server: "A", serves: [ace] },
        lineCallsFor([ace], flight(0.5, true)),
      ),
    ).toBe(false);
  });
});
