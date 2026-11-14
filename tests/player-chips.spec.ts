import { expect, test } from "@playwright/test";

import {
  matchPlayerChipLabels,
  seasonPlayerChipLabels,
} from "@/components/dashboard/matches/match-detail/shots/player-chip-labels";

/**
 * The Visualizations player switch says "You" only to the player the charts
 * are about. A coach, a teammate, an admin and a share-link reader read two
 * names.
 */

test("the player reading their own match: You, and the opponent's surname", () => {
  expect(matchPlayerChipLabels("Avery Kim", "Blake Rivera", true)).toEqual({
    you: "You",
    opponent: "Rivera",
  });
});

test("anyone else reads two surnames, never You", () => {
  expect(matchPlayerChipLabels("Avery Kim", "Blake Rivera", false)).toEqual({
    you: "Kim",
    opponent: "Rivera",
  });
});

test("two players sharing a surname never get the same chip", () => {
  expect(matchPlayerChipLabels("Marcus Reid", "Dan Reid", false)).toEqual({
    you: "M. Reid",
    opponent: "D. Reid",
  });
});

test("a side with no name keeps a generic word", () => {
  expect(matchPlayerChipLabels("Avery Kim", "", false)).toEqual({
    you: "Kim",
    opponent: "Opponent",
  });
  expect(matchPlayerChipLabels("Avery Kim", " ", true)).toEqual({
    you: "You",
    opponent: "Opponent",
  });
});

test("a season profile: the player's surname (You on their own) against Opponents", () => {
  expect(seasonPlayerChipLabels("Maya Chen", false)).toEqual({
    you: "Chen",
    opponent: "Opponents",
  });
  expect(seasonPlayerChipLabels("Maya Chen", true)).toEqual({
    you: "You",
    opponent: "Opponents",
  });
});
