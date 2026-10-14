import { expect, test } from "@playwright/test";

import {
  clampRailWidth,
  layoutAfterFullscreenRequest,
  parseRailWidth,
} from "@/components/admin/labels/label-layout";

/** The session's two views (overview, full screen) and the rail's width. */

test("a request for the browser's full screen settles the layout", () => {
  // It went along: black, in the browser's full screen.
  expect(layoutAfterFullscreenRequest("entered")).toBe("black");
  // Refused: never black under the browser's bars.
  expect(layoutAfterFullscreenRequest("refused")).toBe("overview");
  // No Fullscreen API at all: the black layer is the only full screen.
  expect(layoutAfterFullscreenRequest("unsupported")).toBe("black");
});

test.describe("the rail's width", () => {
  test("holds between 520 and 880, 640 by default", () => {
    // Both ends, and the ends themselves.
    expect(clampRailWidth(100)).toBe(520);
    expect(clampRailWidth(519.4)).toBe(520);
    expect(clampRailWidth(520)).toBe(520);
    expect(clampRailWidth(2000)).toBe(880);
    expect(clampRailWidth(880)).toBe(880);
    // Inside, whole pixels.
    expect(clampRailWidth(700.6)).toBe(701);
    // Not a number: the default.
    for (const px of [Number.NaN, Infinity, -Infinity]) {
      expect(clampRailWidth(px), String(px)).toBe(640);
    }
  });

  test("a stored rail width parses; anything else is the default", () => {
    expect(parseRailWidth("700")).toBe(700);
    expect(parseRailWidth("612.5")).toBe(613);
    expect(parseRailWidth("300")).toBe(520);
    expect(parseRailWidth("5000")).toBe(880);
    for (const raw of [null, undefined, "", "  ", "wide", "{}", "640px"]) {
      expect(parseRailWidth(raw), String(raw)).toBe(640);
    }
  });
});
