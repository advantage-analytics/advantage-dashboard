import { expect, test } from "@playwright/test";

import {
  PERSONAL_OPPONENT_MEASURE_KEYS,
  countUnnamedMatches,
  currentSeason,
  groupPersonalOpponents,
  isInSeason,
  personalOpponentTotals,
  type PersonalOpponentMatchInput,
} from "@/lib/data/personal-opponents";

/**
 * The personal Opponents page's grouping, with no database behind it.
 *
 * Imports the pure module only. What these pin is the set of rules that go
 * wrong silently: a second spelling of a name becoming a second opponent, an
 * unscored match drawn as a loss, and an absent statistic averaged in as zero.
 */

const SEASON = "2026–27";

const WON = { player1: [6, 6], player2: [3, 4] };
const LOST = { player1: [4, 2], player2: [6, 6] };

let nextId = 0;

function match(
  overrides: Partial<PersonalOpponentMatchInput> = {},
): PersonalOpponentMatchInput {
  nextId += 1;
  return {
    id: `m${nextId}`,
    date: "2026-09-01",
    isUserPlayer1: true,
    player1_name: "Me",
    player2_name: "Ana Castillo",
    opponent_player_id: null,
    opponent_hand: null,
    opponent_backhand: null,
    score: WON,
    values: null,
    ...overrides,
  };
}

test.describe("who counts as the same opponent", () => {
  test("two spellings of one name collapse to one row", () => {
    const opponents = groupPersonalOpponents(
      [
        match({ player2_name: "Ana Castillo", date: "2026-09-10" }),
        match({ player2_name: "  ana   CASTILLO ", date: "2026-09-01" }),
      ],
      SEASON,
    );

    expect(opponents).toHaveLength(1);
    expect(opponents[0].key).toBe("name:ana castillo");
    expect(opponents[0].played).toBe(2);
    // Spelled as the most recent match spelled it.
    expect(opponents[0].name).toBe("Ana Castillo");
  });

  test("a near-miss stays a separate opponent", () => {
    const opponents = groupPersonalOpponents(
      [
        match({ player2_name: "Ana Castillo" }),
        match({ player2_name: "A. Castillo" }),
      ],
      SEASON,
    );
    expect(opponents).toHaveLength(2);
  });

  test("an opponent_player_id beats the name", () => {
    const opponents = groupPersonalOpponents(
      [
        // One id, two names: one opponent.
        match({ opponent_player_id: "p-1", player2_name: "Ana Castillo" }),
        match({ opponent_player_id: "p-1", player2_name: "Anna Castilo" }),
        // One name, a different id: somebody else.
        match({ opponent_player_id: "p-2", player2_name: "Ana Castillo" }),
      ],
      SEASON,
    );

    expect(opponents.map((o) => o.key).sort()).toEqual(["id:p-1", "id:p-2"]);
    const first = opponents.find((o) => o.key === "id:p-1");
    expect(first?.played).toBe(2);
    expect(first?.opponentPlayerId).toBe("p-1");
  });

  test("a match that names nobody is left out, not pooled", () => {
    const opponents = groupPersonalOpponents(
      [match({ player2_name: null }), match({ player2_name: "   " })],
      SEASON,
    );
    expect(opponents).toEqual([]);
  });

  test("a viewer seated as player two is grouped by player one's name", () => {
    const [opponent] = groupPersonalOpponents(
      [
        match({
          isUserPlayer1: false,
          player1_name: "Ana Castillo",
          player2_name: "Me",
          score: LOST,
        }),
      ],
      SEASON,
    );
    expect(opponent.key).toBe("name:ana castillo");
    // Player two took both sets, and the viewer is player two.
    expect(opponent.wins).toBe(1);
    expect(opponent.lastMatch.sets[0]).toMatchObject({
      player1: 6,
      player2: 4,
    });
  });
});

test.describe("record and form", () => {
  test("a match with no decidable score is pending, and neither a win nor a loss", () => {
    const [opponent] = groupPersonalOpponents(
      [
        match({ date: "2026-09-04", score: null }),
        match({ date: "2026-09-03", score: WON }),
        match({ date: "2026-09-02", score: LOST }),
        // Level sets: played, undecided.
        match({
          date: "2026-09-01",
          score: { player1: [6, 4], player2: [4, 6] },
        }),
      ],
      SEASON,
    );

    expect(opponent.played).toBe(4);
    expect(opponent.wins).toBe(1);
    expect(opponent.losses).toBe(1);
    // Oldest first.
    expect(opponent.form).toEqual(["pending", "loss", "win", "pending"]);
    expect(opponent.lastMatch.won).toBeNull();
    expect(opponent.lastMatch.sets).toEqual([]);
  });

  test("form is the last five, and recent the last six", () => {
    const [opponent] = groupPersonalOpponents(
      Array.from({ length: 8 }, (_, i) =>
        match({
          id: `d${i + 1}`,
          date: `2026-09-0${i + 1}`,
          score: i === 7 ? LOST : WON,
        }),
      ),
      SEASON,
    );

    expect(opponent.form).toEqual(["win", "win", "win", "win", "loss"]);
    expect(opponent.recent.map((r) => r.id)).toEqual([
      "d8",
      "d7",
      "d6",
      "d5",
      "d4",
      "d3",
    ]);
    expect(opponent.lastMatch.id).toBe("d8");
  });
});

test.describe("hand and backhand", () => {
  test("take the latest non-null value", () => {
    const [opponent] = groupPersonalOpponents(
      [
        match({ date: "2026-09-03", opponent_hand: null }),
        match({
          date: "2026-09-02",
          opponent_hand: "left",
          opponent_backhand: null,
        }),
        match({
          date: "2026-09-01",
          opponent_hand: "right",
          opponent_backhand: "one-handed",
        }),
      ],
      SEASON,
    );

    expect(opponent.hand).toBe("left");
    expect(opponent.backhand).toBe("one-handed");
  });

  test("are null when no match recorded them", () => {
    const [opponent] = groupPersonalOpponents([match()], SEASON);
    expect(opponent.hand).toBeNull();
    expect(opponent.backhand).toBeNull();
  });
});

test.describe("measures", () => {
  test("value is null when no match carries stats", () => {
    const [opponent] = groupPersonalOpponents([match(), match()], SEASON);

    expect(opponent.analyzed).toBe(0);
    expect(opponent.measures.map((m) => m.key)).toEqual([
      "total_points_won_pct",
      "first_serve_won_pct",
      "first_return_won_pct",
      "break_points_converted_pct",
    ]);
    expect(opponent.measures.map((m) => m.key)).toEqual([
      ...PERSONAL_OPPONENT_MEASURE_KEYS,
    ]);
    for (const measure of opponent.measures) {
      expect(measure.value).toBeNull();
      expect(measure.trend).toBeNull();
      expect(measure.label).not.toBe(measure.key);
    }
    expect(opponent.recent[0].values).toEqual({
      total_points_won_pct: null,
      first_serve_won_pct: null,
      first_return_won_pct: null,
      break_points_converted_pct: null,
    });
  });

  test("value is the mean over recent's non-null points, zeros included", () => {
    const [opponent] = groupPersonalOpponents(
      [
        match({
          date: "2026-09-03",
          values: {
            total_points_won_pct: 60,
            first_serve_won_pct: 70,
            first_return_won_pct: null,
            break_points_converted_pct: 0,
          },
        }),
        match({
          date: "2026-09-02",
          values: {
            total_points_won_pct: 50,
            first_serve_won_pct: null,
            first_return_won_pct: null,
            break_points_converted_pct: 50,
          },
        }),
        match({ date: "2026-09-01", values: null }),
      ],
      SEASON,
    );

    const value = (key: string) =>
      opponent.measures.find((m) => m.key === key)?.value;
    expect(opponent.analyzed).toBe(2);
    expect(value("total_points_won_pct")).toBe(55);
    expect(value("first_serve_won_pct")).toBe(70);
    expect(value("first_return_won_pct")).toBeNull();
    expect(value("break_points_converted_pct")).toBe(25);
  });

  test("trend is recent against everything earlier", () => {
    const stats = (total: number) => ({
      total_points_won_pct: total,
      first_serve_won_pct: null,
      first_return_won_pct: null,
      break_points_converted_pct: null,
    });
    const [opponent] = groupPersonalOpponents(
      [
        ...Array.from({ length: 6 }, (_, i) =>
          match({ date: `2026-09-1${i}`, values: stats(60) }),
        ),
        match({ date: "2026-08-01", values: stats(50) }),
      ],
      SEASON,
    );

    expect(opponent.measures[0]).toMatchObject({ value: 60, trend: 10 });
    expect(opponent.measures[1].trend).toBeNull();
  });
});

test.describe("ordering, totals and season", () => {
  test("opponents sort by last match, newest first, undated last", () => {
    const opponents = groupPersonalOpponents(
      [
        match({ player2_name: "Old", date: "2025-03-01" }),
        match({ player2_name: "Undated", date: null }),
        match({ player2_name: "New", date: "2026-09-20" }),
        match({ player2_name: "Old", date: "2024-03-01" }),
      ],
      SEASON,
    );
    expect(opponents.map((o) => o.name)).toEqual(["New", "Old", "Undated"]);
  });

  test("totals count the rows listed", () => {
    const opponents = groupPersonalOpponents(
      [
        match({ player2_name: "A", score: WON, values: {} }),
        match({ player2_name: "A", score: LOST }),
        match({ player2_name: "B", score: null }),
      ],
      SEASON,
    );
    expect(personalOpponentTotals(opponents)).toEqual({
      opponents: 2,
      matches: 3,
      won: 1,
      analyzed: 1,
      unnamed: 0,
    });
    expect(personalOpponentTotals([])).toEqual({
      opponents: 0,
      matches: 0,
      won: 0,
      analyzed: 0,
      unnamed: 0,
    });
  });

  test("matches that name nobody are counted apart, never listed", () => {
    const matches = [
      match({ player2_name: "A" }),
      match({ player2_name: "   " }),
      match({ player2_name: null }),
    ];
    const opponents = groupPersonalOpponents(matches, SEASON);
    expect(countUnnamedMatches(matches)).toBe(2);
    expect(
      personalOpponentTotals(opponents, countUnnamedMatches(matches)),
    ).toMatchObject({ opponents: 1, matches: 1, unnamed: 2 });
  });

  test("a match is marked against the current academic season", () => {
    expect(currentSeason(new Date("2026-10-10T12:00:00Z"))).toBe(SEASON);
    expect(currentSeason(new Date("2026-07-31T12:00:00Z"))).toBe("2025–26");
    expect(isInSeason("2026-08-01", SEASON)).toBe(true);
    expect(isInSeason("2026-07-31", SEASON)).toBe(false);
    expect(isInSeason(null, SEASON)).toBe(false);

    const [opponent] = groupPersonalOpponents(
      [
        match({ date: "2026-09-01" }),
        match({ date: "2026-03-01" }),
        match({ date: null }),
      ],
      SEASON,
    );
    expect(opponent.playedThisSeason).toBe(1);
    expect(opponent.recent.map((r) => r.inSeason)).toEqual([
      true,
      false,
      false,
    ]);
  });
});
