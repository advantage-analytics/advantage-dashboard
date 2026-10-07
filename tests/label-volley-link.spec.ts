import { expect, test } from "@playwright/test";

import {
  applyLabelShotPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  isAirStroke,
  volleyLinkWrites,
} from "@/lib/services/labels/volley-link";
import { labelShot } from "./fixtures/label-session";

/**
 * A volley or an overhead takes the ball out of the air, so the previous
 * stroke's landing and its own contact are one place. `volleyLinkWrites` is
 * the console's rule for the follower write a labeller's shot patch asks for.
 */

let clock = 0;
function shot(id: string, fields: Partial<LabelShot> = {}): LabelShot {
  clock += 1;
  return labelShot(id, "p-1", {
    eventId: clock,
    stroke: "forehand",
    videoTime: clock,
    ...fields,
  });
}

/** Near-side contact for a groundstroke, and a spot at the far net. */
const BACK = { contactX: 1, contactY: 1 };
const AT_NET = { x: -1.5, y: 14 };
const ELSEWHERE = { x: 2.25, y: 15.5 };

/**
 * The labeller's `patch` to `shotId`, as the console runs it: the rows with
 * the patch applied, and the stroke as it was before.
 */
function edit(
  shots: LabelShot[],
  shotId: string,
  patch: LabelShotPatch,
  ghosts?: boolean,
) {
  const before = shots.find((s) => s.id === shotId)!;
  const point: Pick<LabelPoint, "shots"> = {
    shots: shots.map((s) =>
      s.id === shotId ? applyLabelShotPatch(s, patch) : s,
    ),
  };
  return volleyLinkWrites({
    point,
    shotId,
    strokeBefore: before.stroke,
    patch,
    ghosts,
  });
}

test.describe("isAirStroke", () => {
  test("the two volleys and the overhead, and nothing else", () => {
    expect(isAirStroke("forehand_volley")).toBe(true);
    expect(isAirStroke("backhand_volley")).toBe(true);
    expect(isAirStroke("overhead")).toBe(true);
    for (const stroke of [
      "forehand",
      "backhand",
      "first_serve",
      "second_serve",
    ] as const) {
      expect(isAirStroke(stroke), stroke).toBe(false);
    }
    expect(isAirStroke(null)).toBe(false);
    expect(isAirStroke(undefined)).toBe(false);
  });
});

test.describe("a stroke changed TO an air stroke", () => {
  for (const stroke of [
    "forehand_volley",
    "backhand_volley",
    "overhead",
  ] as const) {
    test(`${stroke}: its contact becomes the previous stroke's landing`, () => {
      const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
      const b = shot("b", {
        hitter: "p2",
        contactX: AT_NET.x,
        contactY: AT_NET.y,
      });
      expect(edit([a, b], "b", { stroke })).toEqual([
        {
          shotId: "a",
          patch: { landing_x: AT_NET.x, landing_y: AT_NET.y },
        },
      ]);
    });

    test(`${stroke}: with no contact, it takes the previous stroke's landing`, () => {
      const a = shot("a", {
        ...BACK,
        landingX: AT_NET.x,
        landingY: AT_NET.y,
      });
      const b = shot("b", { hitter: "p2" });
      expect(edit([a, b], "b", { stroke })).toEqual([
        { shotId: "b", patch: { contact_x: AT_NET.x, contact_y: AT_NET.y } },
      ]);
    });
  }

  test("neither a contact nor a landing: nothing", () => {
    const a = shot("a", BACK);
    const b = shot("b", { hitter: "p2" });
    expect(edit([a, b], "b", { stroke: "forehand_volley" })).toEqual([]);
  });

  test("a half-set contact is no contact: the landing is taken instead", () => {
    const a = shot("a", { ...BACK, landingX: AT_NET.x, landingY: AT_NET.y });
    const b = shot("b", { hitter: "p2", contactX: 3, contactY: null });
    expect(edit([a, b], "b", { stroke: "overhead" })).toEqual([
      { shotId: "b", patch: { contact_x: AT_NET.x, contact_y: AT_NET.y } },
    ]);
  });

  test("one air stroke to another is not a change to one", () => {
    const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    const b = shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: AT_NET.x,
      contactY: AT_NET.y,
    });
    expect(edit([a, b], "b", { stroke: "backhand_volley" })).toEqual([]);
    expect(edit([a, b], "b", { stroke: "overhead" })).toEqual([]);
  });

  test("changed back to another stroke: nothing", () => {
    const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    const b = shot("b", {
      hitter: "p2",
      stroke: "overhead",
      contactX: AT_NET.x,
      contactY: AT_NET.y,
    });
    expect(edit([a, b], "b", { stroke: "forehand" })).toEqual([]);
    expect(edit([a, b], "b", { stroke: null })).toEqual([]);
  });

  test("the first stroke of a point has no previous stroke", () => {
    const a = shot("a", { contactX: AT_NET.x, contactY: AT_NET.y });
    const b = shot("b", { hitter: "p2" });
    expect(edit([a, b], "a", { stroke: "forehand_volley" })).toEqual([]);
  });

  test("another field of an air stroke links nothing", () => {
    const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    const b = shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: AT_NET.x,
      contactY: AT_NET.y,
    });
    expect(edit([a, b], "b", { spin: "backspin" })).toEqual([]);
    expect(edit([a, b], "b", { hitter: "p1" })).toEqual([]);
    expect(edit([a, b], "b", { video_time: 99 })).toEqual([]);
  });
});

test.describe("the contact of an air stroke", () => {
  const rows = (stroke: LabelShot["stroke"] = "forehand_volley") => [
    shot("a", { ...BACK, landingX: 0, landingY: 20 }),
    shot("b", { hitter: "p2", stroke }),
  ];

  test("set: the previous stroke's landing follows", () => {
    for (const stroke of ["forehand_volley", "overhead"] as const) {
      expect(
        edit(rows(stroke), "b", {
          contact_x: AT_NET.x,
          contact_y: AT_NET.y,
        }),
        stroke,
      ).toEqual([
        {
          shotId: "a",
          patch: { landing_x: AT_NET.x, landing_y: AT_NET.y },
        },
      ]);
    }
  });

  test("the follower takes the coordinates only: its In / Out / Net stays", () => {
    const [a, b] = rows();
    // Met in the air behind the far baseline: the ball was played, so the
    // stroke before it is not turned into "out".
    const long = { x: 0, y: 25 };
    const [write] = edit([a, b], "b", { contact_x: long.x, contact_y: long.y });
    expect(write.patch).toEqual({ landing_x: long.x, landing_y: long.y });
    expect("result" in write.patch).toBe(false);
  });

  test("the court click's patch (contact and its result) links the same", () => {
    expect(
      edit(rows(), "b", {
        contact_x: AT_NET.x,
        contact_y: AT_NET.y,
        result: "in",
      }),
    ).toHaveLength(1);
  });

  test("cleared: the landing stays where it is", () => {
    const [a] = rows();
    const b = shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: 0,
      contactY: 20,
    });
    expect(edit([a, b], "b", { contact_x: null, contact_y: null })).toEqual([]);
  });

  test("already the same place: no write", () => {
    expect(edit(rows(), "b", { contact_x: 0, contact_y: 20 })).toEqual([]);
  });

  test("a stroke that is not an air stroke links nothing", () => {
    expect(
      edit(rows("backhand"), "b", {
        contact_x: AT_NET.x,
        contact_y: AT_NET.y,
      }),
    ).toEqual([]);
  });

  test("the first stroke of a point: nothing", () => {
    const only = [shot("b", { stroke: "overhead" })];
    expect(
      edit(only, "b", { contact_x: AT_NET.x, contact_y: AT_NET.y }),
    ).toEqual([]);
  });
});

test.describe("the landing of a stroke before an air stroke", () => {
  const rows = (next: LabelShot["stroke"] = "backhand_volley") => [
    shot("a", BACK),
    shot("b", { hitter: "p2", stroke: next, landingX: 0, landingY: 3 }),
  ];

  test("set: the air stroke's contact follows", () => {
    for (const next of ["backhand_volley", "overhead"] as const) {
      expect(
        edit(rows(next), "a", { landing_x: AT_NET.x, landing_y: AT_NET.y }),
        next,
      ).toEqual([
        {
          shotId: "b",
          patch: { contact_x: AT_NET.x, contact_y: AT_NET.y },
        },
      ]);
    }
  });

  test("changed: it follows again; the same place: no write", () => {
    const [a] = rows();
    const b = shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: AT_NET.x,
      contactY: AT_NET.y,
    });
    expect(
      edit([a, b], "a", { landing_x: ELSEWHERE.x, landing_y: ELSEWHERE.y }),
    ).toEqual([
      {
        shotId: "b",
        patch: { contact_x: ELSEWHERE.x, contact_y: ELSEWHERE.y },
      },
    ]);
    expect(
      edit([a, b], "a", { landing_x: AT_NET.x, landing_y: AT_NET.y }),
    ).toEqual([]);
  });

  test("cleared: the contact stays where it is", () => {
    const a = shot("a", { ...BACK, landingX: AT_NET.x, landingY: AT_NET.y });
    const b = shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: AT_NET.x,
      contactY: AT_NET.y,
    });
    expect(edit([a, b], "a", { landing_x: null, landing_y: null })).toEqual([]);
  });

  test("the next stroke is not an air stroke, or there is none: nothing", () => {
    expect(
      edit(rows("forehand"), "a", { landing_x: 1, landing_y: 20 }),
    ).toEqual([]);
    expect(edit(rows(), "b", { landing_x: 1, landing_y: 2 })).toEqual([]);
  });

  test("an air stroke's own landing links forward only", () => {
    // b is a volley after a; c is an overhead after b. b's landing moves:
    // c's contact follows, a's landing is not touched.
    const a = shot("a", { ...BACK, landingX: 0, landingY: 14 });
    const b = shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: 0,
      contactY: 14,
    });
    const c = shot("c", { stroke: "overhead" });
    expect(edit([a, b, c], "b", { landing_x: 1, landing_y: 9 })).toEqual([
      { shotId: "c", patch: { contact_x: 1, contact_y: 9 } },
    ]);
  });
});

test.describe("previous and next are the nearest LIVE strokes", () => {
  const tombstone = (id: string) =>
    shot(id, { status: "deleted", landingX: 9, landingY: 9 });
  const ghost = (id: string, restored = false) =>
    shot(id, {
      siteRemoval: "hit_after_fault",
      siteRemovalRestoredAt: restored ? "2026-10-06T00:00:00Z" : null,
      landingX: 9,
      landingY: 9,
    });

  test("a deleted stroke between the two is skipped, both ways", () => {
    const a = shot("a", BACK);
    const b = shot("b", { hitter: "p2", stroke: "forehand_volley" });
    const rows = [a, tombstone("x"), b];
    expect(
      edit(rows, "b", { contact_x: AT_NET.x, contact_y: AT_NET.y }),
    ).toEqual([
      {
        shotId: "a",
        patch: { landing_x: AT_NET.x, landing_y: AT_NET.y },
      },
    ]);
    expect(
      edit(rows, "a", { landing_x: AT_NET.x, landing_y: AT_NET.y }),
    ).toEqual([
      { shotId: "b", patch: { contact_x: AT_NET.x, contact_y: AT_NET.y } },
    ]);
    // Changed to a volley with no contact: it takes a's landing, not x's.
    const landed = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    const plain = shot("b", { hitter: "p2" });
    expect(
      edit([landed, tombstone("x"), plain], "b", { stroke: "overhead" }),
    ).toEqual([{ shotId: "b", patch: { contact_x: 0, contact_y: 20 } }]);
  });

  test("a ghost is skipped while ghosts are drawn, and is a stroke when not", () => {
    const a = shot("a", BACK);
    const b = shot("b", { hitter: "p2", stroke: "forehand_volley" });
    const rows = [a, ghost("g"), b];
    const patch = { contact_x: AT_NET.x, contact_y: AT_NET.y };
    expect(edit(rows, "b", patch)[0].shotId).toBe("a");
    expect(edit(rows, "b", patch, true)[0].shotId).toBe("a");
    // The marks-off session numbers it as an ordinary stroke.
    expect(edit(rows, "b", patch, false)[0].shotId).toBe("g");
    // Restored, it is a stroke again in either session.
    expect(edit([a, ghost("g", true), b], "b", patch)[0].shotId).toBe("g");
  });

  test("only tombstones before it: an air stroke with no previous stroke", () => {
    const b = shot("b", { stroke: "forehand_volley" });
    expect(
      edit([tombstone("x"), b], "b", { contact_x: 1, contact_y: 14 }),
    ).toEqual([]);
  });

  test("a tombstone's own values link to nothing", () => {
    const a = shot("a", BACK);
    const b = shot("b", { status: "deleted", stroke: "forehand_volley" });
    expect(edit([a, b], "b", { contact_x: 1, contact_y: 14 })).toEqual([]);
  });
});
