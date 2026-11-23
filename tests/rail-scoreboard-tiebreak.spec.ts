import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RailScoreboardProps } from "@/components/dashboard/matches/match-detail/rail-scoreboard";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The report rail's scoreboard draws a tiebreak beside the set loser's 6,
 * offline. `rail-scoreboard.tsx` loads through `fixtures/vm-modules`.
 */
const loader = createLoader({ stubs: {} });

const rail = loader.load(
  "src/components/dashboard/matches/match-detail/rail-scoreboard.tsx",
) as { RailScoreboard: React.ComponentType<RailScoreboardProps> };

/** Chen d. Díaz 6-4, 3-6, 7-6(5). */
const FINAL: RailScoreboardProps = {
  status: "final",
  label: "Final",
  duration: "1:52:18",
  caption: "Match complete · Singles · hard",
  players: [
    {
      id: "player1",
      name: "Avery Chen",
      sets: [6, 3, 7],
      tiebreaks: [null, null, 5],
      lostSets: [false, true, false],
      wonSets: [true, false, true],
      won: true,
    },
    {
      id: "player2",
      name: "Marco Díaz",
      sets: [4, 6, 6],
      tiebreaks: [null, null, 5],
      lostSets: [true, false, true],
      wonSets: [false, true, false],
      won: false,
    },
  ],
};

test.describe("RailScoreboard draws the tiebreak beside the loser's 6", () => {
  test("the loser's points are raised on the set loser's row only", () => {
    const html = renderToStaticMarkup(
      React.createElement(rail.RailScoreboard, FINAL),
    );
    // Set 3 is 7-6(5) to Chen: the raised 5 follows Díaz's 6 ...
    expect(html).toMatch(
      />6<span class="inline-block w-0"><span aria-hidden="true"[^>]*>5</,
    );
    // ... and nothing hangs off Chen's 7.
    expect(html).not.toMatch(/>7<span class="inline-block w-0">/);
    expect(
      html.match(/aria-hidden="true" style="font-size:0.6em/g),
    ).toHaveLength(1);
    expect(html).toContain(" tiebreak 5");
  });
});
