import { expect, test } from "@playwright/test";

import {
  applyLabelShotPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  filledLanding,
  followerAnswer,
  isAirStroke,
  landingGapMetres,
  landingLink,
  landingLinkToggle,
  landingTakesContact,
  nextLiveStroke,
  playedOnPatch,
  saveInOrder,
  volleyLinkWrites,
  withFilledLandings,
} from "@/lib/services/labels/volley-link";
import { labelShot } from "./fixtures/label-session";

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

function edit(
  shots: LabelShot[],
  shotId: string,
  patch: LabelShotPatch,
  ghosts?: boolean,
  landingOnly?: boolean,
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
    before,
    patch,
    ghosts,
    landingOnly,
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
  // One air stroke stands for the three: `isAirStroke` above is the set.
  for (const stroke of ["forehand_volley"] as const) {
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
    const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
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
    const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    const b = shot("b", { hitter: "p2", stroke: "forehand_volley" });
    // Between the two in rally order.
    const between = (restored = false) => ({
      ...ghost("g", restored),
      videoTime: a.videoTime! + 0.5,
    });
    const rows = [a, between(), b];
    const patch = { contact_x: AT_NET.x, contact_y: AT_NET.y };
    expect(edit(rows, "b", patch)[0].shotId).toBe("a");
    expect(edit(rows, "b", patch, true)[0].shotId).toBe("a");
    // The marks-off session numbers it as an ordinary stroke.
    expect(edit(rows, "b", patch, false)[0].shotId).toBe("g");
    // Restored, it is a stroke again in either session.
    expect(edit([a, between(true), b], "b", patch)[0].shotId).toBe("g");
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

test.describe("a landing filled from the next air stroke", () => {
  const volley = (fields: Partial<LabelShot> = {}) =>
    shot("b", {
      hitter: "p2",
      stroke: "forehand_volley",
      contactX: AT_NET.x,
      contactY: AT_NET.y,
      ...fields,
    });

  test("no landing stored: it reads the air stroke's contact", () => {
    for (const stroke of [
      "forehand_volley",
      "backhand_volley",
      "overhead",
    ] as const) {
      expect(
        filledLanding(shot("a", BACK), volley({ stroke })),
        stroke,
      ).toEqual(AT_NET);
    }
  });

  test("a half-set landing is no landing", () => {
    expect(
      filledLanding(shot("a", { ...BACK, landingX: 3 }), volley()),
    ).toEqual(AT_NET);
  });

  test("nothing fills it: a stored landing, a bounce next, no contact, no next", () => {
    const stored = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    expect(filledLanding(stored, volley())).toBeNull();
    expect(
      filledLanding(shot("a", BACK), volley({ stroke: "forehand" })),
    ).toBeNull();
    expect(
      filledLanding(
        shot("a", BACK),
        volley({ contactX: null, contactY: null }),
      ),
    ).toBeNull();
    expect(filledLanding(shot("a", BACK), null)).toBeNull();
  });

  test("a serve's landing is a bounce: never filled, never linked", () => {
    const serve = shot("a", { ...BACK, stroke: "first_serve" });
    expect(filledLanding(serve, volley())).toBeNull();
    expect(landingLink(serve, volley())).toBeNull();
    const placed = { ...serve, landingX: 0, landingY: 16 };
    expect(
      edit([placed, volley()], "b", { contact_x: 1, contact_y: 2 }),
    ).toEqual([]);
    expect(
      edit([placed, volley()], "a", { landing_x: 1, landing_y: 2 }),
    ).toEqual([]);
  });

  test("the point's readers get it; tombstones skipped, order and rows kept", () => {
    const a = shot("a", BACK);
    const gone = shot("gone", { status: "deleted", stroke: "backhand" });
    const b = volley();
    const filled = withFilledLandings({ shots: [a, gone, b] });
    expect(filled.map((s) => s.id)).toEqual(["a", "gone", "b"]);
    expect(filled[0]).toMatchObject({ landingX: AT_NET.x, landingY: AT_NET.y });
    expect(filled[1].landingX).toBeNull();
    // The stored row is untouched: it is not an edit.
    expect(a.landingX).toBeNull();
    expect(a.status).toBe(filled[0].status);
  });

  test("the link's three states and the gap", () => {
    expect(landingLink(shot("a", BACK), volley())).toBe("filled");
    const agrees = shot("a", {
      ...BACK,
      landingX: AT_NET.x,
      landingY: AT_NET.y,
    });
    expect(landingLink(agrees, volley())).toBe("agrees");
    const apart = shot("a", { ...BACK, landingX: AT_NET.x, landingY: 10 });
    expect(landingLink(apart, volley())).toBe("apart");
    expect(landingGapMetres(apart, volley())).toBeCloseTo(4);
    expect(landingGapMetres(shot("a", BACK), volley())).toBeNull();
    expect(landingLink(shot("a", BACK), shot("b"))).toBeNull();
  });

  test("the air stroke's contact moved over a filled landing: no write", () => {
    expect(
      edit([shot("a", BACK), volley()], "b", {
        contact_x: ELSEWHERE.x,
        contact_y: ELSEWHERE.y,
      }),
    ).toEqual([]);
  });

  test("changed to an air stroke over an empty landing: no write", () => {
    const b = shot("b", { contactX: AT_NET.x, contactY: AT_NET.y });
    expect(edit([shot("a", BACK), b], "b", { stroke: "overhead" })).toEqual([]);
  });

  test("a filled landing placed: the contact moves with it", () => {
    expect(
      edit([shot("a", BACK), volley()], "a", {
        landing_x: ELSEWHERE.x,
        landing_y: ELSEWHERE.y,
      }),
    ).toEqual([
      {
        shotId: "b",
        patch: { contact_x: ELSEWHERE.x, contact_y: ELSEWHERE.y },
      },
    ]);
  });

  test("landing only: the contact stays", () => {
    expect(
      edit(
        [shot("a", BACK), volley()],
        "a",
        { landing_x: ELSEWHERE.x, landing_y: ELSEWHERE.y },
        undefined,
        true,
      ),
    ).toEqual([]);
  });

  test("ends already apart stay apart, moved from either side", () => {
    const a = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    expect(edit([a, volley()], "a", { landing_x: 1, landing_y: 19 })).toEqual(
      [],
    );
    expect(edit([a, volley()], "b", { contact_x: 1, contact_y: 19 })).toEqual(
      [],
    );
  });

  test("ends that agree move together, from either side", () => {
    const a = shot("a", { ...BACK, landingX: AT_NET.x, landingY: AT_NET.y });
    expect(edit([a, volley()], "b", { contact_x: 1, contact_y: 19 })).toEqual([
      { shotId: "a", patch: { landing_x: 1, landing_y: 19 } },
    ]);
    expect(edit([a, volley()], "a", { landing_x: 1, landing_y: 19 })).toEqual([
      { shotId: "b", patch: { contact_x: 1, contact_y: 19 } },
    ]);
  });

  test("a stroke called out or net gets no fill and no link", () => {
    for (const result of ["out", "net"] as const) {
      const missed = shot("a", { ...BACK, result });
      expect(filledLanding(missed, volley()), result).toBeNull();
      expect(landingLink(missed, volley()), result).toBeNull();
    }
    expect(
      filledLanding(shot("a", { ...BACK, result: "in" }), volley()),
    ).toEqual(AT_NET);
  });

  test("whether a placed landing takes the contact", () => {
    const filled = shot("a", BACK);
    const agrees = shot("a", {
      ...BACK,
      landingX: AT_NET.x,
      landingY: AT_NET.y,
    });
    const apart = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    expect(landingTakesContact(filled, volley(), false)).toBe(true);
    expect(landingTakesContact(agrees, volley(), false)).toBe(true);
    expect(landingTakesContact(apart, volley(), false)).toBe(false);
    expect(landingTakesContact(filled, volley(), true)).toBe(false);
    expect(landingTakesContact(filled, null, false)).toBe(false);
  });

  test("the toggle clears ends apart, and otherwise arms and disarms", () => {
    const apart = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    expect(landingLinkToggle(apart, volley(), false)).toEqual({
      clearLanding: true,
    });
    expect(landingLinkToggle(shot("a", BACK), volley(), false)).toEqual({
      landingOnly: true,
    });
    expect(landingLinkToggle(shot("a", BACK), volley(), true)).toEqual({
      landingOnly: false,
    });
  });

  test("the next live stroke: rally order, and none for a stroke not live", () => {
    const a = shot("a", BACK);
    const gone = shot("gone", { status: "deleted" });
    const b = volley();
    const point = { shots: [a, gone, b] };
    expect(nextLiveStroke(point, "a")?.id).toBe("b");
    expect(nextLiveStroke(point, "b")).toBeNull();
    // Never the rally's first stroke, as `findIndex + 1` would answer.
    expect(nextLiveStroke(point, "gone")).toBeNull();
    expect(nextLiveStroke(point, "nowhere")).toBeNull();
  });

  test("writes follow rally order, as the fill does, not stored order", () => {
    // Stored first but untimed, so it plays last: `b` is after `a`.
    const untimed = shot("u", { videoTime: null, eventId: null });
    const a = shot("a", { ...BACK, landingX: AT_NET.x, landingY: AT_NET.y });
    const b = volley();
    expect(nextLiveStroke({ shots: [untimed, a, b] }, "a")?.id).toBe("b");
    expect(edit([untimed, a, b], "b", { contact_x: 1, contact_y: 19 })).toEqual(
      [{ shotId: "a", patch: { landing_x: 1, landing_y: 19 } }],
    );
  });

  test("a missed stroke's writes leave the next stroke alone, from either side", () => {
    for (const result of ["out", "net"] as const) {
      const placed = {
        ...BACK,
        result,
        landingX: AT_NET.x,
        landingY: AT_NET.y,
      };
      expect(
        edit([shot("a", placed), volley()], "a", {
          landing_x: 1,
          landing_y: 19,
        }),
        result,
      ).toEqual([]);
      expect(
        edit([shot("a", placed), volley()], "b", {
          contact_x: 1,
          contact_y: 19,
        }),
        result,
      ).toEqual([]);
    }
  });

  test("a click's derived miss comes off only where the next stroke met it there", () => {
    const patch = { landing_x: 0, landing_y: 30, result: "out" as const };
    const deep = volley({ contactX: 0, contactY: 29 });
    expect(playedOnPatch(patch, shot("a", BACK), deep)).toEqual({
      landing_x: 0,
      landing_y: 30,
    });
    // Met inside the court, so a long click is the labeller saying it missed.
    expect(playedOnPatch(patch, shot("a", BACK), volley())).toBe(patch);
    // A click on the hitter's own side says net; the contact does not.
    const net = { landing_x: 0, landing_y: 5, result: "net" as const };
    expect(playedOnPatch(net, shot("a", BACK), volley())).toBe(net);
    // A derived In stays, and so does a miss with a bounce next or no stroke.
    const inPatch = { ...patch, result: "in" as const };
    expect(playedOnPatch(inPatch, shot("a", BACK), deep)).toBe(inPatch);
    expect(
      playedOnPatch(patch, shot("a", BACK), volley({ stroke: "forehand" })),
    ).toBe(patch);
    expect(playedOnPatch(patch, shot("a", BACK), null)).toBe(patch);
  });

  test("saved in order: the first failure stops the rest, which answer it", async () => {
    const sent: number[] = [];
    const answers = await saveInOrder([1, 2, 3], async (n) => {
      sent.push(n);
      return n === 2 ? { error: "busy" } : { ok: true };
    });
    expect(sent).toEqual([1, 2]);
    expect(answers).toEqual([
      { ok: true },
      { error: "busy" },
      { error: "busy" },
    ]);
  });

  test("a follower's failure says the ends are apart, unless its edit failed too", () => {
    const ok = { ok: true };
    const failed = { error: "busy" };
    expect(followerAnswer(ok, ok)).toBe(ok);
    expect(followerAnswer(ok, failed)).toEqual({
      error: "The linked end did not move, so the two are now apart · busy",
    });
    expect(followerAnswer(failed, failed)).toBe(failed);
  });

  test("the same player's next stroke fills nothing and links nothing", () => {
    const own = volley({ hitter: "p1" });
    expect(filledLanding(shot("a", BACK), own)).toBeNull();
    expect(landingLink(shot("a", BACK), own)).toBeNull();
    expect(landingTakesContact(shot("a", BACK), own, false)).toBe(false);
    const placed = shot("a", { ...BACK, landingX: 0, landingY: 20 });
    expect(edit([placed, own], "a", { landing_x: 1, landing_y: 19 })).toEqual(
      [],
    );
    expect(edit([placed, own], "b", { contact_x: 1, contact_y: 19 })).toEqual(
      [],
    );
    // A stroke with no hitter yet is not ruled out.
    expect(filledLanding(shot("a", { ...BACK, hitter: null }), own)).toEqual(
      AT_NET,
    );
  });
});
