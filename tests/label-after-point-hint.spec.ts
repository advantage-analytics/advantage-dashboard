import { expect, test } from "@playwright/test";

import { markHover } from "@/lib/services/labels/marks-copy";
import {
  endingStale,
  secondServeAsFirst,
  shotAfterPointEnd,
} from "@/lib/services/labels/marks-state";
import type { LabelShot } from "@/lib/services/labels/session";
import { POINT_1_SHOTS } from "./fixtures/label-session";

/**
 * The hints read off the labelled rows (marks-state.ts): "Shot after the
 * point ended?" — a stroke whose own coordinates say out or net, with exactly
 * one stroke after it — then "Ending looks stale" and "Second serve?".
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

test("the second-to-last stroke lands out, one stroke follows", () => {
  const point = {
    shots: [stroke("a", IN), stroke("b", LONG), stroke("c", IN)],
  };
  const hint = shotAfterPointEnd(point);
  expect(hint).toEqual({
    code: "shot_after_point_end",
    tier: "hint",
    scope: "point",
    params: { landed: 2, extra: 3, result: "out" },
  });
  expect(markHover(hint!, NAMES)).toBe(
    "Shot 2 lands out and one more shot follows. Shot 3 may be a swing after the point ended.",
  );
});

test("in the net reads as the net", () => {
  const hint = shotAfterPointEnd({
    shots: [stroke("a", NETTED), stroke("b", IN)],
  });
  expect(hint?.params).toEqual({ landed: 1, extra: 2, result: "net" });
  expect(markHover(hint!, NAMES)).toContain("Shot 1 lands in the net");
});

test("nothing when the stroke before the last is in, unplaced, or a serve", () => {
  expect(
    shotAfterPointEnd({ shots: [stroke("a", IN), stroke("b", LONG)] }),
  ).toBeNull();
  expect(
    shotAfterPointEnd({ shots: [stroke("a", null), stroke("b", IN)] }),
  ).toBeNull();
  // A serve that misses is a fault, and the stroke after it another matter.
  expect(
    shotAfterPointEnd({
      shots: [stroke("a", LONG, { stroke: "first_serve" }), stroke("b", IN)],
    }),
  ).toBeNull();
});

test("only the stroke before the LAST one: two strokes after it is a rally", () => {
  expect(
    shotAfterPointEnd({
      shots: [stroke("a", LONG), stroke("b", IN), stroke("c", IN)],
    }),
  ).toBeNull();
  expect(shotAfterPointEnd({ shots: [stroke("a", LONG)] })).toBeNull();
  expect(shotAfterPointEnd({ shots: [] })).toBeNull();
});

test("deleting the extra stroke clears it; tombstones and ghosts are not strokes", () => {
  const a = stroke("a", IN);
  const b = stroke("b", LONG);
  const c = stroke("c", IN);
  expect(
    shotAfterPointEnd({ shots: [a, b, { ...c, status: "deleted" }] }),
  ).toBeNull();
  // A ghost between or after them is numbered and counted as nothing.
  const ghost = stroke("g", IN, { siteRemoval: "hit_after_fault" });
  expect(shotAfterPointEnd({ shots: [a, b, ghost, c] })?.params).toEqual({
    landed: 2,
    extra: 3,
    result: "out",
  });
  expect(shotAfterPointEnd({ shots: [a, b, ghost] })).toBeNull();
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
