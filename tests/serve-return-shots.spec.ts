import { expect, test } from "@playwright/test";

import { pickServeShot } from "@/lib/data/serve-return-shots";

/**
 * `pickServeShot` picks the serve that was actually played by ROLE, not
 * position — see serve-return-shots.ts for why positional indexing
 * mislabels points. It must return `undefined` rather than falling back to
 * `shots[0]` when a point carries no serve row at all: that fallback was
 * how a truncated read (feeds-first, serve row not yet fetched) plotted a
 * `Feed` row's landing coordinates as a serve.
 */
test.describe("pickServeShot", () => {
  test("returns the Second Serve row when both serve rows exist", () => {
    const firstServe = { shot_type: "First Serve" };
    const secondServe = { shot_type: "Second Serve" };
    expect(pickServeShot([firstServe, secondServe])).toBe(secondServe);
  });

  test("returns the First Serve row when only that one exists", () => {
    const firstServe = { shot_type: "First Serve" };
    expect(pickServeShot([firstServe])).toBe(firstServe);
  });

  test("returns undefined for a shot list with no serve row", () => {
    const feed = { shot_type: "Feed" };
    expect(pickServeShot([feed])).toBeUndefined();
  });

  test("[Feed, Forehand] returns undefined", () => {
    const feed = { shot_type: "Feed" };
    const forehand = { shot_type: "Forehand" };
    expect(pickServeShot([feed, forehand])).toBeUndefined();
  });
});
