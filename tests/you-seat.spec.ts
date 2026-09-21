import { expect, test } from "@playwright/test";

import { youSeat } from "../src/lib/data/viewer-side";

test.describe("youSeat", () => {
  const ROSTER = "roster-caden";
  const VIEWER = "viewer-login";

  test("the viewer's own seat wins", () => {
    expect(
      youSeat({ player1_id: ROSTER, player2_id: VIEWER }, [VIEWER], [ROSTER]),
    ).toBe("player2");
  });

  test("a coach in neither seat is oriented to the roster player", () => {
    // The Caden Ace shape: roster player in seat one, opponent with no id.
    expect(
      youSeat({ player1_id: ROSTER, player2_id: null }, [], [ROSTER]),
    ).toBe("player1");
    expect(
      youSeat({ player1_id: null, player2_id: ROSTER }, [], [ROSTER]),
    ).toBe("player2");
  });

  test("a row naming nobody falls back to seat two, as it always has", () => {
    expect(youSeat({ player1_id: "x", player2_id: "y" }, [VIEWER], [])).toBe(
      "player2",
    );
    expect(youSeat({ player1_id: null, player2_id: null }, [], [])).toBe(
      "player2",
    );
  });
});
