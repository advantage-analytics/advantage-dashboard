import { expect, test } from "@playwright/test";

import {
  deriveEnding,
  endingPatchForShotChange,
} from "@/lib/services/labels/ending-derived";
import type {
  LabelEnding,
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";

/**
 * T28: "How it ended" read off the shot rows. `deriveEnding` looks at the
 * point's last live stroke in video order; `endingPatchForShotChange` is the
 * console's rule for when a shot change sends a point patch.
 */

let clock = 0;

/** A stroke, timed after every stroke made before it. */
function shot(fields: Partial<LabelShot>): LabelShot {
  clock += 1;
  return {
    id: `s-${clock}`,
    labelPointId: "p-1",
    eventId: clock,
    afterEventId: null,
    status: "kept",
    statusBeforeDelete: null,
    deleteReason: null,
    hitter: "p1",
    stroke: "forehand",
    result: "in",
    spin: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime: clock,
    seed: null,
    ...fields,
  };
}

const serve = (fields: Partial<LabelShot> = {}) =>
  shot({ hitter: "p1", stroke: "first_serve", ...fields });
const p1 = (fields: Partial<LabelShot> = {}) =>
  shot({ hitter: "p1", ...fields });
const p2 = (fields: Partial<LabelShot> = {}) =>
  shot({ hitter: "p2", ...fields });

function point(
  shots: LabelShot[],
  winner: LabelSide | null = null,
  ending: LabelEnding | null = null,
  endedBy: LabelSide | null = null,
): Pick<LabelPoint, "winner" | "shots" | "ending" | "endedBy"> {
  return { winner, shots, ending, endedBy };
}

test.describe("deriveEnding", () => {
  test("no live stroke says nothing", () => {
    expect(deriveEnding(point([]))).toBeNull();
    expect(deriveEnding(point([serve({ status: "deleted" })]))).toBeNull();
  });

  test("an unreturned serve is an ace", () => {
    expect(deriveEnding(point([serve()], "p1"))).toEqual({
      ending: "ace",
      endedBy: "p1",
    });
    // A serve with no result yet reads the same: nothing came back.
    expect(deriveEnding(point([serve({ result: null })]))?.ending).toBe("ace");
    // A second serve that stayed in, after a fault.
    expect(
      deriveEnding(
        point([serve({ result: "net" }), serve({ stroke: "second_serve" })]),
      )?.ending,
    ).toBe("ace");
  });

  test("a return into the net is a service winner", () => {
    expect(deriveEnding(point([serve(), p2({ result: "net" })], "p1"))).toEqual(
      { ending: "service_winner", endedBy: "p2" },
    );
    expect(deriveEnding(point([serve(), p2({ result: "out" })]))?.ending).toBe(
      "service_winner",
    );
  });

  test("a second serve out is a double fault", () => {
    expect(
      deriveEnding(
        point(
          [
            serve({ result: "net" }),
            serve({ stroke: "second_serve", result: "out" }),
          ],
          "p2",
        ),
      ),
    ).toEqual({ ending: "double_fault", endedBy: "p1" });
    // A lone missed second serve, the first never recorded.
    expect(
      deriveEnding(point([serve({ stroke: "second_serve", result: "net" })]))
        ?.ending,
    ).toBe("double_fault");
    // Two faults both typed as first serves: the earlier serve decides.
    expect(
      deriveEnding(point([serve({ result: "out" }), serve({ result: "out" })]))
        ?.ending,
    ).toBe("double_fault");
  });

  test("a lone faulted first serve says nothing", () => {
    expect(deriveEnding(point([serve({ result: "out" })]))).toBeNull();
    expect(deriveEnding(point([serve({ result: "net" })]))).toBeNull();
    // A deleted earlier serve is not an earlier serve.
    expect(
      deriveEnding(
        point([serve({ status: "deleted" }), serve({ result: "out" })]),
      ),
    ).toBeNull();
  });

  test("the last rally ball out is an error", () => {
    expect(
      deriveEnding(point([serve(), p2(), p1({ result: "out" })], "p2")),
    ).toEqual({ ending: "error", endedBy: "p1" });
    expect(
      deriveEnding(point([serve(), p2(), p1(), p2({ result: "net" })]))?.ending,
    ).toBe("error");
  });

  test("the last ball in, by the winner, is a winner", () => {
    expect(deriveEnding(point([serve(), p2(), p1()], "p1"))).toEqual({
      ending: "winner",
      endedBy: "p1",
    });
    // No winner labelled, or no result yet: still a winner.
    expect(deriveEnding(point([serve(), p2()]))?.ending).toBe("winner");
    expect(
      deriveEnding(point([serve(), p2({ result: null })], "p2"))?.ending,
    ).toBe("winner");
  });

  test("the last ball in, by the loser, is an error", () => {
    expect(deriveEnding(point([serve(), p2(), p1()], "p2"))).toEqual({
      ending: "error",
      endedBy: "p1",
    });
  });

  test("a deleted trailing stroke is ignored", () => {
    expect(
      deriveEnding(
        point(
          [serve(), p2({ result: "net" }), p1({ status: "deleted" })],
          "p1",
        ),
      ),
    ).toEqual({ ending: "service_winner", endedBy: "p2" });
  });

  test("the last stroke is the last on the video, whatever order the rows come in", () => {
    const first = serve();
    const second = p2();
    const third = p1({ result: "out" });
    expect(deriveEnding(point([third, first, second]))).toEqual({
      ending: "error",
      endedBy: "p1",
    });
  });
});

test.describe("endingPatchForShotChange", () => {
  const rally = [serve(), p2(), p1()];
  const flip = (result: LabelShot["result"]) =>
    rally.map((s, i) => (i === 2 ? { ...s, result } : s));

  test("a change that moves the derived ending sends it", () => {
    expect(
      endingPatchForShotChange(
        point(rally, "p1", "winner", "p1"),
        point(flip("out"), "p1", "winner", "p1"),
      ),
    ).toEqual({ ending: "error", ended_by: "p1" });
  });

  test("a change that leaves it the same sends nothing, so a hand-set ending survives", () => {
    const spun = rally.map((s) => ({ ...s, spin: "topspin" as const }));
    expect(
      endingPatchForShotChange(
        point(rally, "p1", "error", "p2"),
        point(spun, "p1", "error", "p2"),
      ),
    ).toBeNull();
  });

  test("nothing when the point already holds the new ending, or the rows now say nothing", () => {
    expect(
      endingPatchForShotChange(
        point(rally, "p1", "error", "p1"),
        point(flip("out"), "p1", "error", "p1"),
      ),
    ).toBeNull();
    const lone = serve();
    expect(
      endingPatchForShotChange(
        point([lone], "p1", "ace", "p1"),
        point([{ ...lone, result: "out" }], "p1", "ace", "p1"),
      ),
    ).toBeNull();
  });

  test("a let or a non-point is never rewritten", () => {
    for (const held of ["let_replayed", "not_a_point"] as const) {
      expect(
        endingPatchForShotChange(
          point(rally, "p1", held),
          point(flip("out"), "p1", held),
        ),
      ).toBeNull();
    }
  });
});
