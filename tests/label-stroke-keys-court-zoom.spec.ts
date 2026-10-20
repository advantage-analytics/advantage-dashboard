import { expect, test } from "@playwright/test";

import { readFileSync } from "node:fs";

import {
  STROKE_KEY_HINTS,
  hasEarlierServe,
  isStrokeKey,
  strokeKeyChange,
} from "@/components/admin/labels/stroke-keys";
import { labelShot } from "./fixtures/label-session";
import {
  MAX_ZOOM,
  NO_ZOOM,
  artPoint,
  moveWindow,
  panBy,
  wheelZoomDelta,
  runoffGuides,
  zoomAbout,
} from "@/components/admin/labels/label-court";
import {
  MAX_RUNOFF,
  courtSlide,
  estimatePatch,
  isEstimate,
  nextPlacement,
  placementRunoff,
  runoffFor,
  setPlacementTarget,
  startPlacement,
} from "@/components/admin/labels/court-placement";
import {
  COURT_LENGTH,
  HALF_HEIGHT,
  NET_Y,
  halfTopY,
  runoffWindowTop,
  toCourtInWindow,
} from "@/components/admin/labels/court-geometry";
import type { ShotPosition } from "@/lib/services/labels/shot-derived";

test.describe("stroke keys", () => {
  const shot = (stroke: string | null, spin: string | null = null) =>
    ({ stroke, spin }) as Parameters<typeof strokeKeyChange>[1];

  test("letters set the stroke, case-insensitive", () => {
    expect(strokeKeyChange("f", shot(null))).toEqual({ stroke: "forehand" });
    expect(strokeKeyChange("B", shot("forehand"))).toEqual({
      stroke: "backhand",
    });
    expect(strokeKeyChange("o", shot("backhand"))).toEqual({
      stroke: "overhead",
    });
  });

  test("V volleys on the stroke's side and back", () => {
    expect(strokeKeyChange("v", shot("backhand"))).toEqual({
      stroke: "backhand_volley",
    });
    expect(strokeKeyChange("v", shot("forehand_volley"))).toEqual({
      stroke: "forehand",
    });
    expect(strokeKeyChange("v", shot(null))).toEqual({
      stroke: "forehand_volley",
    });
  });

  test("S serves, then switches first and second", () => {
    expect(strokeKeyChange("s", shot("forehand"))).toEqual({
      stroke: "first_serve",
    });
    expect(strokeKeyChange("s", shot("first_serve"))).toEqual({
      stroke: "second_serve",
    });
    expect(strokeKeyChange("s", shot("second_serve"))).toEqual({
      stroke: "first_serve",
    });
  });

  test("S after a serve in the point is a second serve, and still switches", () => {
    expect(strokeKeyChange("s", shot("forehand"), true)).toEqual({
      stroke: "second_serve",
    });
    expect(strokeKeyChange("s", shot(null), true)).toEqual({
      stroke: "second_serve",
    });
    // Already the serve S would make: it switches to the other.
    expect(strokeKeyChange("s", shot("second_serve"), true)).toEqual({
      stroke: "first_serve",
    });
    expect(strokeKeyChange("s", shot("first_serve"), true)).toEqual({
      stroke: "second_serve",
    });
  });

  test("an earlier serve counts; a let, a deleted serve or a later one does not", () => {
    const row = (
      id: string,
      videoTime: number,
      fields: Parameters<typeof labelShot>[2] = {},
    ) => labelShot(id, "pt", { videoTime, ...fields });
    const fault = row("a", 1, { stroke: "first_serve", result: "out" });
    const target = row("b", 2);
    expect(hasEarlierServe({ shots: [fault, target] }, "b", false)).toBe(true);
    // A let is replayed: the serve after it is still the first.
    const let_ = row("a", 1, { stroke: "first_serve", result: "let" });
    expect(hasEarlierServe({ shots: [let_, target] }, "b", false)).toBe(false);
    const gone = row("a", 1, { stroke: "first_serve", status: "deleted" });
    expect(hasEarlierServe({ shots: [gone, target] }, "b", false)).toBe(false);
    const later = row("c", 3, { stroke: "first_serve" });
    expect(hasEarlierServe({ shots: [target, later] }, "b", false)).toBe(false);
  });

  test("1–4 are the spin menu's rows; the same value asks for nothing", () => {
    expect(strokeKeyChange("1", shot("forehand"))).toEqual({ spin: "topspin" });
    expect(strokeKeyChange("3", shot("forehand"))).toEqual({
      spin: "backspin",
    });
    expect(strokeKeyChange("2", shot("forehand", "flat"))).toBeNull();
    expect(strokeKeyChange("f", shot("forehand"))).toBeNull();
  });

  test("other keys are not stroke keys", () => {
    for (const key of ["x", "5", "Enter", " ", "ff"]) {
      expect(isStrokeKey(key)).toBe(false);
    }
    for (const key of ["f", "B", "v", "o", "S", "1", "4"]) {
      expect(isStrokeKey(key)).toBe(true);
    }
  });
});

test.describe("A adds a shot, C switches contact and landing", () => {
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );

  test("the legend under the court names both, after the stroke keys", () => {
    expect(STROKE_KEY_HINTS.slice(-2)).toEqual([
      { key: "C", label: "contact / landing" },
      { key: "A", label: "add shot" },
    ]);
    // Neither is a stroke key: they never change the selected stroke.
    expect(isStrokeKey("a")).toBe(false);
    expect(isStrokeKey("c")).toBe(false);
  });

  test("A adds after the selected live stroke, else after the point's last; C flips the court's end", () => {
    expect(source).toContain("addShot(expanded.id, selected);");
    expect(source).toMatch(
      /shot\.id === placement\.shotId && shot\.status !== "deleted",\n\s+\)\n\s+\? placement\.shotId\n\s+: null;/,
    );
    expect(source).toContain(
      'setTarget(placement.target === "contact" ? "landing" : "contact");',
    );
    // Same reach as the stroke keys: never from a field, a menu or a dialog,
    // never with a modifier, never on a held key.
    // The stroke keys' guard, shared: one dispatcher, one reach check.
    expect(source).toContain("? () => addShotKey.current()");
    expect(source).toContain("? () => endKey.current()");
    expect(source).toMatch(/consoleKey &&\n\s+!event\.metaKey/);
  });
});

test.describe("court zoom", () => {
  test("zooming about a point keeps that point still", () => {
    const z = zoomAbout(NO_ZOOM, 2, 25, 75);
    expect(z.scale).toBe(2);
    // The art point under (25, 75) before is still under it after.
    expect(artPoint(z, 25, 75)).toEqual({ sx: 25, sy: 75 });
  });

  test("the art always covers the box, and zoom is bounded", () => {
    expect(zoomAbout(NO_ZOOM, 0.5, 50, 50)).toEqual(NO_ZOOM);
    expect(zoomAbout(NO_ZOOM, 99, 50, 50).scale).toBe(MAX_ZOOM);
    const z = zoomAbout(NO_ZOOM, 2, 0, 0);
    expect(panBy(z, 500, 500)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(panBy(z, -500, -500)).toEqual({ scale: 2, x: -100, y: -100 });
  });

  test("a half's box moves up and down the court, as far as the deepest run-off", () => {
    const near = halfTopY("near");
    expect(moveWindow(near, 3)).toBeCloseTo(near + 3);
    // Past the net: the near box moved up shows the far side's service box.
    const across = moveWindow(near, 8);
    expect(toCourtInWindow(across, { sx: 50, sy: 0 }).y).toBeGreaterThan(
      NET_Y + 6,
    );
    // Bounded at the deepest run-off behind either baseline.
    expect(moveWindow(near, -100)).toBeCloseTo(
      runoffWindowTop("near", MAX_RUNOFF),
    );
    expect(moveWindow(halfTopY("far"), 100)).toBeCloseTo(
      runoffWindowTop("far", MAX_RUNOFF),
    );
    expect(runoffWindowTop("far", MAX_RUNOFF) - HALF_HEIGHT).toBeLessThan(
      COURT_LENGTH,
    );
  });

  test("a mouse notch with ⌃ zooms a step, not to the limit; a pinch is untouched", () => {
    const notch = Math.exp(
      -wheelZoomDelta({ deltaY: -100, deltaMode: 0 }) * 0.01,
    );
    expect(notch).toBeLessThan(1.3);
    expect(notch).toBeGreaterThan(1.1);
    expect(wheelZoomDelta({ deltaY: -3, deltaMode: 1 })).toBe(-20);
    expect(wheelZoomDelta({ deltaY: 4.5, deltaMode: 0 })).toBe(4.5);
  });

  test("a click on a moved box lands where the court under it is", () => {
    const top = moveWindow(halfTopY("near"), -4);
    // The box's bottom edge is HALF_HEIGHT below its top.
    expect(toCourtInWindow(top, { sx: 50, sy: 100 }).y).toBeCloseTo(
      top - HALF_HEIGHT,
    );
  });

  test("a pinch zooms, a scroll or a drag pans, and a drag never places", () => {
    const source = readFileSync(
      "src/components/admin/labels/label-court.tsx",
      "utf8",
    );
    expect(source).toContain("if (event.ctrlKey) {");
    expect(source).toMatch(/top: moveWindow\(\s*state\.top,/);
    expect(source).toMatch(/top: moveWindow\(start\.top, /);
    // A press on an unzoomed half can start a drag now; the whole court's cannot.
    expect(source).toContain("if (zoom.scale === 1 && !zoomed) return;");
    // A two-finger press-and-drag is a right click: it pans, and opens no menu.
    expect(source).toContain(
      "if (event.button !== 0 && event.button !== 2) return;",
    );
    expect(source).toMatch(
      /onContextMenu: \(event[^)]*\) => \{\s+event\.preventDefault\(\);/,
    );
    // The click a drag ends with is still dropped, and a click reads the moved box.
    expect(source).toContain("if (dropClick.current) {");
    expect(source).toMatch(/toCourtInWindow\(\s*top,\s*artPoint\(/);
  });

  test("a click maps back through the zoom", () => {
    const z = { scale: 2, x: -50, y: -20 };
    // Box centre at 2× offset (-50, -20) shows art (50, 35).
    expect(artPoint(z, 50, 50)).toEqual({ sx: 50, sy: 35 });
    expect(artPoint(NO_ZOOM, 12, 34)).toEqual({ sx: 12, sy: 34 });
  });
});

test.describe("a deep contact: the run-off grows as the labeller clicks near its edge", () => {
  const UNPLACED: ShotPosition = {
    stroke: "forehand",
    contact_x: null,
    contact_y: null,
    landing_x: null,
    landing_y: null,
    result: null,
  };

  test("a click inside the usual run-off places it and moves on to the landing", () => {
    const step = nextPlacement(
      startPlacement("s", "near"),
      { x: 1, y: -2.5 },
      UNPLACED,
    )!;
    expect(step.patch).toEqual({ contact_x: 1, contact_y: -2.5 });
    expect(step.state.target).toBe("landing");
    expect(step.state.runoff).toBeUndefined();
  });

  test("a click near the edge is stored as clicked, and the contact stays armed with more run-off", () => {
    const start = startPlacement("s", "near");
    const edge = nextPlacement(start, { x: -2.4, y: -3.3 }, UNPLACED)!;
    // Never clamped inside the run-off.
    expect(edge.patch).toEqual({ contact_x: -2.4, contact_y: -3.3 });
    expect(edge.state).toEqual({ ...start, runoff: 5.5 });
    // Deeper again, at the new edge: it grows again.
    const placed = { ...UNPLACED, contact_x: -2.4, contact_y: -3.3 };
    const deeper = nextPlacement(edge.state, { x: -2.4, y: -5.2 }, placed)!;
    expect(deeper.patch).toEqual({ contact_x: -2.4, contact_y: -5.2 });
    expect(deeper.state.runoff).toBe(7.5);
    // Clear of the edge: placed, and on to the landing.
    const settled = nextPlacement(
      deeper.state,
      { x: -2.4, y: -6.2 },
      { ...placed, contact_y: -5.2 },
    )!;
    expect(settled.patch).toEqual({ contact_x: -2.4, contact_y: -6.2 });
    expect(settled.state.target).toBe("landing");
    // The far half reads its depth past the far baseline.
    const far = nextPlacement(
      startPlacement("s", "far"),
      { x: 0, y: 23.77 + 3.2 },
      UNPLACED,
    )!;
    expect(far.state.runoff).toBe(5.5);
  });

  test("the run-off covers a stored deep contact, capped", () => {
    expect(runoffFor(1)).toBe(3.5);
    expect(runoffFor(3.2)).toBe(5.5);
    expect(runoffFor(7.1)).toBe(9.5);
    expect(runoffFor(40)).toBe(MAX_RUNOFF);
    const contact = startPlacement("s", "near");
    expect(placementRunoff(contact, -4.2)).toBe(5.5);
    expect(placementRunoff({ ...contact, runoff: 7.5 }, -4.2)).toBe(7.5);
    // A landing draws the usual run-off.
    expect(placementRunoff(setPlacementTarget(contact, "landing"), -4.2)).toBe(
      3.5,
    );
    // At the cap a click at the edge is just placed.
    const capped = nextPlacement(
      { ...contact, runoff: MAX_RUNOFF },
      { x: 0, y: -MAX_RUNOFF + 0.1 },
      UNPLACED,
    )!;
    expect(capped.state.target).toBe("landing");
  });

  test("the slide and its guides: +2 m steps out to the run-off", () => {
    const shot = {
      contactX: 1,
      contactY: -4.2,
      landingX: null,
      landingY: null,
    };
    const slide = courtSlide(startPlacement("s", "near"), shot);
    expect(slide).toEqual({
      kind: "deep",
      top: expect.any(Number),
      half: "near",
      runoff: 5.5,
    });
    expect(runoffGuides("near", 5.5)).toEqual([
      { metres: 2, y: -2 },
      { metres: 4, y: -4 },
    ]);
    expect(runoffGuides("far", 8).map((g) => g.metres)).toEqual([2, 4, 6, 8]);
    // Inside the usual run-off, no slide.
    expect(
      courtSlide(startPlacement("s", "near"), { ...shot, contactY: -1 }),
    ).toBeNull();
  });
});

test.describe("a short ball: a landing on the hitter's own side is allowed", () => {
  test("the click is written as clicked, and reads as a net ball", () => {
    // The landing armed on the far half (the receiver's); the ball bounced
    // just short of the net on the near side, the hitter's own.
    const landing = setPlacementTarget(
      startPlacement("s", "near"),
      "landing",
      -0.5,
    );
    const step = nextPlacement(
      landing,
      { x: 0.4, y: 11.2 },
      {
        stroke: "backhand",
        contact_x: 0.5,
        contact_y: -0.5,
        landing_x: null,
        landing_y: null,
        result: null,
      },
    )!;
    expect(step.patch).toEqual({
      landing_x: 0.4,
      landing_y: 11.2,
      result: "net",
    });
  });

  test("the landing view slides across the net while the stored bounce is on the hitter's side", () => {
    const landing = setPlacementTarget(
      startPlacement("s", "near"),
      "landing",
      -0.5,
    );
    const shank = { contactX: 0.5, contactY: -0.5, landingX: 1, landingY: 8.9 };
    expect(courtSlide(landing, shank)).toEqual({
      kind: "shank",
      top: expect.any(Number),
      half: "near",
    });
    // Across the net as usual, or flipped by hand: no slide.
    expect(courtSlide(landing, { ...shank, landingY: 17 })).toBeNull();
    expect(
      courtSlide({ ...landing, flipped: true, half: "near" }, shank),
    ).toBeNull();
    // The contact end never slides across.
    expect(courtSlide(startPlacement("s", "near"), shank)).toBeNull();
  });
});

test.describe("“Off screen, so this is an estimate”", () => {
  test("writes the end's two names into `unclear`, and takes them out again", () => {
    expect(estimatePatch([], "contact", true)).toEqual({
      unclear: ["contact_x", "contact_y"],
    });
    expect(estimatePatch(["spin"], "landing", true)).toEqual({
      unclear: ["spin", "landing_x", "landing_y"],
    });
    expect(
      estimatePatch(["contact_x", "contact_y", "spin"], "contact", false),
    ).toEqual({ unclear: ["spin"] });
    // Never a name twice.
    expect(estimatePatch(["contact_x"], "contact", true)).toEqual({
      unclear: ["contact_x", "contact_y"],
    });
    expect(isEstimate(["landing_y"], "landing")).toBe(true);
    expect(isEstimate(["landing_y"], "contact")).toBe(false);
  });
});
