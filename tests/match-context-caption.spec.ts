import { expect, test } from "@playwright/test";

import { transformDbMatch, type DbMatch } from "@/lib/data/matches-list-types";

/**
 * `matches.result` is the caption over a match's score ("X Wins",
 * "Retired"), not its outcome. Video uploads and the wizard's default stored
 * an empty caption, and `?? "Final Score"` let "" through as a blank line in
 * the matches gallery. Blank or whitespace now reads as no caption.
 */
function row(result: string | null): DbMatch {
  return {
    id: "m1",
    player1_id: "u1",
    player1_name: "Cj Gimena",
    player2_name: "Alex Brown",
    tournament_name: null,
    round: null,
    date: "2026-06-06",
    score: { player1: [6, 6], player2: [3, 4] },
    result,
    match_type: null,
    court_type: null,
    verified: null,
    duration: null,
  };
}

test.describe("matchContext caption", () => {
  test("a stored caption is kept verbatim", () => {
    expect(transformDbMatch(row("Cj Gimena Wins"), "u1")?.matchContext).toBe(
      "Cj Gimena Wins",
    );
  });

  test("null, empty and blank captions fall back to Final Score", () => {
    for (const result of [null, "", "   "]) {
      expect(transformDbMatch(row(result), "u1")?.matchContext).toBe(
        "Final Score",
      );
    }
  });
});
