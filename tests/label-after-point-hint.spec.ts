import { expect, test } from "@playwright/test";

import { hintLabel, markHover } from "@/lib/services/labels/marks-copy";
import {
  endingStale,
  lastLandingMissing,
  lastShotUnresolved,
  pointEndedEarly,
  secondServeAsFirst,
  serveAfterServeIn,
} from "@/lib/services/labels/marks-state";
import type { LabelShot } from "@/lib/services/labels/session";
import { POINT_1_SHOTS } from "./fixtures/label-session";

/**
 * The hints read off the labelled rows (marks-state.ts): "Point ended here" —
 * the last stroke whose ball was out or in the net with strokes after it —
 * then "Ending looks stale", "Second serve?", "No landing on the last shot"
 * (with its counted twin "Ending can't be read") and "Serve after a serve in
 * play".
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
  test("the last out ball with one stroke after it, and with three", () => {
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
    expect(hintLabel(one!)).toBe("Point ended here · 1 shot after it");
    expect(markHover(one!, NAMES)).toBe(
      "The ball was out, so what follows was hit after the point ended — or a second point in the same rally.",
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
    expect(three?.params).toEqual({ shotId: "a", after: ["b", "c", "d"] });
    expect(hintLabel(three!)).toBe("Point ended here · 3 shots after it");
  });

  test("the LAST out ball: an earlier one is the point still going", () => {
    const hint = pointEndedEarly(
      {
        shots: [
          stroke("a", LONG),
          stroke("b", IN),
          stroke("c", NETTED),
          stroke("d", IN),
        ],
      },
      true,
    );
    expect(hint?.params).toEqual({ shotId: "c", after: ["d"] });
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
      )?.params,
    ).toEqual({ shotId: "a", after: ["b"] });
    expect(
      pointEndedEarly(
        { shots: [stroke("a", null, { result: null }), stroke("b", IN)] },
        true,
      ),
    ).toBeNull();
  });

  test("a second serve out or in the net is a double fault: the strokes after it were hit after the point ended", () => {
    const serves = (second: { x: number; y: number }) => [
      stroke("a", LONG, { stroke: "first_serve" }),
      stroke("b", second, { stroke: "second_serve" }),
    ];
    expect(
      pointEndedEarly({ shots: [...serves(LONG), stroke("c", IN)] }, true)
        ?.params,
    ).toEqual({ shotId: "b", after: ["c"] });
    // Three after it: too many to take with the edit, so the hint offers it.
    const three = pointEndedEarly(
      {
        shots: [
          ...serves(NETTED),
          stroke("c", IN),
          stroke("d", IN),
          stroke("e", IN),
        ],
      },
      true,
    );
    expect(three?.params).toEqual({ shotId: "b", after: ["c", "d", "e"] });
    expect(hintLabel(three!)).toBe("Point ended here · 3 shots after it");
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
    ).toBe("The strokes say a service winner by Vargas.");
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
