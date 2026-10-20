import { expect, test } from "@playwright/test";

import {
  isStrokeKey,
  strokeKeyChange,
} from "@/components/admin/labels/stroke-keys";
import {
  MAX_ZOOM,
  NO_ZOOM,
  artPoint,
  panBy,
  zoomAbout,
} from "@/components/admin/labels/label-court";

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

  test("a click maps back through the zoom", () => {
    const z = { scale: 2, x: -50, y: -20 };
    // Box centre at 2× offset (-50, -20) shows art (50, 35).
    expect(artPoint(z, 50, 50)).toEqual({ sx: 50, sy: 35 });
    expect(artPoint(NO_ZOOM, 12, 34)).toEqual({ sx: 12, sy: 34 });
  });
});
