import { expect, test } from "@playwright/test";

import {
  serversByChangeover,
  type SplitStepRally,
  type SplitStepStroke,
} from "@/lib/services/splitstep/derivation";

/**
 * Who served, from the serving end and changeover breaks alone. Rallies here
 * are a single serve each: `top` says which end it was struck from, `t` when.
 */

function serve(t: number, top: boolean | null): SplitStepRally {
  const stroke = {
    videoTime: t,
    strokeType: "serve",
    playerLabel: "vendor label, ignored",
    playerY: top === null ? null : top ? 11 : -11,
  } as SplitStepStroke;
  return {
    rallyId: t,
    strokes: [stroke],
    server: stroke.playerLabel,
    serves: [stroke],
  };
}

test.describe("serversByChangeover", () => {
  test("names the server by end, from the wizard's top player", () => {
    const rallies = [serve(0, true), serve(30, true), serve(75, false)];
    expect(serversByChangeover(rallies, "Ace", "Goodman")).toEqual([
      "Ace",
      "Ace",
      "Goodman",
    ]);
  });

  test("a changeover-length break swaps the ends", () => {
    // Ace serves game 1 from the top; after the changeover Goodman is at the
    // top and serves game 2 from there.
    const rallies = [serve(0, true), serve(30, true), serve(150, true)];
    expect(serversByChangeover(rallies, "Ace", "Goodman")).toEqual([
      "Ace",
      "Ace",
      "Goodman",
    ]);
  });

  test("a set break or stoppage longer than a changeover does not swap", () => {
    const rallies = [serve(0, true), serve(400, true)];
    expect(serversByChangeover(rallies, "Ace", "Goodman")).toEqual([
      "Ace",
      "Ace",
    ]);
  });

  test("an ordinary gap between points does not swap", () => {
    const rallies = [serve(0, true), serve(58, true)];
    expect(serversByChangeover(rallies, "Ace", "Goodman")).toEqual([
      "Ace",
      "Ace",
    ]);
  });

  test("a serve with no position has no witness, but still sets the clock", () => {
    const rallies = [serve(0, true), serve(100, null), serve(130, true)];
    expect(serversByChangeover(rallies, "Ace", "Goodman")).toEqual([
      "Ace",
      null,
      "Goodman",
    ]);
  });
});
