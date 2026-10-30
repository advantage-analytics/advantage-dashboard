import { expect, test } from "@playwright/test";

import {
  NO_HANDS,
  labelHands,
  placementLabel,
} from "@/components/admin/labels/label-format";
import { pointDetail } from "@/components/admin/labels/label-black-format";
import type { LabelShot } from "@/lib/services/labels/session";

import { labelShot } from "./fixtures/label-session";

// A placement in the label console reads as the match page's Direction does
// (shot-geometry.ts `shotDirection`): a forehand from its hitter's backhand
// half, or a backhand from their forehand half, is Inside Out / Inside In.

// The near end faces +y: a right-hander's deuce (forehand) half is +x there.
const NEAR_Y = 1;
let seq = 0;
function stroke(fields: Partial<LabelShot>): LabelShot {
  seq += 1;
  return labelShot(`s${seq}`, "pt", {
    hitter: "p1",
    contactY: NEAR_Y,
    ...fields,
  });
}
/** Crosscourt from x: the ball lands across the centre line. */
const cross = (contactX: number) => ({
  contactX,
  landingX: -contactX * 2,
  landingY: 20,
});
/** Down the line from x: it lands on the same side. */
const line = (contactX: number) => ({
  contactX,
  landingX: contactX * 2,
  landingY: 20,
});

const RIGHT = { p1: "right", p2: null } as const;

test("a forehand from the backhand half is Inside Out / Inside In", () => {
  expect(
    placementLabel(stroke({ stroke: "forehand", ...cross(-2) }), RIGHT),
  ).toBe("Inside Out");
  expect(
    placementLabel(stroke({ stroke: "forehand", ...line(-2) }), RIGHT),
  ).toBe("Inside In");
  // From its own half, plain.
  expect(
    placementLabel(stroke({ stroke: "forehand", ...cross(2) }), RIGHT),
  ).toBe("Crosscourt");
});

test("a backhand from the forehand half is Inside Out / Inside In too", () => {
  expect(
    placementLabel(stroke({ stroke: "backhand", ...cross(2) }), RIGHT),
  ).toBe("Inside Out");
  expect(
    placementLabel(stroke({ stroke: "backhand_volley", ...line(2) }), RIGHT),
  ).toBe("Inside In");
  // From its own half, plain.
  expect(
    placementLabel(stroke({ stroke: "backhand", ...line(-2) }), RIGHT),
  ).toBe("Down the Line");
});

test("an overhead from the backhand half is Inside Out / Inside In", () => {
  expect(
    placementLabel(stroke({ stroke: "overhead", ...cross(-2) }), RIGHT),
  ).toBe("Inside Out");
  expect(
    placementLabel(stroke({ stroke: "overhead", ...line(-2) }), RIGHT),
  ).toBe("Inside In");
  // From its forehand half, plain.
  expect(
    placementLabel(stroke({ stroke: "overhead", ...cross(2) }), RIGHT),
  ).toBe("Crosscourt");
});

test("no hand, a serve and Middle stay as derived", () => {
  expect(
    placementLabel(stroke({ stroke: "forehand", ...cross(-2) }), NO_HANDS),
  ).toBe("Crosscourt");
  expect(
    placementLabel(
      stroke({ stroke: "forehand", contactX: -2, landingX: 0.3, landingY: 20 }),
      RIGHT,
    ),
  ).toBe("Middle");
  expect(
    placementLabel(
      stroke({
        stroke: "first_serve",
        contactX: 2,
        landingX: -3.5,
        landingY: 15,
      }),
      RIGHT,
    ),
  ).toBe("Wide");
});

test("each player's hand is read off their placed forehands", () => {
  const forehands = (hitter: "p1" | "p2", x: number, count: number) =>
    Array.from({ length: count }, () =>
      stroke({ hitter, stroke: "forehand", contactX: x }),
    );
  const points = [
    { shots: forehands("p1", 2, 9) },
    // p2 at the far end facing −y: −x there is their deuce half.
    { shots: forehands("p2", -2, 10).map((s) => ({ ...s, contactY: 22 })) },
  ];
  // Nine is too few to say.
  expect(labelHands(points)).toEqual({ p1: null, p2: "right" });
  // Ten, nine of them from the deuce half: a right-hander.
  points[0].shots.push(...forehands("p1", -2, 1));
  expect(labelHands(points).p1).toBe("right");
  // A deleted stroke is no evidence.
  const gone = forehands("p2", 2, 30).map((s) => ({
    ...s,
    status: "deleted" as const,
  }));
  expect(labelHands([...points, { shots: gone }]).p2).toBe("right");
});

test("split forehands leave the hand to the backhands", () => {
  const strokes = (kind: "forehand" | "backhand", x: number, count: number) =>
    Array.from({ length: count }, () => stroke({ stroke: kind, contactX: x }));
  // Six of ten forehands from each half says nothing; eight of ten backhands
  // from the ad half (−x at the near end) says right-handed.
  const shots = [
    ...strokes("forehand", 2, 6),
    ...strokes("forehand", -2, 4),
    ...strokes("backhand", -2, 8),
    ...strokes("backhand", 2, 2),
  ];
  expect(labelHands([{ shots }]).p1).toBe("right");
});

test("an entered hand wins over the one the rows suggest", () => {
  const forehands = Array.from({ length: 10 }, () =>
    stroke({ stroke: "forehand", contactX: 2 }),
  );
  // The rows say right-handed; whoever uploaded the match said left.
  expect(labelHands([{ shots: forehands }]).p1).toBe("right");
  expect(labelHands([{ shots: forehands }], { p1: "left", p2: null }).p1).toBe(
    "left",
  );
  // Nothing entered for p2, so p2 is still read off the rows (none here).
  expect(
    labelHands([{ shots: forehands }], { p1: "left", p2: null }).p2,
  ).toBeNull();
});

test("the point's second line names the deciding shot's direction", () => {
  const last = stroke({ stroke: "backhand", ...cross(2) });
  expect(pointDetail({ shots: [last] }, 0, RIGHT)).toContain("Inside Out");
  expect(pointDetail({ shots: [last] }, 0)).toContain("Crosscourt");
});
