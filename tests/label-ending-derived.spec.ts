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
import { labelShot } from "./fixtures/label-session";

let clock = 0;
function shot(fields: Partial<LabelShot>): LabelShot {
  clock += 1;
  return labelShot(`s-${clock}`, "p-1", {
    eventId: clock,
    stroke: "forehand",
    result: "in",
    videoTime: clock,
    ...fields,
  });
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

/** A session with marks on: a site-removed stroke is a ghost, not a stroke. */
const GHOSTS = true;

/** A swing the site removed after a faulted serve, never put back. */
const ghost = (fields: Partial<LabelShot> = {}) =>
  shot({
    hitter: "p2",
    stroke: "backhand",
    result: null,
    siteRemoval: "hit_after_fault",
    ...fields,
  });

test.describe("deriveEnding", () => {
  test("a ghost is no stroke: two faulted serves around ghosts are a double fault", () => {
    // Rudy v Aidan 83: first serve out, a swing the site removed, the second
    // serve typed as a first and out, another removed swing. The rows end on
    // the server's second fault — not on the ghost's hitter.
    const rows = [
      serve({ result: "out" }),
      ghost(),
      serve({ result: "out" }),
      ghost(),
    ];
    expect(deriveEnding(point(rows), GHOSTS)).toEqual({
      ending: "double_fault",
      endedBy: "p1",
      winner: "p2",
    });
    // Labelled without marks, the removed swings are strokes of the rally:
    // the last one, with no result, is read as its hitter's winner.
    expect(deriveEnding(point(rows), false)).toEqual({
      ending: "winner",
      endedBy: "p2",
      winner: null,
    });
    // A ghost put back is a stroke in either session.
    const restored = { ...rows[3], siteRemovalRestoredAt: "2026-10-07" };
    expect(
      deriveEnding(point([...rows.slice(0, 3), restored]), GHOSTS)?.endedBy,
    ).toBe("p2");
  });

  test("the patch reads ghosts the same way", () => {
    const before = [serve({ result: "out" }), ghost(), serve({ result: null })];
    const after = before.map((s, i) =>
      i === 2 ? { ...s, result: "out" as const } : s,
    );
    expect(
      endingPatchForShotChange(point(before), point(after), GHOSTS),
    ).toEqual({ ending: "double_fault", ended_by: "p1", winner: "p2" });
    // With the ghost a live stroke, the last stroke is still the serve.
    expect(
      endingPatchForShotChange(point(before), point(after), false),
    ).toEqual({ ending: "double_fault", ended_by: "p1", winner: "p2" });
    const trailing = [...after, ghost()];
    expect(
      endingPatchForShotChange(point(after), point(trailing), false)?.ending,
    ).toBe("winner");
    expect(
      endingPatchForShotChange(point(after), point(trailing), GHOSTS),
    ).toBeNull();
  });

  test("no live stroke says nothing", () => {
    expect(deriveEnding(point([]), GHOSTS)).toBeNull();
    expect(
      deriveEnding(point([serve({ status: "deleted" })]), GHOSTS),
    ).toBeNull();
  });

  test("an unreturned serve is an ace, won by the server", () => {
    expect(deriveEnding(point([serve()], "p1"), GHOSTS)).toEqual({
      ending: "ace",
      endedBy: "p1",
      winner: "p1",
    });
    // The rows settle it whoever the point names.
    expect(deriveEnding(point([serve()], "p2"), GHOSTS)?.winner).toBe("p1");
    // A serve with no result yet reads the same ending, but settles no winner.
    expect(
      deriveEnding(point([serve({ result: null })], "p2"), GHOSTS),
    ).toEqual({
      ending: "ace",
      endedBy: "p1",
      winner: null,
    });
    // A second serve that stayed in, after a fault.
    expect(
      deriveEnding(
        point([serve({ result: "net" }), serve({ stroke: "second_serve" })]),
        GHOSTS,
      )?.ending,
    ).toBe("ace");
  });

  test("a return into the net is a service winner", () => {
    // The return missed, so the server won.
    expect(
      deriveEnding(point([serve(), p2({ result: "net" })], "p1"), GHOSTS),
    ).toEqual({ ending: "service_winner", endedBy: "p2", winner: "p1" });
    expect(
      deriveEnding(point([serve(), p2({ result: "out" })]), GHOSTS)?.ending,
    ).toBe("service_winner");
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
        GHOSTS,
      ),
    ).toEqual({ ending: "double_fault", endedBy: "p1", winner: "p2" });
    // A lone missed second serve, the first never recorded.
    expect(
      deriveEnding(
        point([serve({ stroke: "second_serve", result: "net" })]),
        GHOSTS,
      )?.ending,
    ).toBe("double_fault");
    // Two faults both typed as first serves: the earlier serve decides.
    expect(
      deriveEnding(
        point([serve({ result: "out" }), serve({ result: "out" })]),
        GHOSTS,
      )?.ending,
    ).toBe("double_fault");
  });

  test("a lone faulted first serve says nothing", () => {
    expect(deriveEnding(point([serve({ result: "out" })]), GHOSTS)).toBeNull();
    expect(deriveEnding(point([serve({ result: "net" })]), GHOSTS)).toBeNull();
    // A deleted earlier serve is not an earlier serve.
    expect(
      deriveEnding(
        point([serve({ status: "deleted" }), serve({ result: "out" })]),
        GHOSTS,
      ),
    ).toBeNull();
  });

  test("the last rally ball out is an error", () => {
    expect(
      deriveEnding(point([serve(), p2(), p1({ result: "out" })], "p2"), GHOSTS),
    ).toEqual({ ending: "error", endedBy: "p1", winner: "p2" });
    const netted = deriveEnding(
      point([serve(), p2(), p1(), p2({ result: "net" })]),
      GHOSTS,
    );
    expect(netted?.ending).toBe("error");
    expect(netted?.winner).toBe("p1");
  });

  test("the last ball in is a winner, won by its hitter", () => {
    expect(deriveEnding(point([serve(), p2(), p1()], "p1"), GHOSTS)).toEqual({
      ending: "winner",
      endedBy: "p1",
      winner: "p1",
    });
    // No winner labelled: the same.
    expect(deriveEnding(point([serve(), p2()]), GHOSTS)).toEqual({
      ending: "winner",
      endedBy: "p2",
      winner: "p2",
    });
  });

  test("the last ball in, by the point's labelled loser, is still its hitter's winner", () => {
    expect(deriveEnding(point([serve(), p2(), p1()], "p2"), GHOSTS)).toEqual({
      ending: "winner",
      endedBy: "p1",
      winner: "p1",
    });
  });

  test("a last ball with no result yet reads the labelled winner and settles none", () => {
    // By the labelled winner (or with none labelled): a winner.
    expect(
      deriveEnding(point([serve(), p2({ result: null })], "p2"), GHOSTS),
    ).toEqual({
      ending: "winner",
      endedBy: "p2",
      winner: null,
    });
    expect(
      deriveEnding(point([serve(), p2({ result: null })]), GHOSTS)?.ending,
    ).toBe("winner");
    // By the labelled loser: an error.
    expect(
      deriveEnding(point([serve(), p2(), p1({ result: null })], "p2"), GHOSTS),
    ).toEqual({ ending: "error", endedBy: "p1", winner: null });
  });

  test("a deleted trailing stroke is ignored", () => {
    expect(
      deriveEnding(
        point(
          [serve(), p2({ result: "net" }), p1({ status: "deleted" })],
          "p1",
        ),
        GHOSTS,
      ),
    ).toEqual({ ending: "service_winner", endedBy: "p2", winner: "p1" });
  });

  test("the last stroke is the last on the video, whatever order the rows come in", () => {
    const first = serve();
    const second = p2();
    const third = p1({ result: "out" });
    expect(deriveEnding(point([third, first, second]), GHOSTS)).toEqual({
      ending: "error",
      endedBy: "p1",
      winner: "p2",
    });
  });

  test("a stroke with no hitter names no winner", () => {
    expect(
      deriveEnding(point([serve(), p2(), p1({ hitter: null })]), GHOSTS)
        ?.winner,
    ).toBeNull();
    expect(
      deriveEnding(
        point([serve(), p2(), p1({ hitter: null, result: "out" })]),
        GHOSTS,
      )?.winner,
    ).toBeNull();
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
        GHOSTS,
      ),
    ).toEqual({ ending: "error", ended_by: "p1", winner: "p2" });
  });

  test("flipping the last stroke from out to in hands the point to its hitter", () => {
    // The point says Vargas (p2) won on Lee's missed ball; the ball is now in.
    const patch = endingPatchForShotChange(
      point(flip("out"), "p2", "error", "p1"),
      point(rally, "p2", "error", "p1"),
      GHOSTS,
    );
    expect(patch).toEqual({ ending: "winner", ended_by: "p1", winner: "p1" });
  });

  test("deleting a trailing stroke so the new last one is in by the labelled loser hands it the point", () => {
    // Lee (p1) won on his last ball; delete it and Vargas's return, which
    // stayed in, is the last stroke.
    const deleted = rally.map((s, i) =>
      i === 2 ? { ...s, status: "deleted" as const } : s,
    );
    expect(
      endingPatchForShotChange(
        point(rally, "p1", "winner", "p1"),
        point(deleted, "p1", "winner", "p1"),
        GHOSTS,
      ),
    ).toEqual({ ending: "winner", ended_by: "p2", winner: "p2" });
  });

  test("a flip to out when the labelled winner is already the opponent leaves the winner alone", () => {
    expect(
      endingPatchForShotChange(
        point(rally, "p2", "error", "p1"),
        point(flip("out"), "p2", "error", "p1"),
        GHOSTS,
      ),
    ).toBeNull();
    const patch = endingPatchForShotChange(
      point(rally, "p2", "winner", "p1"),
      point(flip("out"), "p2", "winner", "p1"),
      GHOSTS,
    );
    expect(patch).toEqual({ ending: "error", ended_by: "p1" });
    expect(patch).not.toHaveProperty("winner");
  });

  test("the winner follows in two steps: delete the last stroke, then mark the new last out", () => {
    // Vargas (p2) won the point on Lee's last ball, which stayed in.
    const live = [serve(), p2(), p1()];
    const deleted = live.map((s, i) =>
      i === 2 ? { ...s, status: "deleted" as const } : s,
    );
    // Step 1: the rows now end on Vargas's ball, in: the ending moves to it,
    // and the point already names Vargas, so no winner is sent.
    const step1 = endingPatchForShotChange(
      point(live, "p2", "error", "p1"),
      point(deleted, "p2", "error", "p1"),
      GHOSTS,
    );
    expect(step1).toEqual({ ending: "winner", ended_by: "p2" });
    expect(step1).not.toHaveProperty("winner");

    // Step 2: the new last stroke, Vargas's return, is marked out. The rows now
    // say Lee won, so the patch carries it.
    const marked = deleted.map((s, i) =>
      i === 1 ? { ...s, result: "out" as const } : s,
    );
    expect(
      endingPatchForShotChange(
        point(deleted, "p2", "winner", "p2"),
        point(marked, "p2", "winner", "p2"),
        GHOSTS,
      ),
    ).toEqual({ ending: "service_winner", ended_by: "p2", winner: "p1" });
  });

  test("a change that leaves it the same sends nothing, so a hand-set ending survives", () => {
    const spun = rally.map((s) => ({ ...s, spin: "topspin" as const }));
    expect(
      endingPatchForShotChange(
        point(rally, "p1", "error", "p2"),
        point(spun, "p1", "error", "p2"),
        GHOSTS,
      ),
    ).toBeNull();
  });

  test("nothing when the point already holds the new ending and winner, or the rows now say nothing", () => {
    expect(
      endingPatchForShotChange(
        point(rally, "p2", "error", "p1"),
        point(flip("out"), "p2", "error", "p1"),
        GHOSTS,
      ),
    ).toBeNull();
    const lone = serve();
    expect(
      endingPatchForShotChange(
        point([lone], "p1", "ace", "p1"),
        point([{ ...lone, result: "out" }], "p1", "ace", "p1"),
        GHOSTS,
      ),
    ).toBeNull();
  });

  test("the ending already right but the winner wrong: only the winner is sent", () => {
    expect(
      endingPatchForShotChange(
        point(rally, "p1", "error", "p1"),
        point(flip("out"), "p1", "error", "p1"),
        GHOSTS,
      ),
    ).toEqual({ winner: "p2" });
  });

  test("a let or a non-point is never rewritten", () => {
    for (const held of ["let_replayed", "not_a_point"] as const) {
      expect(
        endingPatchForShotChange(
          point(rally, "p1", held),
          point(flip("out"), "p1", held),
          GHOSTS,
        ),
      ).toBeNull();
    }
  });
});

test.describe("deriveEnding · a let serve is replayed, never played", () => {
  test("a point whose last live stroke is a let derives nothing, not an ace", () => {
    expect(deriveEnding(point([serve({ result: "let" })]), GHOSTS)).toBeNull();
    // A let after a fault (the second serve clipped the net) is no double
    // fault either: the rows end on the lone first-serve fault.
    expect(
      deriveEnding(
        point([
          serve({ result: "out" }),
          serve({ stroke: "second_serve", result: "let" }),
        ]),
        GHOSTS,
      ),
    ).toBeNull();
  });

  test("a missed first serve after a let alone is one fault: nothing, not a double fault", () => {
    expect(
      deriveEnding(
        point([serve({ result: "let" }), serve({ result: "out" })]),
        GHOSTS,
      ),
    ).toBeNull();
    expect(
      deriveEnding(
        point([serve({ result: "let" }), serve({ result: "net" })]),
        GHOSTS,
      ),
    ).toBeNull();
  });

  test("the serve after a let reads as if the let were not there", () => {
    expect(
      deriveEnding(
        point([serve({ result: "let" }), serve({ result: "in" })]),
        GHOSTS,
      ),
    ).toEqual({ ending: "ace", endedBy: "p1", winner: "p1" });
    expect(
      deriveEnding(
        point([
          serve({ result: "let" }),
          serve({ result: "in" }),
          p2({ result: "out" }),
        ]),
        GHOSTS,
      ),
    ).toEqual({ ending: "service_winner", endedBy: "p2", winner: "p1" });
    expect(
      deriveEnding(
        point([
          serve({ result: "let" }),
          serve({ result: "out" }),
          serve({ stroke: "second_serve", result: "out" }),
        ]),
        GHOSTS,
      ),
    ).toEqual({ ending: "double_fault", endedBy: "p1", winner: "p2" });
  });
});
