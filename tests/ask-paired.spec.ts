import { expect, test } from "@playwright/test";

import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent, AskVisual } from "@/lib/services/ask/events";
import {
  type AskPairedContext,
  MAX_PAIRED_HEADLINE,
  buildPairedAnswer,
  onlyName,
  pairLabel,
  pairedShape,
} from "@/lib/services/ask/paired";

/**
 * Offline spec for the paired answer: a one-row result of convention pairs,
 * written by the server so that no sentence can state a pair backwards —
 * "Marek made more unforced errors than you" over 112 and 134.
 */

const DIAGNOSTIC: AskRow = {
  me_first_serve_pct: 60.2,
  opp_first_serve_pct: 65.8,
  me_second_serve_won_pct: 52.8,
  opp_second_serve_won_pct: 55.7,
  me_return_won_pct: 39.3,
  opp_return_won_pct: 41.3,
  me_break_points_converted: 6,
  opp_break_points_converted: 13,
  me_break_point_opportunities: 38,
  opp_break_point_opportunities: 40,
  me_winners: 86,
  opp_winners: 73,
  me_unforced_errors: 134,
  opp_unforced_errors: 112,
  me_total_points_won_pct: 48.7,
  opp_total_points_won_pct: 51.3,
  matches_in_scope: 3,
};

const PERSONAL: AskPairedContext = {
  team: false,
  matchCount: 3,
  opponentName: "Marek Dvorsky",
  playerName: null,
};

async function rendered(row: AskRow, context: AskPairedContext) {
  const answer = buildPairedAnswer([row], context);
  if (!answer) throw new Error("not pair-shaped");
  const { events, result } = renderAskAnswer(
    (async function* chunks() {
      yield answer.text;
    })(),
    answer.rows,
  );
  const seen: AskAnswerEvent[] = [];
  for await (const event of events) seen.push(event);
  return { answer, result };
}

function table(visual: AskVisual | null) {
  if (visual?.kind !== "table") throw new Error("no table");
  return visual;
}

test.describe("pairedShape — when a result is one row of pairs", () => {
  test("a me_/opp_ diagnostic: every pair, widest relative gap first", () => {
    const shape = pairedShape([DIAGNOSTIC]);
    expect(shape?.kind).toBe("opponent");
    expect(shape?.otherQualifier).toBe("opp_");
    expect(shape?.pairs.map((pair) => pair.measure)).toEqual([
      "break_points_converted",
      "unforced_errors",
      "winners",
      "first_serve_pct",
      "second_serve_won_pct",
      "total_points_won_pct",
      "break_point_opportunities",
      "return_won_pct",
    ]);
    expect(shape?.pairs[0]).toMatchObject({
      subject: "me_break_points_converted",
      other: "opp_break_points_converted",
      subjectValue: 6,
      otherValue: 13,
      percentage: false,
      label: "Break points converted",
    });
    expect(shape?.unpaired).toEqual([]);
  });

  test("a measure against its baseline, with what stands alone listed apart", () => {
    const shape = pairedShape([
      {
        aces: 8,
        first_serve_pct: 65.8,
        all_first_serve_pct: 62.2,
        first_serve_won_pct: 62.4,
        all_first_serve_won_pct: 71.7,
        all_matches: 18,
        matches_in_scope: 2,
      },
    ]);
    expect(shape?.kind).toBe("baseline");
    expect(shape?.otherQualifier).toBe("all_");
    expect(shape?.pairs).toHaveLength(2);
    expect(shape?.unpaired).toEqual([{ column: "aces", label: "Aces" }]);
  });

  test("not pair-shaped: several rows, no pair, two different comparisons, or mostly unpaired", () => {
    expect(pairedShape([DIAGNOSTIC, DIAGNOSTIC])).toBeNull();
    expect(pairedShape([{ aces: 8, winners: 20 }])).toBeNull();
    expect(pairedShape([])).toBeNull();
    // me/opp and a baseline in one row: two comparisons, two tables' worth.
    expect(
      pairedShape([{ me_aces: 8, opp_aces: 3, winners: 20, all_winners: 18 }]),
    ).toBeNull();
    expect(
      pairedShape([
        {
          first_serve_pct: 60,
          all_first_serve_pct: 61,
          team_first_serve_pct: 62,
        },
      ]),
    ).toBeNull();
    // One pair among five lone figures is not a comparison.
    expect(
      pairedShape([
        {
          aces: 8,
          all_aces: 5,
          winners: 1,
          double_faults: 2,
          forced_errors: 3,
        },
      ]),
    ).toBeNull();
    // A pair with no figure on one side is no pair.
    expect(pairedShape([{ me_aces: 8, opp_aces: null }])).toBeNull();
  });

  test("pairLabel: the dictionary's name, or the column's own words with no digit", () => {
    expect(pairLabel("total_points_won_pct")).toBe("Total points won");
    expect(pairLabel("big_point_serve_t_pct")).toBe("Big point serve t");
    expect(pairLabel("top10_rate")).toBe("Top rate");
  });

  test("onlyName: the one name every match shares", () => {
    expect(onlyName(["Marek Dvorsky", "Marek Dvorsky"])).toBe("Marek Dvorsky");
    expect(onlyName(["Marek Dvorsky", "Ilya Brandt"])).toBeNull();
    expect(onlyName(["Marek Dvorsky", null])).toBeNull();
    expect(onlyName([])).toBeNull();
  });
});

test.describe("buildPairedAnswer — me against the opponent", () => {
  test("headline: the widest gaps, each from the side that leads, with both figures; never better or worse", async () => {
    const { answer, result } = await rendered(DIAGNOSTIC, PERSONAL);

    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedVisualRows).toBe(0);
    expect(result.droppedSentences).toBe(0);
    // No digit is typed: every number and name is a reference.
    expect(answer.text.replace(/\{\{[^}]*\}\}/g, "")).not.toMatch(/\d/);

    expect(result.headline).toBe(
      "Marek Dvorsky had more break points converted (13 to 6); you had more unforced errors (134 to 112) and had more winners (86 to 73).",
    );
    expect(`${result.headline} ${result.text}`).not.toMatch(
      /\b(better|worse|best|worst|should|improv|strong|weak)/i,
    );
    expect(MAX_PAIRED_HEADLINE).toBe(3);
  });

  test("one table, subject then other, widest gap first, inside the table's limits", async () => {
    const { result } = await rendered(DIAGNOSTIC, PERSONAL);
    const visual = table(result.visual);
    expect(visual.caption).toBe(
      "The measures compared, widest gap first, from 3 matches.",
    );
    expect(visual.columns).toEqual(["You", "Marek Dvorsky"]);
    expect(visual.rows).toHaveLength(8);
    expect(visual.rows[0]).toEqual({
      label: "Break points converted",
      cells: ["6", "13"],
    });
    expect(visual.rows[1]).toEqual({
      label: "Unforced errors",
      cells: ["134", "112"],
    });
    expect(visual.rows[3]).toEqual({
      label: "First serves in",
      cells: ["60.2%", "65.8%"],
    });
  });

  test("body: the remaining pairs with their directions, then the match count", async () => {
    const { result } = await rendered(DIAGNOSTIC, PERSONAL);
    expect(result.text).toBe(
      "Marek Dvorsky was higher on first serves in (65.8% to 60.2%), was higher on second-serve points won (55.7% to 52.8%), was higher on total points won (51.3% to 48.7%), had more break point chances created (40 to 38) and was higher on return points won (41.3% to 39.3%). From 3 matches.",
    );
  });

  test("more than eight pairs: the table holds eight and is never dropped", async () => {
    const wide: AskRow = {
      ...DIAGNOSTIC,
      me_aces: 4,
      opp_aces: 9,
      me_double_faults: 3,
      opp_double_faults: 1,
    };
    const { result } = await rendered(wide, PERSONAL);
    expect(table(result.visual).rows).toHaveLength(8);
    expect(result.droppedVisuals).toEqual([]);
  });

  test("no single opponent: 'your opponents', plural; one match: 'your opponent' and 'This is one match.'", async () => {
    const many = await rendered(DIAGNOSTIC, {
      ...PERSONAL,
      opponentName: null,
    });
    expect(many.result.headline).toBe(
      "Your opponents had more break points converted (13 to 6); you had more unforced errors (134 to 112) and had more winners (86 to 73).",
    );
    expect(many.result.text).toContain(
      "Your opponents were higher on first serves in",
    );
    expect(table(many.result.visual).columns).toEqual(["You", "Opponents"]);

    const one = await rendered(
      { ...DIAGNOSTIC, matches_in_scope: 1 },
      { ...PERSONAL, opponentName: null, matchCount: 1 },
    );
    expect(one.result.headline.startsWith("Your opponent had more")).toBe(true);
    expect(one.result.text).toContain(
      "Your opponent was higher on first serves in",
    );
    expect(one.result.text.endsWith("This is one match.")).toBe(true);
    expect(table(one.result.visual).caption).toBe(
      "The measures compared, widest gap first, from 1 match.",
    );
    expect(table(one.result.visual).columns).toEqual(["You", "Opponent"]);
  });

  test("level pairs are said to be level, and a row that is level throughout says so", async () => {
    const { result } = await rendered(
      {
        me_aces: 4,
        opp_aces: 4,
        me_winners: 20,
        opp_winners: 12,
        matches_in_scope: 2,
      },
      { ...PERSONAL, matchCount: 2, opponentName: null },
    );
    expect(result.headline).toBe("You had more winners (20 to 12).");
    expect(result.text).toBe("Level: aces (4). From 2 matches.");

    const flat = await rendered(
      { me_aces: 4, opp_aces: 4, matches_in_scope: 2 },
      { ...PERSONAL, matchCount: 2, opponentName: null },
    );
    expect(flat.result.headline).toBe(
      "You and your opponents were level on every measure compared.",
    );
  });

  test("a count and its share in one table: the share says so", async () => {
    const { result } = await rendered(
      {
        me_break_points_converted: 6,
        opp_break_points_converted: 13,
        me_break_points_converted_pct: 15.8,
        opp_break_points_converted_pct: 32.5,
        matches_in_scope: 3,
      },
      PERSONAL,
    );
    expect(table(result.visual).rows.map((row) => row.label)).toEqual([
      "Break points converted",
      "Break points converted, share",
    ]);
  });
});

test.describe("buildPairedAnswer — a team scope", () => {
  test("one player: named from the data, third person, never 'you'", async () => {
    const { result } = await rendered(DIAGNOSTIC, {
      team: true,
      matchCount: 1,
      opponentName: "Aidan Kim",
      playerName: "Rudy Quan",
    });
    expect(result.headline).toBe(
      "Aidan Kim had more break points converted (13 to 6); Rudy Quan had more unforced errors (134 to 112) and had more winners (86 to 73).",
    );
    expect(table(result.visual).columns).toEqual(["Rudy Quan", "Aidan Kim"]);
    expect(`${result.headline} ${result.text}`).not.toMatch(/\byou(r)?\b/i);
  });

  test("several players and opponents: 'the team' and 'opponents'", async () => {
    const { result } = await rendered(DIAGNOSTIC, {
      team: true,
      matchCount: 10,
      opponentName: null,
      playerName: null,
    });
    expect(result.headline).toBe(
      "Opponents had more break points converted (13 to 6); the team had more unforced errors (134 to 112) and had more winners (86 to 73).",
    );
    expect(result.text).toContain("Opponents were higher on first serves in");
    expect(table(result.visual).columns).toEqual(["Team", "Opponents"]);
  });
});

test.describe("buildPairedAnswer — a measure against its baseline", () => {
  const AUGUST: AskRow = {
    aces: 8,
    double_faults: 8,
    first_serve_pct: 65.8,
    all_first_serve_pct: 62.2,
    first_serve_won_pct: 62.4,
    all_first_serve_won_pct: 71.7,
    second_serve_won_pct: 47.4,
    all_second_serve_won_pct: 49.2,
    matches_in_scope: 2,
  };

  test("higher or lower than across all matches, with both figures; lone figures listed plainly", async () => {
    const { result } = await rendered(AUGUST, {
      team: false,
      matchCount: 2,
      opponentName: null,
      playerName: null,
    });
    expect(result.headline).toBe(
      "First-serve points won was lower than across all matches (62.4% to 71.7%); first serves in was higher (65.8% to 62.2%); second-serve points won was lower (47.4% to 49.2%).",
    );
    expect(table(result.visual).columns).toEqual([
      "Selected matches",
      "All matches",
    ]);
    expect(result.text).toBe("Aces: 8. Double faults: 8. From 2 matches.");
  });

  test("counts take more and fewer; a team baseline is 'for the team' under the player's name", async () => {
    const { result } = await rendered(
      {
        double_faults: 1,
        team_double_faults: 6,
        first_serve_pct: 64.1,
        team_first_serve_pct: 65.5,
        matches_in_scope: 6,
      },
      {
        team: true,
        matchCount: 6,
        opponentName: null,
        playerName: "Rudy Quan",
      },
    );
    expect(result.headline).toBe(
      "There were fewer double faults than for the team (1 to 6); first serves in was lower (64.1% to 65.5%).",
    );
    expect(table(result.visual).columns).toEqual(["Rudy Quan", "Team"]);
  });

  test("the previous five, as a suffix: named from what it says", async () => {
    const { result } = await rendered(
      { winners: 30, winners_prev5: 24, matches_in_scope: 1 },
      {
        team: false,
        matchCount: 1,
        opponentName: "Sam Ortiz",
        playerName: null,
      },
    );
    expect(result.headline).toBe(
      "There were more winners than over the previous five matches (30 to 24).",
    );
    expect(result.text).toBe("This is one match.");
  });
});
