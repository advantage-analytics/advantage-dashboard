import { expect, test } from "@playwright/test";

import {
  NO_OPPONENT_FILTERS,
  OPPONENT_BACKHAND_OPTIONS,
  OPPONENT_HAND_OPTIONS,
  OPPONENT_SORTS,
  OPPONENT_VIEWS,
  RESTING_OPPONENT_CUT,
  applyOpponentCut,
  describeOpponentFilters,
  emptyOpponentCut,
  matchesBackhandFilter,
  matchesHandFilter,
  matchesOpponentFilters,
  matchesOpponentView,
  opponentSortTriggerLabel,
  sortOpponents,
  type OpponentFilters,
  type OpponentView,
} from "@/components/dashboard/opponents/opponents-views";
import {
  groupPersonalOpponents,
  type PersonalOpponentMatchInput,
} from "@/lib/data/personal-opponents";

/**
 * The Opponents toolbar's chips, filter facets and sort, with no page behind
 * them — the pure module only, over four opponents grouped by the real
 * grouping so the fixture cannot drift from the shape the loader sends.
 *
 * | Opponent     | Hand  | Backhand   | Played | Wins | This season | Last played |
 * | ------------ | ----- | ---------- | ------ | ---- | ----------- | ----------- |
 * | Ana Castillo | right | two-handed | 3      | 2    | 3           | 2026-09-20  |
 * | Bea Dorn     | left  | two-handed | 1      | 0    | 1           | 2026-09-10  |
 * | Cara Ellis   | left  | one-handed | 4      | 0    | 0           | 2026-03-01  |
 * | Dina Frost   | —     | —          | 1      | 1    | 1           | 2026-08-15  |
 */

const SEASON = "2026–27";

const WON = { player1: [6, 6], player2: [3, 4] };
const LOST = { player1: [4, 2], player2: [6, 6] };

let nextId = 0;

function match(
  overrides: Partial<PersonalOpponentMatchInput>,
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

const ana = { player2_name: "Ana Castillo", opponent_hand: "right" };
const bea = { player2_name: "Bea Dorn", opponent_hand: "Left" };
const cara = { player2_name: "Cara Ellis", opponent_hand: "left-handed" };

const OPPONENTS = groupPersonalOpponents(
  [
    match({ ...ana, opponent_backhand: "two-handed", date: "2026-09-20" }),
    match({ ...ana, opponent_backhand: "two-handed", date: "2026-09-05" }),
    match({ ...ana, date: "2026-08-20", score: LOST }),
    match({
      ...bea,
      opponent_backhand: "2-handed",
      date: "2026-09-10",
      score: LOST,
    }),
    match({
      ...cara,
      opponent_backhand: "one-handed",
      date: "2026-03-01",
      score: LOST,
    }),
    match({ ...cara, date: "2026-01-12", score: LOST }),
    match({ ...cara, date: "2025-11-02", score: LOST }),
    match({ ...cara, date: "2025-10-04", score: LOST }),
    match({ player2_name: "Dina Frost", date: "2026-08-15" }),
  ],
  SEASON,
);

function names(opponents: readonly { name: string }[]): string[] {
  return opponents.map((opponent) => opponent.name);
}

function inView(view: OpponentView): string[] {
  return names(OPPONENTS.filter((o) => matchesOpponentView(o, view))).sort();
}

test("the fixture is four grouped opponents", () => {
  expect(names(OPPONENTS).sort()).toEqual([
    "Ana Castillo",
    "Bea Dorn",
    "Cara Ellis",
    "Dina Frost",
  ]);
});

test.describe("view chips", () => {
  test("the switcher is the fixed four, All first", () => {
    expect(OPPONENT_VIEWS.map((view) => view.label)).toEqual([
      "All",
      "This season",
      "Played 3 or more",
      "Never beaten",
    ]);
  });

  test("All keeps everybody", () => {
    expect(inView("all")).toHaveLength(4);
  });

  test("This season keeps opponents with a match in the current season", () => {
    // Cara's four meetings all fall in 2025–26.
    expect(inView("this-season")).toEqual([
      "Ana Castillo",
      "Bea Dorn",
      "Dina Frost",
    ]);
  });

  test("Played 3 or more keeps played >= 3", () => {
    expect(inView("played-3")).toEqual(["Ana Castillo", "Cara Ellis"]);
    expect(
      matchesOpponentView(
        { played: 3, wins: 0, playedThisSeason: 0 },
        "played-3",
      ),
    ).toBe(true);
    expect(
      matchesOpponentView(
        { played: 2, wins: 0, playedThisSeason: 0 },
        "played-3",
      ),
    ).toBe(false);
  });

  test("Never beaten keeps wins === 0", () => {
    expect(inView("never-beaten")).toEqual(["Bea Dorn", "Cara Ellis"]);
  });
});

test.describe("filter facets", () => {
  const byHand = (hand: OpponentFilters["hand"]) =>
    names(OPPONENTS.filter((o) => matchesHandFilter(o, hand))).sort();
  const byBackhand = (backhand: OpponentFilters["backhand"]) =>
    names(OPPONENTS.filter((o) => matchesBackhandFilter(o, backhand))).sort();

  test("the facets are Any · Right · Left and Any · One-handed · Two-handed", () => {
    expect(OPPONENT_HAND_OPTIONS.map((o) => o.label)).toEqual([
      "Any",
      "Right",
      "Left",
    ]);
    expect(OPPONENT_BACKHAND_OPTIONS.map((o) => o.label)).toEqual([
      "Any",
      "One-handed",
      "Two-handed",
    ]);
  });

  test("Hand: Any keeps everybody, the unrecorded included", () => {
    expect(byHand(null)).toHaveLength(4);
  });

  test("Hand: Right", () => {
    expect(byHand("right")).toEqual(["Ana Castillo"]);
  });

  test("Hand: Left reads every stored spelling, and never the unrecorded", () => {
    // "Left" and "left-handed" are both stored spellings; Dina has no hand.
    expect(byHand("left")).toEqual(["Bea Dorn", "Cara Ellis"]);
  });

  test("Backhand: Any keeps everybody", () => {
    expect(byBackhand(null)).toHaveLength(4);
  });

  test("Backhand: One-handed", () => {
    expect(byBackhand("one-handed")).toEqual(["Cara Ellis"]);
  });

  test("Backhand: Two-handed", () => {
    expect(byBackhand("two-handed")).toEqual(["Ana Castillo", "Bea Dorn"]);
  });

  test("the two facets AND", () => {
    const filters: OpponentFilters = { hand: "left", backhand: "two-handed" };
    expect(
      names(OPPONENTS.filter((o) => matchesOpponentFilters(o, filters))),
    ).toEqual(["Bea Dorn"]);
  });

  test("the strip states the cut in capitalised phrases joined by middots", () => {
    expect(
      describeOpponentFilters({ hand: "left", backhand: "two-handed" }),
    ).toBe("Left-handed · Two-handed");
    expect(describeOpponentFilters({ hand: "right", backhand: null })).toBe(
      "Right-handed",
    );
    expect(describeOpponentFilters(NO_OPPONENT_FILTERS)).toBe("");
  });
});

test.describe("sort", () => {
  test("the menu is exactly the three orders, Last played the default", () => {
    expect(OPPONENT_SORTS.map((sort) => sort.label)).toEqual([
      "Last played (newest first)",
      "Name (A–Z)",
      "Most played",
    ]);
    expect(RESTING_OPPONENT_CUT.sort).toBe("last-played");
    expect(opponentSortTriggerLabel("last-played")).toBe("Last played");
    expect(opponentSortTriggerLabel("most-played")).toBe("Most played");
  });

  test("Last played is newest first", () => {
    expect(names(sortOpponents(OPPONENTS, "last-played"))).toEqual([
      "Ana Castillo",
      "Bea Dorn",
      "Dina Frost",
      "Cara Ellis",
    ]);
  });

  test("Name is A–Z", () => {
    expect(names(sortOpponents(OPPONENTS, "name"))).toEqual([
      "Ana Castillo",
      "Bea Dorn",
      "Cara Ellis",
      "Dina Frost",
    ]);
  });

  test("Most played leads with the highest count, ties by last played", () => {
    expect(names(sortOpponents(OPPONENTS, "most-played"))).toEqual([
      "Cara Ellis",
      "Ana Castillo",
      "Bea Dorn",
      "Dina Frost",
    ]);
  });

  test("sorting never reorders the caller's array", () => {
    const before = names(OPPONENTS);
    sortOpponents(OPPONENTS, "name");
    expect(names(OPPONENTS)).toEqual(before);
  });
});

test.describe("chip, filter and sort together", () => {
  test("the filter's N of M reads against the chip's set", () => {
    const { visible, inView: held } = applyOpponentCut(OPPONENTS, {
      view: "never-beaten",
      filters: { hand: "left", backhand: "one-handed" },
      sort: "name",
    });
    expect(names(visible)).toEqual(["Cara Ellis"]);
    expect(held).toBe(2);
  });

  test("a cut that leaves nothing names itself and offers one way out", () => {
    const cut = {
      view: "this-season",
      filters: { hand: "left", backhand: "one-handed" },
      sort: "last-played",
    } as const;
    expect(applyOpponentCut(OPPONENTS, cut).visible).toEqual([]);

    const empty = emptyOpponentCut(cut);
    expect(empty.title).toBe(
      "No left-handed opponents with a one-handed backhand this season",
    );
    expect(empty.action.label).toBe("Clear filter");
    expect(empty.action.undo).toEqual({
      view: "this-season",
      filters: NO_OPPONENT_FILTERS,
    });
  });

  test("with no filter on, the way out of an empty chip is All", () => {
    const empty = emptyOpponentCut({
      view: "played-3",
      filters: NO_OPPONENT_FILTERS,
    });
    expect(empty.title).toBe("No opponents played 3 or more times");
    expect(empty.action).toEqual({
      label: "Show all opponents",
      undo: { view: "all", filters: NO_OPPONENT_FILTERS },
    });
  });
});
