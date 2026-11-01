import { expect, test } from "@playwright/test";

import { hintLabel, markHover } from "@/lib/services/labels/marks-copy";
import {
  endingStale,
  lastLandingMissing,
  lastShotUnresolved,
  placementMissing,
  pointEndedEarly,
  secondServeAsFirst,
  serveAfterServeIn,
  thinTracking,
} from "@/lib/services/labels/marks-state";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import { POINT_1_SHOTS } from "./fixtures/label-session";

/**
 * The hints read off the labelled rows (marks-state.ts): "Point ended here" —
 * the second-to-last stroke, when its ball was out —
 * then "Ending looks stale", "Second serve?", "No landing on the last shot"
 * (with its counted twin "Ending can't be read") and "Serve after a serve in
 * play". The well draws the ones about a stroke under it and asks the rest
 * as the court panel's current item (label-black-marks.spec.ts); these
 * read the rows.
 */

const NAMES = { p1: "Lee", p2: "Vargas" };

/** A stroke hit from the near baseline; `landing` decides in, out or net. */
function stroke(
  id: string,
  landing: { x: number; y: number } | null,
  over: Partial<LabelShot> = {},
): LabelShot {
  return {
    ...POINT_1_SHOTS[0],
    id,
    status: "kept",
    stroke: "forehand",
    unclear: [],
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    contactX: 0,
    contactY: 0,
    landingX: landing?.x ?? null,
    landingY: landing?.y ?? null,
    ...over,
  };
}

const IN = { x: 0, y: 20 };
const LONG = { x: 0, y: 25 };
const NETTED = { x: 0, y: 8 };

test.describe("pointEndedEarly", () => {
  test("an out ball with one stroke after it; with more after it, play went on", () => {
    const one = pointEndedEarly(
      { shots: [stroke("a", IN), stroke("b", LONG), stroke("c", IN)] },
      true,
    );
    expect(one).toEqual({
      code: "shot_after_point_end",
      tier: "hint",
      scope: "point",
      params: { shotId: "b", after: ["c"] },
    });
    expect(hintLabel(one!)).toBe("Did the point end here? 1 shot follows");
    expect(markHover(one!, NAMES)).toBe(
      "This shot reads as out, yet one more stroke follows it. If the point ended here, answer yes to mark it out and remove that stroke, or split it into its own point. If the call is wrong, fix the landing or dismiss this.",
    );

    const three = pointEndedEarly(
      {
        shots: [
          stroke("a", LONG),
          stroke("b", IN),
          stroke("c", IN),
          stroke("d", IN),
        ],
      },
      true,
    );
    expect(three).toBeNull();
  });

  test("only the second-to-last stroke: an earlier out read is the point still going", () => {
    const hint = pointEndedEarly(
      {
        shots: [
          stroke("a", LONG),
          stroke("b", IN),
          stroke("c", LONG),
          stroke("d", IN),
        ],
      },
      true,
    );
    expect(hint?.params).toEqual({ shotId: "c", after: ["d"] });
  });

  test("never a net read: the vendor's bounce on the hitter's own side is usually the incoming one", () => {
    expect(
      pointEndedEarly(
        { shots: [stroke("a", IN), stroke("b", NETTED), stroke("c", IN)] },
        true,
      ),
    ).toBeNull();
  });

  test("the result is the coordinates' when all four are placed, the stored one until then", () => {
    // Placed in, stored out: the coordinates win.
    expect(
      pointEndedEarly(
        { shots: [stroke("a", IN, { result: "out" }), stroke("b", IN)] },
        true,
      ),
    ).toBeNull();
    // No landing, stored out: the stored result stands.
    expect(
      pointEndedEarly(
        { shots: [stroke("a", null, { result: "out" }), stroke("b", IN)] },
        true,
      )?.params,
    ).toEqual({ shotId: "a", after: ["b"] });
    expect(
      pointEndedEarly(
        { shots: [stroke("a", null, { result: "net" }), stroke("b", IN)] },
        true,
      ),
    ).toBeNull();
    expect(
      pointEndedEarly(
        { shots: [stroke("a", null, { result: null }), stroke("b", IN)] },
        true,
      ),
    ).toBeNull();
  });

  test("a second serve out is a double fault: the stroke after it was hit after the point ended", () => {
    const serves = (second: { x: number; y: number }) => [
      stroke("a", LONG, { stroke: "first_serve" }),
      stroke("b", second, { stroke: "second_serve" }),
    ];
    expect(
      pointEndedEarly({ shots: [...serves(LONG), stroke("c", IN)] }, true)
        ?.params,
    ).toEqual({ shotId: "b", after: ["c"] });
    // Netted, or with a rally after it: not asked.
    expect(
      pointEndedEarly({ shots: [...serves(NETTED), stroke("c", IN)] }, true),
    ).toBeNull();
    expect(
      pointEndedEarly(
        {
          shots: [
            ...serves(LONG),
            stroke("c", IN),
            stroke("d", IN),
            stroke("e", IN),
          ],
        },
        true,
      ),
    ).toBeNull();
  });

  test("nothing when the out ball is the last stroke, is a serve, or there is none", () => {
    expect(
      pointEndedEarly({ shots: [stroke("a", IN), stroke("b", LONG)] }, true),
    ).toBeNull();
    // A serve that misses is a fault, and the stroke after it another matter.
    expect(
      pointEndedEarly(
        {
          shots: [
            stroke("a", LONG, { stroke: "first_serve" }),
            stroke("b", IN),
          ],
        },
        true,
      ),
    ).toBeNull();
    expect(pointEndedEarly({ shots: [stroke("a", LONG)] }, true)).toBeNull();
    expect(pointEndedEarly({ shots: [] }, true)).toBeNull();
  });

  test("strokes are read in video order, and only live ones", () => {
    const a = stroke("a", IN, { videoTime: 1 });
    const b = stroke("b", LONG, { videoTime: 2 });
    const c = stroke("c", IN, { videoTime: 3 });
    expect(pointEndedEarly({ shots: [c, a, b] }, true)?.params).toEqual({
      shotId: "b",
      after: ["c"],
    });
    // Deleting the extra stroke clears it.
    expect(
      pointEndedEarly({ shots: [a, b, { ...c, status: "deleted" }] }, true),
    ).toBeNull();
    // A ghost is no stroke with marks on, and a stroke without.
    const ghost = stroke("g", IN, {
      videoTime: 2.5,
      siteRemoval: "hit_after_fault",
    });
    expect(pointEndedEarly({ shots: [a, b, ghost, c] }, true)?.params).toEqual({
      shotId: "b",
      after: ["c"],
    });
    expect(pointEndedEarly({ shots: [a, b, ghost] }, true)).toBeNull();
    expect(pointEndedEarly({ shots: [a, b, ghost] }, false)?.params).toEqual({
      shotId: "b",
      after: ["g"],
    });
  });
});

// ── The two other hints read off the rows ──────────────────────────────────

/** Lee's serve from the near baseline; `result` as stored. */
const serve = (
  id: string,
  result: LabelShot["result"],
  over: Partial<LabelShot> = {},
) => stroke(id, null, { hitter: "p1", stroke: "first_serve", result, ...over });

test.describe("endingStale", () => {
  const rally = [
    serve("a", "in", { videoTime: 1 }),
    stroke("b", null, { hitter: "p2", result: "out", videoTime: 2 }),
  ];

  test("the stored ending or ended-by differs from what the strokes derive, or none is stored", () => {
    // Vargas's return out, right after the serve: Lee's service winner.
    const derived = {
      code: "ending_stale",
      tier: "hint",
      scope: "point",
      params: { ending: "service_winner", endedBy: "p2", winner: "p1" },
    };
    expect(
      endingStale(
        { ending: "winner", endedBy: "p1", winner: "p1", shots: rally },
        true,
      ),
    ).toEqual(derived);
    expect(
      endingStale(
        { ending: "service_winner", endedBy: "p1", winner: "p1", shots: rally },
        true,
      ),
    ).toEqual(derived);
    expect(
      endingStale(
        { ending: null, endedBy: null, winner: null, shots: rally },
        true,
      ),
    ).toEqual(derived);
    // What the rows already say is no hint.
    expect(
      endingStale(
        { ending: "service_winner", endedBy: "p2", winner: "p1", shots: rally },
        true,
      ),
    ).toBeNull();
    expect(
      markHover(
        endingStale(
          { ending: null, endedBy: null, winner: null, shots: rally },
          true,
        )!,
        NAMES,
      ),
    ).toBe(
      "The shots add up to a service winner by Lee, not the ending this point has. Check the clip: change it, or leave it if the shots are what's wrong.",
    );
  });

  test("nothing for a let or a non-point, and nothing while the rows say nothing", () => {
    for (const held of ["let_replayed", "not_a_point"] as const) {
      expect(
        endingStale(
          { ending: held, endedBy: null, winner: null, shots: rally },
          true,
        ),
      ).toBeNull();
    }
    expect(
      endingStale(
        { ending: null, endedBy: null, winner: null, shots: [] },
        true,
      ),
    ).toBeNull();
    expect(
      endingStale(
        {
          ending: null,
          endedBy: null,
          winner: null,
          shots: [serve("a", "out")],
        },
        true,
      ),
    ).toBeNull();
  });

  test("a ghost is no stroke with marks on, and a stroke without", () => {
    // Two faulted serves around the site's removed swings: a double fault,
    // not a winner by the ghost's hitter.
    const rows = [
      serve("a", "out", { videoTime: 1 }),
      stroke("g1", null, {
        hitter: "p2",
        result: null,
        videoTime: 2,
        siteRemoval: "hit_after_fault",
      }),
      serve("b", "out", { videoTime: 3 }),
      stroke("g2", null, {
        hitter: "p2",
        result: null,
        videoTime: 4,
        siteRemoval: "hit_after_fault",
      }),
    ];
    const stale = {
      ending: "winner" as const,
      endedBy: "p2" as const,
      winner: "p2" as const,
      shots: rows,
    };
    expect(endingStale(stale, true)?.params).toEqual({
      ending: "double_fault",
      endedBy: "p1",
      winner: "p2",
    });
    expect(endingStale(stale, false)).toBeNull();
  });
});

test.describe("secondServeAsFirst", () => {
  test("a first serve after a faulted serve, with the action's shot", () => {
    const rows = [
      serve("a", "out", { videoTime: 1 }),
      serve("b", "in", { videoTime: 2 }),
      stroke("c", null, { hitter: "p2", videoTime: 3 }),
    ];
    expect(secondServeAsFirst({ shots: rows }, true)).toEqual({
      code: "second_serve_as_first",
      tier: "hint",
      scope: "shot",
      params: { shotId: "b" },
    });
    expect(markHover(secondServeAsFirst({ shots: rows }, true)!, NAMES)).toBe(
      "Follows a faulted serve, so it is the second serve.",
    );
    // Typed right, or after a serve that was in (a replayed serve, another
    // mark's business), or faulted but alone: nothing.
    expect(
      secondServeAsFirst(
        { shots: [rows[0], { ...rows[1], stroke: "second_serve" }, rows[2]] },
        true,
      ),
    ).toBeNull();
    expect(
      secondServeAsFirst({ shots: [serve("a", "in"), serve("b", "in")] }, true),
    ).toBeNull();
    expect(secondServeAsFirst({ shots: [serve("a", "out")] }, true)).toBeNull();
  });

  test("a let is replayed: the first serve after it stays a first serve", () => {
    // A let alone before a first serve: nothing to retype.
    expect(
      secondServeAsFirst(
        {
          shots: [
            serve("a", "let", { videoTime: 1 }),
            serve("b", "in", { videoTime: 2 }),
          ],
        },
        true,
      ),
    ).toBeNull();
    // A let between a fault and a serve typed first neither faults nor clears
    // the fault: that serve is still the second.
    expect(
      secondServeAsFirst(
        {
          shots: [
            serve("a", "out", { videoTime: 1 }),
            serve("b", "let", { videoTime: 2, stroke: "second_serve" }),
            serve("c", "in", { videoTime: 3 }),
          ],
        },
        true,
      )?.params,
    ).toEqual({ shotId: "c" });
  });

  test("the earlier serve must be live: not a tombstone, nor a ghost with marks on", () => {
    const faulted = serve("a", "out", { videoTime: 1 });
    const next = serve("b", "in", { videoTime: 2 });
    expect(
      secondServeAsFirst(
        { shots: [{ ...faulted, status: "deleted" }, next] },
        true,
      ),
    ).toBeNull();
    const ghosted = { ...faulted, siteRemoval: "hit_after_fault" as const };
    expect(secondServeAsFirst({ shots: [ghosted, next] }, true)).toBeNull();
    expect(
      secondServeAsFirst({ shots: [ghosted, next] }, false)?.params,
    ).toEqual({
      shotId: "b",
    });
  });
});

// ── The last stroke's landing ──────────────────────────────────────────────

test.describe("lastLandingMissing and lastShotUnresolved", () => {
  const MISSING = {
    code: "last_landing_missing",
    tier: "hint",
    scope: "point",
    params: {},
  };
  const UNRESOLVED = {
    code: "last_shot_unresolved",
    tier: "count",
    scope: "point",
    params: {},
  };

  test("the last live stroke has no landing: the hint; no result either: the counted mark too", () => {
    const open = {
      shots: [
        stroke("a", IN, { videoTime: 1 }),
        stroke("b", null, { result: null, videoTime: 2 }),
      ],
    };
    expect(lastLandingMissing(open, true)).toEqual(MISSING);
    expect(lastShotUnresolved(open, true)).toEqual(UNRESOLVED);
    expect(markHover(lastLandingMissing(open, true)!, NAMES)).toBe(
      "Place the last bounce to settle Out, Net or In.",
    );
    expect(markHover(lastShotUnresolved(open, true)!, NAMES)).toBe(
      "The last shot has no landing and no result, so the point’s ending is unknown.",
    );
    // A stored result settles the ending but not the landing.
    const stored = {
      shots: [open.shots[0], { ...open.shots[1], result: "out" as const }],
    };
    expect(lastLandingMissing(stored, true)).toEqual(MISSING);
    expect(lastShotUnresolved(stored, true)).toBeNull();
  });

  test("gone once the landing is placed, or marked unclear; half a landing is none", () => {
    const placed = {
      shots: [stroke("a", IN), stroke("b", LONG, { result: null })],
    };
    expect(lastLandingMissing(placed, true)).toBeNull();
    expect(lastShotUnresolved(placed, true)).toBeNull();
    for (const unclear of [
      ["landing_x"],
      ["landing_y"],
      ["result", "landing_x"],
    ]) {
      const named = {
        shots: [stroke("a", IN), stroke("b", null, { result: null, unclear })],
      };
      expect(lastLandingMissing(named, true)).toBeNull();
      expect(lastShotUnresolved(named, true)).toBeNull();
    }
    // Another field unclear says nothing about the landing.
    const other = {
      shots: [
        stroke("a", IN),
        stroke("b", null, { result: null, unclear: ["spin"] }),
      ],
    };
    expect(lastLandingMissing(other, true)).toEqual(MISSING);
    const half = {
      shots: [
        stroke("a", IN),
        stroke("b", null, { landingX: 0.5, result: null }),
      ],
    };
    expect(lastLandingMissing(half, true)).toEqual(MISSING);
    expect(lastShotUnresolved(half, true)).toEqual(UNRESOLVED);
  });

  test("the last LIVE stroke, in video order; a point with none says nothing", () => {
    const a = stroke("a", null, { result: null, videoTime: 1 });
    const b = stroke("b", LONG, { videoTime: 2 });
    expect(lastLandingMissing({ shots: [b, a] }, true)).toBeNull();
    expect(
      lastLandingMissing({ shots: [b, { ...a, videoTime: 3 }] }, true),
    ).toEqual(MISSING);
    // A tombstone after the placed stroke is not the last stroke; a ghost is
    // one only with marks off.
    expect(
      lastLandingMissing(
        { shots: [b, { ...a, videoTime: 3, status: "deleted" }] },
        true,
      ),
    ).toBeNull();
    const ghost = {
      ...a,
      videoTime: 3,
      siteRemoval: "hit_after_fault" as const,
    };
    expect(lastLandingMissing({ shots: [b, ghost] }, true)).toBeNull();
    expect(lastLandingMissing({ shots: [b, ghost] }, false)).toEqual(MISSING);
    expect(lastLandingMissing({ shots: [] }, true)).toBeNull();
    expect(lastShotUnresolved({ shots: [] }, true)).toBeNull();
  });
});

// ── A serve after a serve in play ──────────────────────────────────────────

test.describe("serveAfterServeIn", () => {
  test("a live serve right after a serve whose result is in, with the second serve's id", () => {
    const rows = [
      serve("a", "in", { videoTime: 1 }),
      serve("b", "in", { videoTime: 2 }),
      stroke("c", IN, { hitter: "p2", videoTime: 3 }),
    ];
    expect(serveAfterServeIn({ shots: rows }, true)).toEqual({
      code: "serve_after_serve_in",
      tier: "hint",
      scope: "shot",
      params: { shotId: "b" },
    });
    expect(markHover(serveAfterServeIn({ shots: rows }, true)!, NAMES)).toBe(
      "A let that was played, or two points in one rally.",
    );
    // However the two are typed.
    expect(
      serveAfterServeIn(
        { shots: [rows[0], { ...rows[1], stroke: "second_serve" }, rows[2]] },
        true,
      )?.params,
    ).toEqual({ shotId: "b" });
    // Two points in one rally: the second's serve, after a rally ball.
    const twoPoints = [
      serve("a", "in", { videoTime: 1 }),
      stroke("b", IN, { hitter: "p2", videoTime: 2 }),
      serve("c", "in", { videoTime: 3 }),
      serve("d", "in", { videoTime: 4 }),
    ];
    expect(serveAfterServeIn({ shots: twoPoints }, true)?.params).toEqual({
      shotId: "d",
    });
  });

  test("nothing after a faulted serve, an unresolved one, or a rally ball; the pair must be live", () => {
    expect(
      serveAfterServeIn({ shots: [serve("a", "out"), serve("b", "in")] }, true),
    ).toBeNull();
    expect(
      serveAfterServeIn({ shots: [serve("a", null), serve("b", "in")] }, true),
    ).toBeNull();
    expect(
      serveAfterServeIn(
        {
          shots: [
            serve("a", "in", { videoTime: 1 }),
            stroke("b", IN, { hitter: "p2", videoTime: 2 }),
            serve("c", "in", { videoTime: 3 }),
          ],
        },
        true,
      ),
    ).toBeNull();
    const first = serve("a", "in", { videoTime: 1 });
    const second = serve("b", "in", { videoTime: 2 });
    expect(
      serveAfterServeIn(
        { shots: [{ ...first, status: "deleted" }, second] },
        true,
      ),
    ).toBeNull();
    const ghosted = { ...first, siteRemoval: "hit_after_fault" as const };
    expect(serveAfterServeIn({ shots: [ghosted, second] }, true)).toBeNull();
    expect(
      serveAfterServeIn({ shots: [ghosted, second] }, false)?.params,
    ).toEqual({ shotId: "b" });
  });
  test("a let is not in: a serve after a let raises nothing, a serve after one called in still does", () => {
    const afterLet = [
      serve("a", "let", { videoTime: 1 }),
      serve("b", "in", { videoTime: 2 }),
      stroke("c", IN, { hitter: "p2", videoTime: 3 }),
    ];
    expect(serveAfterServeIn({ shots: afterLet }, true)).toBeNull();
    // Let, then first serve out, then second serve in: nothing either.
    expect(
      serveAfterServeIn(
        {
          shots: [
            serve("a", "let", { videoTime: 1 }),
            serve("b", "out", { videoTime: 2 }),
            serve("c", "in", { videoTime: 3, stroke: "second_serve" }),
          ],
        },
        true,
      ),
    ).toBeNull();
    // A serve called in, then another: still the mark, let or no let before.
    expect(
      serveAfterServeIn(
        {
          shots: [
            serve("a", "let", { videoTime: 1 }),
            serve("b", "in", { videoTime: 2 }),
            serve("c", "in", { videoTime: 3 }),
          ],
        },
        true,
      )?.params,
    ).toEqual({ shotId: "c" });
  });
});

test.describe("placementMissing", () => {
  const SERVE = { stroke: "first_serve", result: "in" } as const;
  const shots = (...list: LabelShot[]) => ({
    shots: list.map((shot, i) => ({ ...shot, videoTime: i + 1 })),
  });
  const asked = (shotId: string, stroke: "serve" | "return" | "shot") => ({
    code: "placement_missing",
    tier: "hint",
    scope: "shot",
    params: { shotId, stroke },
  });

  test("a serve in play with no landing, its return placed", () => {
    expect(
      placementMissing(
        shots(stroke("s", null, SERVE), stroke("r", IN), stroke("n", IN)),
        true,
      ),
    ).toEqual(asked("s", "serve"));
  });

  test("the serve first, then its return once the serve is placed", () => {
    const point = shots(
      stroke("s", null, SERVE),
      stroke("r", null, { result: "in" }),
      stroke("n", IN),
    );
    expect(placementMissing(point, true)?.params.shotId).toBe("s");
    point.shots[0] = { ...point.shots[0], landingX: 0, landingY: 5 };
    expect(placementMissing(point, true)).toEqual(asked("r", "return"));
  });

  test("the serve that counts, not the fault before it", () => {
    expect(
      placementMissing(
        shots(
          stroke("f", null, { stroke: "first_serve", result: "out" }),
          stroke("s", IN, { stroke: "second_serve", result: "in" }),
          stroke("r", IN),
          stroke("n", IN),
        ),
        true,
      ),
    ).toBeNull();
  });

  test("a return with no contact is asked even as the last stroke", () => {
    expect(
      placementMissing(
        shots(
          stroke("s", IN, SERVE),
          stroke("r", IN, { contactX: null, contactY: null, result: "out" }),
        ),
        true,
      ),
    ).toEqual(asked("r", "return"));
  });

  test("the last stroke's landing is its own hint, so not asked here", () => {
    expect(placementMissing(shots(stroke("s", null, SERVE)), true)).toBeNull();
    expect(
      placementMissing(
        shots(stroke("s", IN, SERVE), stroke("r", null, { result: "in" })),
        true,
      ),
    ).toBeNull();
  });

  test("a return volleyed back never bounced", () => {
    expect(
      placementMissing(
        shots(
          stroke("s", IN, SERVE),
          stroke("r", null, { result: "in" }),
          stroke("v", IN, { stroke: "forehand_volley" }),
        ),
        true,
      ),
    ).toBeNull();
  });

  test("called unclear, or a point that was not played: nothing to ask", () => {
    expect(
      placementMissing(
        shots(
          stroke("s", null, { ...SERVE, unclear: ["landing_x"] }),
          stroke("r", IN),
          stroke("n", IN),
        ),
        true,
      ),
    ).toBeNull();
    expect(
      placementMissing(
        {
          ending: "not_a_point",
          ...shots(stroke("s", null, SERVE), stroke("r", IN)),
        },
        true,
      ),
    ).toBeNull();
  });

  test("a faulted serve with no landing is not asked, a double fault included", () => {
    expect(
      placementMissing(
        shots(
          stroke("f", null, { stroke: "first_serve", result: "out" }),
          stroke("d", null, { stroke: "second_serve", result: "net" }),
        ),
        true,
      ),
    ).toBeNull();
  });

  test("a contact is asked on any of them, a fault included", () => {
    expect(
      placementMissing(
        shots(
          stroke("f", null, {
            stroke: "first_serve",
            result: "out",
            contactX: null,
            contactY: null,
          }),
          stroke("s", IN, { stroke: "second_serve", result: "in" }),
          stroke("r", IN),
        ),
        true,
      ),
    ).toEqual(asked("f", "shot"));
  });

  test("the first four strokes and the last two, not the middle", () => {
    const rally = (gap: number) =>
      shots(
        stroke("0", IN, SERVE),
        ...[1, 2, 3, 4, 5, 6, 7].map((i) =>
          stroke(String(i), i === gap ? null : IN, { result: "in" }),
        ),
      );
    expect(placementMissing(rally(3), true)).toEqual(asked("3", "shot"));
    expect(placementMissing(rally(4), true)).toBeNull();
    expect(placementMissing(rally(5), true)).toBeNull();
    expect(placementMissing(rally(6), true)).toEqual(asked("6", "shot"));
    // The last stroke's landing is "No landing on the last shot".
    expect(placementMissing(rally(7), true)).toBeNull();
  });

  test("a short rally: every stroke is in the window, and the first gap is asked", () => {
    expect(
      placementMissing(
        shots(
          stroke("s", IN, SERVE),
          stroke("r", IN),
          stroke("t", null, { result: "in" }),
          stroke("u", null, { result: "in" }),
          stroke("n", IN),
        ),
        true,
      ),
    ).toEqual(asked("t", "shot"));
  });

  test("the hover says which stroke, and that the stats lose it", () => {
    const names = { p1: "Ann", p2: "Bea" };
    expect(markHover(asked("s", "serve") as never, names)).toContain(
      "serve placement can’t count it",
    );
    expect(markHover(asked("r", "return") as never, names)).toContain(
      "return placement can’t count it",
    );
    expect(markHover(asked("t", "shot") as never, names)).toContain(
      "how the point opened or ended",
    );
  });
});

test.describe("thinTracking", () => {
  const SEED = (landing: number | null) => ({
    hitter: "p1" as const,
    stroke: "first_serve" as const,
    result: "in" as const,
    spin: null,
    contact_x: 0,
    contact_y: 0,
    landing_x: landing,
    landing_y: landing,
    video_time: 1,
  });
  const match = (total: number, missing: number): LabelPoint[] =>
    Array.from({ length: total }, (_, i) => {
      const seeded = i < missing ? null : 5;
      return {
        status: "unchanged",
        ending: "winner",
        // Placed since: the note still reads the seed.
        shots: [
          stroke("s", IN, {
            stroke: "first_serve",
            result: "in",
            seed: SEED(seeded),
          }),
        ],
      } as unknown as LabelPoint;
    });

  test("a fifth of the serves is thin, and placing them keeps the note", () => {
    expect(thinTracking(match(100, 20), true)).toEqual({
      missing: 20,
      serves: 100,
    });
  });

  test("an ordinary share, or too few serves to say, is nothing", () => {
    expect(thinTracking(match(100, 19), true)).toBeNull();
    expect(thinTracking(match(19, 10), true)).toBeNull();
  });
});
