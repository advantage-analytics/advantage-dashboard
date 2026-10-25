import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  NO_PLACEMENT,
  type PlacementState,
} from "@/components/admin/labels/court-placement";
import {
  currentPointOf,
  pinLive,
  selectionFor,
} from "@/components/admin/labels/label-now-playing";

import {
  POINT_TAIL_SECONDS,
  playingRowAt,
} from "@/lib/services/labels/playback";
import type { LabelSession, LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";

/**
 * The console's playing highlight: which point and stroke the video is on,
 * on the analysis clock (`videoTime`).
 *
 * The fixture's point 1 has live strokes at 2472.0 (serve), 2473.1 (return)
 * and 2474.4 (added), and a tombstone at 2473.6; point 2 has one stroke at
 * 2490.2; point 3 is deleted and point 4's strokes are untimed.
 */

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;

function at(
  time: number | null,
  session: LabelSession = labelSessionFixture(),
) {
  return playingRowAt(session.points, time);
}

function withShots(
  session: LabelSession,
  pointId: string,
  shots: (session: LabelSession) => LabelShot[],
): LabelSession {
  const next = shots(session);
  return {
    ...session,
    points: session.points.map((point) =>
      point.id === pointId ? { ...point, shots: next } : point,
    ),
  };
}

function stroke(id: string, pointId: string, videoTime: number | null) {
  const base = labelSessionFixture().points[0].shots[0];
  return {
    ...base,
    id,
    labelPointId: pointId,
    status: "kept",
    videoTime,
  } as LabelShot;
}

test("no time, or a time before the first stroke: nothing is playing", () => {
  expect(at(null)).toBeNull();
  expect(at(Number.NaN)).toBeNull();
  expect(at(0)).toBeNull();
  expect(at(2471.99)).toBeNull();
});

test("between two strokes, the earlier one is playing", () => {
  expect(at(2472.5)).toEqual({ pointId: P1, shotId: "s-serve" });
  expect(at(2474.0)).toEqual({ pointId: P1, shotId: "s-return" });
});

test("exactly on a stroke's time, that stroke is playing", () => {
  expect(at(2472.0)).toEqual({ pointId: P1, shotId: "s-serve" });
  expect(at(2473.1)).toEqual({ pointId: P1, shotId: "s-return" });
  expect(at(2474.4)).toEqual({ pointId: P1, shotId: "s-added" });
  expect(at(2490.2)).toEqual({ pointId: P2, shotId: "s-ace" });
});

test("a deleted stroke is skipped: the stroke before it stays playing", () => {
  // The tombstone sits at 2473.6.
  expect(at(2473.6)).toEqual({ pointId: P1, shotId: "s-return" });
  expect(at(2473.9)).toEqual({ pointId: P1, shotId: "s-return" });
});

test("the last stroke plays on for the tail, then the gap between points is dead", () => {
  expect(at(2474.4 + POINT_TAIL_SECONDS - 0.1)).toEqual({
    pointId: P1,
    shotId: "s-added",
  });
  expect(at(2474.4 + POINT_TAIL_SECONDS + 0.1)).toBeNull();
  expect(at(2485)).toBeNull();
});

test("the next point's first stroke ends a point before its tail does", () => {
  const session = withShots(labelSessionFixture(), P2, (s) => [
    { ...s.points[1].shots[0], videoTime: 2475.0 },
  ]);
  expect(at(2474.9, session)).toEqual({ pointId: P1, shotId: "s-added" });
  expect(at(2475.0, session)).toEqual({ pointId: P2, shotId: "s-ace" });
});

test("a deleted point is never playing and never cuts another short", () => {
  // Point 3 is a tombstone; give it a stroke inside point 1's rally and one
  // in the dead time after it.
  const session = withShots(labelSessionFixture(), P3, () => [
    stroke("s-p3-a", P3, 2474.0),
    stroke("s-p3-b", P3, 2485.0),
  ]);
  expect(at(2474.5, session)).toEqual({ pointId: P1, shotId: "s-added" });
  expect(at(2485.5, session)).toBeNull();
});

test("strokes and points without a video time are ignored", () => {
  // An untimed stroke inside point 1, and point 4 with only an untimed stroke.
  let session = withShots(labelSessionFixture(), P1, (s) => [
    ...s.points[0].shots,
    stroke("s-untimed", P1, null),
  ]);
  session = withShots(session, P4, () => [stroke("s-p4", P4, null)]);
  expect(at(2474.5, session)).toEqual({ pointId: P1, shotId: "s-added" });
  expect(at(2485, session)).toBeNull();
  for (const time of [2472, 2473.1, 2474.4, 2490.2, 2500]) {
    const row = at(time, session);
    expect(row?.shotId).not.toBe("s-untimed");
    expect(row?.pointId).not.toBe(P4);
  }
});

test("rows are read on the clock, not in the order they arrive", () => {
  const session = labelSessionFixture();
  const shuffled = {
    ...session,
    points: [...session.points].reverse().map((point) => ({
      ...point,
      shots: [...point.shots].reverse(),
    })),
  };
  expect(at(2472.5, shuffled)).toEqual({ pointId: P1, shotId: "s-serve" });
  expect(at(2474.5, shuffled)).toEqual({ pointId: P1, shotId: "s-added" });
  expect(at(2490.3, shuffled)).toEqual({ pointId: P2, shotId: "s-ace" });
});

// T10: the current point and the selection under it.
test.describe("currentPointOf: the pin holds while the film plays", () => {
  const points = labelSessionFixture().points;

  test("the pinned point, even while another point plays", () => {
    expect(currentPointOf({ pinned: P1, playing: P2, rest: P2, points })).toBe(
      P1,
    );
    expect(
      currentPointOf({ pinned: P1, playing: null, rest: P2, points }),
    ).toBe(P1);
  });

  test("no pin: the playing point, else where the film rested", () => {
    expect(
      currentPointOf({ pinned: null, playing: P2, rest: P1, points }),
    ).toBe(P2);
    expect(
      currentPointOf({ pinned: null, playing: null, rest: P1, points }),
    ).toBe(P1);
    expect(
      currentPointOf({ pinned: null, playing: null, rest: null, points }),
    ).toBeNull();
  });

  test("a pin on a deleted or combined-away point lets go", () => {
    // P3 is the fixture's deleted point.
    expect(pinLive(P3, points)).toBe(false);
    expect(currentPointOf({ pinned: P3, playing: P2, rest: P1, points })).toBe(
      P2,
    );
    // Combined away: no longer in the rows at all.
    expect(pinLive("p-gone", points)).toBe(false);
    expect(
      currentPointOf({ pinned: "p-gone", playing: null, rest: P1, points }),
    ).toBe(P1);
    expect(pinLive(P1, points)).toBe(true);
  });
});

test.describe("selectionFor: a selection never outlives its point", () => {
  const points = labelSessionFixture().points;
  const p1 = points.find((p) => p.id === P1)!;
  const p2 = points.find((p) => p.id === P2)!;
  const onReturn: PlacementState = {
    ...NO_PLACEMENT,
    shotId: "s-return",
    target: "landing",
  };

  test("a stroke of the current point stays selected, as it was", () => {
    expect(selectionFor(onReturn, p1)).toBe(onReturn);
  });

  test("a stroke of any other point, or no current point, is let go", () => {
    expect(selectionFor(onReturn, p2)).toEqual(NO_PLACEMENT);
    expect(selectionFor(onReturn, null)).toEqual(NO_PLACEMENT);
  });

  test("nothing selected stays nothing", () => {
    expect(selectionFor(NO_PLACEMENT, p2)).toBe(NO_PLACEMENT);
  });
});

test.describe("the console's wiring (source)", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/admin/labels/label-console.tsx"),
    "utf8",
  );

  test("one derivation of the current point, the pin being the held point", () => {
    expect(source).toContain(
      'const pinned = pointFocus.mode === "held" ? pointFocus.pointId : null;',
    );
    expect(source).toMatch(
      /const currentPointId = currentPointOf\(\{\s+pinned: pinnedPointId,\s+playing: playingPointId,\s+rest: restPointId,\s+points,\s+\}\);/,
    );
    // Playback never lets the pin go: the old row-key release is gone.
    expect(source).not.toContain("pinned.at === playingKey");
    expect(source).not.toContain("setPinned(");
  });

  test("a new current point lets go of another point's stroke in the same render", () => {
    expect(source).toContain("if (selectionPointId !== currentPointId) {");
    expect(source).toContain("const kept = selectionFor(placement, expanded);");
  });

  test("← / → and the transport's Previous / Next re-follow", () => {
    const stepFilm = source.slice(source.indexOf("function stepFilm("));
    const body = stepFilm.slice(0, stepFilm.indexOf("\n  }\n"));
    expect(body).toContain("followPlayback();");
    expect(body).toContain("player.current?.step(direction);");
    // Both key handlers step through it, never the handle directly.
    expect(source.match(/stepFilmRef\.current\(/g)).toHaveLength(2);
    expect(source).not.toMatch(/player\.current\?\.step\(key/);
    expect(source).not.toMatch(/player\.current\?\.step\(event/);
    expect(source).toContain("onStep={stepFilm}");
  });
});
