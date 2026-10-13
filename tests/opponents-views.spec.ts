import { expect, test } from "@playwright/test";

import {
  NO_OPPONENT_FILTERS,
  OPPONENT_BACKHAND_OPTIONS,
  OPPONENT_HAND_OPTIONS,
  OPPONENT_SORTS,
  OPPONENT_VIEWS,
  RESTING_OPPONENT_CUT,
  NO_PROGRAM_KEY,
  applyOpponentCut,
  describeOpponentFilters,
  emptyOpponentCut,
  hasOpponentFilters,
  matchesBackhandFilter,
  matchesFacedByFilter,
  matchesHandFilter,
  matchesOpponentFilters,
  matchesOpponentView,
  matchesProgramFilter,
  opponentFacedByChoices,
  opponentProgramChoices,
  opponentProgramKey,
  opponentSortTriggerLabel,
  sortOpponents,
  teamOpponentsFooter,
  teamOpponentsSubline,
  toggleFacetValue,
  type OpponentFilters,
  type OpponentView,
} from "@/components/dashboard/opponents/opponents-views";
import {
  groupPersonalOpponents,
  type PersonalOpponentMatchInput,
} from "@/lib/data/personal-opponents";
import {
  groupTeamOpponents,
  type TeamOpponentMatchInput,
  type TeamOpponentProgram,
  type TeamOpponentRosterPlayer,
} from "@/lib/data/team-opponents";

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
        { played: 3, wins: 0, losses: 3, playedThisSeason: 0 },
        "played-3",
      ),
    ).toBe(true);
    expect(
      matchesOpponentView(
        { played: 2, wins: 0, losses: 2, playedThisSeason: 0 },
        "played-3",
      ),
    ).toBe(false);
  });

  test("Never beaten keeps no wins and at least one loss", () => {
    expect(inView("never-beaten")).toEqual(["Bea Dorn", "Cara Ellis"]);
  });

  test("Never beaten leaves out a 0-0 record", () => {
    // One undecided meeting: nobody has beaten anybody yet.
    expect(
      matchesOpponentView(
        { played: 1, wins: 0, losses: 0, playedThisSeason: 1 },
        "never-beaten",
      ),
    ).toBe(false);
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
    const filters: OpponentFilters = {
      ...NO_OPPONENT_FILTERS,
      hand: "left",
      backhand: "two-handed",
    };
    expect(
      names(OPPONENTS.filter((o) => matchesOpponentFilters(o, filters))),
    ).toEqual(["Bea Dorn"]);
  });

  test("the strip states the cut in capitalised phrases joined by middots", () => {
    expect(
      describeOpponentFilters({
        ...NO_OPPONENT_FILTERS,
        hand: "left",
        backhand: "two-handed",
      }),
    ).toBe("Left-handed · Two-handed");
    expect(
      describeOpponentFilters({ ...NO_OPPONENT_FILTERS, hand: "right" }),
    ).toBe("Right-handed");
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
      filters: { ...NO_OPPONENT_FILTERS, hand: "left", backhand: "one-handed" },
      sort: "name",
    });
    expect(names(visible)).toEqual(["Cara Ellis"]);
    expect(held).toBe(2);
  });

  test("a cut that leaves nothing names itself and offers one way out", () => {
    const cut = {
      view: "this-season",
      filters: { ...NO_OPPONENT_FILTERS, hand: "left", backhand: "one-handed" },
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

/**
 * The team page's two checklist facets, over four opponents grouped by the
 * real team grouping.
 *
 * | Opponent     | Program (kind)            | Faced by   |
 * | ------------ | ------------------------- | ---------- |
 * | Ana Castillo | State University (listed) | Ada, Bea   |
 * | Bea Dorn     | Harbor College (typed)    | Bea        |
 * | Cara Ellis   | —                         | Cy         |
 * | Dina Frost   | State University (listed) | Ada        |
 */
test.describe("the team page's Program and Faced-by facets", () => {
  const ROSTER: TeamOpponentRosterPlayer[] = [
    { playerId: "p-ada", userId: null, name: "Ada Okafor", photoUrl: null },
    { playerId: "p-bea", userId: null, name: "Bea Lindqvist", photoUrl: null },
    { playerId: "p-cy", userId: null, name: "Cy Abara", photoUrl: null },
  ];

  const STATE: TeamOpponentProgram = {
    id: "prog-state",
    schoolName: "State University",
    shortCode: "STU",
    crestUrl: null,
    conference: null,
    division: null,
  };

  let teamId = 0;
  function teamMatch(
    overrides: Partial<TeamOpponentMatchInput>,
  ): TeamOpponentMatchInput {
    teamId += 1;
    return {
      id: `t${teamId}`,
      date: "2026-09-01",
      player1_id: "p-ada",
      player1_name: "Ada Okafor",
      player2_name: "Ana Castillo",
      created_by: null,
      opponent_player_id: null,
      opponent_hand: null,
      opponent_backhand: null,
      score: WON,
      values: null,
      opponent_program: null,
      opponent_school: null,
      ...overrides,
    };
  }

  const { opponents: TEAM, totals } = groupTeamOpponents(
    [
      teamMatch({ opponent_program: STATE, date: "2026-09-20" }),
      teamMatch({
        player1_id: "p-bea",
        opponent_program: STATE,
        date: "2026-09-12",
      }),
      teamMatch({
        player1_id: "p-bea",
        player2_name: "Bea Dorn",
        opponent_school: "Harbor  College",
        opponent_hand: "left",
        date: "2026-09-10",
      }),
      teamMatch({
        player1_id: "p-cy",
        player2_name: "Cara Ellis",
        date: "2026-09-05",
      }),
      teamMatch({
        player2_name: "Dina Frost",
        opponent_program: STATE,
        date: "2026-08-15",
      }),
    ],
    ROSTER,
    SEASON,
  );

  const STATE_KEY = "id:prog-state";
  const HARBOR_KEY = "name:harbor college";

  const inPrograms = (programs: readonly string[]) =>
    names(TEAM.filter((o) => matchesProgramFilter(o, programs))).sort();
  const facedBy = (players: readonly string[]) =>
    names(TEAM.filter((o) => matchesFacedByFilter(o, players))).sort();

  test("a program is keyed by id, a typed school by its name, neither by the none key", () => {
    const key = (name: string) =>
      opponentProgramKey(TEAM.find((o) => o.name === name)!);
    expect(key("Ana Castillo")).toBe(STATE_KEY);
    expect(key("Bea Dorn")).toBe(HARBOR_KEY);
    expect(key("Cara Ellis")).toBe(NO_PROGRAM_KEY);
  });

  test("the Program checklist is one row per place, A–Z, then No team", () => {
    expect(opponentProgramChoices(TEAM)).toEqual([
      { value: HARBOR_KEY, label: "Harbor College" },
      { value: STATE_KEY, label: "State University" },
      { value: NO_PROGRAM_KEY, label: "No team" },
    ]);
    // As many places as the title row counts.
    expect(opponentProgramChoices(TEAM).length - 1).toBe(totals.programs);
  });

  test("Program: nothing ticked keeps everybody", () => {
    expect(inPrograms([])).toHaveLength(4);
  });

  test("Program: a directory program keeps the opponents who play there", () => {
    expect(inPrograms([STATE_KEY])).toEqual(["Ana Castillo", "Dina Frost"]);
  });

  test("Program: a typed school is its own place, not No team", () => {
    expect(inPrograms([HARBOR_KEY])).toEqual(["Bea Dorn"]);
    expect(inPrograms([NO_PROGRAM_KEY])).toEqual(["Cara Ellis"]);
  });

  test("Program: several ticks OR", () => {
    expect(inPrograms([STATE_KEY, NO_PROGRAM_KEY])).toEqual([
      "Ana Castillo",
      "Cara Ellis",
      "Dina Frost",
    ]);
  });

  test("the Faced-by checklist is one row per roster player present, A–Z", () => {
    expect(opponentFacedByChoices(TEAM)).toEqual([
      { value: "p-ada", label: "Ada Okafor" },
      { value: "p-bea", label: "Bea Lindqvist" },
      { value: "p-cy", label: "Cy Abara" },
    ]);
  });

  test("Faced by: nothing ticked keeps everybody", () => {
    expect(facedBy([])).toHaveLength(4);
  });

  test("Faced by: one player keeps every opponent they met", () => {
    expect(facedBy(["p-bea"])).toEqual(["Ana Castillo", "Bea Dorn"]);
    expect(facedBy(["p-cy"])).toEqual(["Cara Ellis"]);
  });

  test("Faced by: several ticks OR", () => {
    expect(facedBy(["p-ada", "p-cy"])).toEqual([
      "Ana Castillo",
      "Cara Ellis",
      "Dina Frost",
    ]);
  });

  test("a personal row, which carries neither field, matches no tick", () => {
    const kept = (filters: Partial<OpponentFilters>) =>
      OPPONENTS.filter((o) =>
        matchesOpponentFilters(o, { ...NO_OPPONENT_FILTERS, ...filters }),
      ).length;
    expect(kept({ facedBy: ["p-ada"] })).toBe(0);
    expect(kept({ programs: [STATE_KEY] })).toBe(0);
    // …and reads as "No team", which is true of it.
    expect(kept({ programs: [NO_PROGRAM_KEY] })).toBe(OPPONENTS.length);
  });

  test("the facets AND with each other and with Hand", () => {
    const cut = applyOpponentCut(TEAM, {
      ...RESTING_OPPONENT_CUT,
      filters: {
        ...NO_OPPONENT_FILTERS,
        programs: [STATE_KEY, HARBOR_KEY],
        facedBy: ["p-bea"],
      },
      sort: "name",
    });
    expect(names(cut.visible)).toEqual(["Ana Castillo", "Bea Dorn"]);
    expect(cut.inView).toBe(4);

    expect(
      names(
        TEAM.filter((o) =>
          matchesOpponentFilters(o, {
            ...NO_OPPONENT_FILTERS,
            hand: "left",
            facedBy: ["p-bea"],
          }),
        ),
      ),
    ).toEqual(["Bea Dorn"]);
  });

  test("a tick counts as a filter, and toggling returns a new list", () => {
    expect(hasOpponentFilters(NO_OPPONENT_FILTERS)).toBe(false);
    expect(
      hasOpponentFilters({ ...NO_OPPONENT_FILTERS, programs: [STATE_KEY] }),
    ).toBe(true);
    expect(
      hasOpponentFilters({ ...NO_OPPONENT_FILTERS, facedBy: ["p-ada"] }),
    ).toBe(true);

    const ticked: readonly string[] = ["p-ada"];
    expect(toggleFacetValue(ticked, "p-bea")).toEqual(["p-ada", "p-bea"]);
    expect(toggleFacetValue(ticked, "p-ada")).toEqual([]);
    expect(ticked).toEqual(["p-ada"]);
  });

  test("the strip names the ticked players and places", () => {
    const choices = {
      programs: opponentProgramChoices(TEAM),
      facedBy: opponentFacedByChoices(TEAM),
    };
    expect(
      describeOpponentFilters(
        {
          hand: "left",
          backhand: null,
          programs: [NO_PROGRAM_KEY, STATE_KEY],
          facedBy: ["p-bea"],
        },
        choices,
      ),
    ).toBe(
      "Faced by Bea Lindqvist · State University or No team · Left-handed",
    );
    expect(
      describeOpponentFilters(
        { ...NO_OPPONENT_FILTERS, facedBy: ["p-cy", "p-ada"] },
        choices,
      ),
    ).toBe("Faced by Ada Okafor or Cy Abara");
  });

  test("an empty team cut says a filter emptied it and clears it", () => {
    const empty = emptyOpponentCut({
      view: "all",
      filters: {
        ...NO_OPPONENT_FILTERS,
        programs: [HARBOR_KEY],
        facedBy: ["p-cy"],
      },
    });
    expect(empty.title).toBe("No opponents in this filter");
    expect(empty.action).toEqual({
      label: "Clear filter",
      undo: { view: "all", filters: NO_OPPONENT_FILTERS },
    });
  });

  test("the title subline and the footer read the loader's totals", () => {
    expect(teamOpponentsSubline(totals)).toBe(
      "4 opponents · 2 programs · 5 matches",
    );
    expect(
      teamOpponentsSubline({ opponents: 1, programs: 1, matches: 1 }),
    ).toBe("1 opponent · 1 program · 1 match");
    expect(
      teamOpponentsFooter(3, {
        opponents: 7,
        matches: 23,
        analyzed: 18,
        unattributed: 0,
      }),
    ).toBe("3 of 7 opponents · 18 of 23 matches analyzed");
    expect(
      teamOpponentsFooter(1, {
        opponents: 1,
        matches: 1,
        analyzed: 0,
        unattributed: 2,
      }),
    ).toBe(
      "1 of 1 opponent · 0 of 1 match analyzed · 2 more matches with no roster player",
    );
  });
});
