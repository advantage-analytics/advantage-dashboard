import { expect, test } from "@playwright/test";

import {
  isLive,
  opponentDrawerFooter,
  opponentFirstName,
  opponentMatchesHref,
  rowDate,
} from "@/components/dashboard/opponents/opponent-drawer-shared";
import {
  FACED_BY_CHIP_LIMIT,
  facedByControl,
  opponentScope,
  opponentTeamLine,
  recordLabel,
  scopeHasStats,
  scopePlaceholder,
  scopeRecentLabel,
  scopeStatLabel,
} from "@/components/dashboard/opponents/team-opponent-scope";
import { RECENT_MATCH_GRID_WITH_FACE } from "@/components/dashboard/team/player-drawer-layout";
import {
  PERSONAL_OPPONENT_MEASURE_KEYS,
  UNKNOWN_OPPONENT_NAME,
  type PersonalOpponentMeasure,
} from "@/lib/data/personal-opponents";
import type {
  TeamOpponentFacedBy,
  TeamOpponentRecentMatch,
} from "@/lib/data/team-opponents";

/**
 * The team opponent drawer's decisions, with no component behind them.
 *
 * Imports `.ts` only. What these pin is what the drawer can get wrong with
 * nothing looking broken: one player's numbers under another's name, a stat
 * block of live pills over nothing, a typed school read as "No team", and a
 * footer that links to a page still behind its coming-soon stub.
 */

function measures(value: number | null): PersonalOpponentMeasure[] {
  return PERSONAL_OPPONENT_MEASURE_KEYS.map((key) => ({
    key,
    label: key,
    value,
    trend: null,
  }));
}

function recent(id: string, rosterPlayerId: string): TeamOpponentRecentMatch {
  return {
    id,
    rosterPlayerId,
  } as TeamOpponentRecentMatch;
}

function faced(
  playerId: string,
  name: string,
  overrides: Partial<TeamOpponentFacedBy> = {},
): TeamOpponentFacedBy {
  return {
    playerId,
    name,
    firstName: name.split(" ")[0],
    photoUrl: null,
    wins: 1,
    losses: 0,
    played: 1,
    analyzed: 1,
    form: [],
    recent: [recent(`m-${playerId}`, playerId)],
    measures: measures(60),
    ...overrides,
  };
}

const ADA = faced("p-ada", "Ada Okafor", {
  wins: 3,
  losses: 1,
  played: 4,
  analyzed: 3,
  measures: measures(58),
});
const BEA = faced("p-bea", "Bea Lindqvist", {
  wins: 0,
  losses: 1,
  played: 1,
  analyzed: 0,
  measures: measures(null),
});

const OPPONENT = {
  wins: 3,
  losses: 2,
  played: 5,
  analyzed: 3,
  recent: [recent("m-p-ada", "p-ada"), recent("m-p-bea", "p-bea")],
  measures: measures(54),
  facedBy: [ADA, BEA],
};

test.describe("which scope the drawer reads", () => {
  test("All is the team's record, recent list and measures", () => {
    const scope = opponentScope(OPPONENT, null);
    expect(scope.playerId).toBeNull();
    expect(scope.firstName).toBeNull();
    expect(recordLabel(scope)).toBe("3-2");
    expect(scope.played).toBe(5);
    expect(scope.recent).toBe(OPPONENT.recent);
    expect(scope.measures).toBe(OPPONENT.measures);
  });

  test("a roster player narrows to that entry's own figures", () => {
    const scope = opponentScope(OPPONENT, "p-ada");
    expect(scope.playerId).toBe("p-ada");
    expect(scope.firstName).toBe("Ada");
    expect(recordLabel(scope)).toBe("3-1");
    expect(scope.played).toBe(4);
    expect(scope.recent).toBe(ADA.recent);
    expect(scope.measures).toBe(ADA.measures);
  });

  test("an id that names nobody who faced them falls back to All", () => {
    const scope = opponentScope(OPPONENT, "p-from-the-last-opponent");
    expect(scope.playerId).toBeNull();
    expect(scope.firstName).toBeNull();
    expect(scope.measures).toBe(OPPONENT.measures);
  });
});

test.describe("the stat block's gate", () => {
  test("present when any of the four measures has a value", () => {
    const mixed = measures(null);
    mixed[2] = { ...mixed[2], value: 41 };
    expect(scopeHasStats({ measures: mixed })).toBe(true);
  });

  test("absent when the chosen scope's four are all null — even if the team's are not", () => {
    expect(scopeHasStats(opponentScope(OPPONENT, null))).toBe(true);
    expect(scopeHasStats(opponentScope(OPPONENT, "p-bea"))).toBe(false);
  });
});

test.describe("the sentences that name the scope", () => {
  const all = opponentScope(OPPONENT, null);
  const ada = opponentScope(OPPONENT, "p-ada");

  test("the stat header", () => {
    expect(scopeStatLabel("Total points won", all)).toBe("Total points won");
    expect(scopeStatLabel("Total points won", ada)).toBe(
      "Total points won · Ada",
    );
  });

  test("the recent-matches eyebrow", () => {
    expect(scopeRecentLabel(all)).toBe("Recent matches");
    expect(scopeRecentLabel(ada)).toBe("Recent matches · Ada");
  });

  test("the placeholder says whose numbers are missing", () => {
    expect(scopePlaceholder(all, "Marit")).toBe(
      "The team’s numbers against Marit appear here once a match against them is analyzed.",
    );
    expect(scopePlaceholder(ada, "Marit")).toBe(
      "Ada’s numbers against Marit appear here once one of Ada’s matches against them is analyzed.",
    );
  });
});

test.describe("chips or the menu", () => {
  test("chips up to four players, the menu from five", () => {
    expect(FACED_BY_CHIP_LIMIT).toBe(4);
    expect(facedByControl(0)).toBe("chips");
    expect(facedByControl(1)).toBe("chips");
    expect(facedByControl(4)).toBe("chips");
    expect(facedByControl(5)).toBe("menu");
    expect(facedByControl(12)).toBe("menu");
  });
});

test.describe("where the opponent plays", () => {
  const program = {
    id: "prog",
    schoolName: "State University",
    shortCode: "STU",
    crestUrl: null,
    conference: "Big Sky",
    division: "Division I",
  };

  test("a directory program carries its crest inputs and division · conference", () => {
    expect(opponentTeamLine({ program, school: null })).toEqual({
      kind: "program",
      name: "State University",
      shortCode: "STU",
      crestUrl: null,
      detail: "Division I · Big Sky",
    });
  });

  test("either half of the detail stands alone, and neither is no line", () => {
    expect(
      opponentTeamLine({
        program: { ...program, division: null },
        school: null,
      }),
    ).toMatchObject({ detail: "Big Sky" });
    expect(
      opponentTeamLine({
        program: { ...program, conference: null, division: " " },
        school: null,
      }),
    ).toMatchObject({ detail: null });
  });

  test("a typed school with no directory program is a team, not No team", () => {
    expect(
      opponentTeamLine({ program: null, school: "Harbor Tennis Club" }),
    ).toEqual({ kind: "school", name: "Harbor Tennis Club" });
  });

  test("neither is No team", () => {
    expect(opponentTeamLine({ program: null, school: null })).toEqual({
      kind: "none",
    });
  });
});

test.describe("what both drawers share", () => {
  const nav = [
    { href: "/stats", comingSoon: true as const },
    { href: "/ask", comingSoon: true as const },
    { href: "/matches" },
  ];

  test("isLive reads the list it is given; an unlisted route is live", () => {
    expect(isLive(nav, "/stats")).toBe(false);
    expect(isLive(nav, "/matches")).toBe(true);
    expect(isLive(nav, "/nowhere")).toBe(true);
  });

  test("with Statistics and Ask both stubs the footer is one primary to Matches", () => {
    expect(
      opponentDrawerFooter({
        nav,
        statisticsHref: "/stats",
        askHref: "/ask",
        name: "Marit Solberg",
      }),
    ).toEqual({
      ghost: null,
      primary: {
        href: "/dashboard/matches?q=Marit%20Solberg",
        label: "View matches vs. Marit",
      },
    });
  });

  test("each link returns the day its nav flag is lifted", () => {
    expect(
      opponentDrawerFooter({
        nav: [{ href: "/stats" }, { href: "/ask" }],
        statisticsHref: "/stats",
        askHref: "/ask",
        name: "Marit Solberg",
      }),
    ).toEqual({
      ghost: { href: "/ask", label: "Ask about Marit" },
      primary: { href: "/stats", label: "Open statistics vs. Marit" },
    });
  });

  test("a nameless group is addressed as this opponent and searches nothing", () => {
    expect(opponentFirstName(UNKNOWN_OPPONENT_NAME)).toBe("this opponent");
    expect(opponentMatchesHref(UNKNOWN_OPPONENT_NAME)).toBe(
      "/dashboard/matches",
    );
    expect(opponentFirstName("Solberg, Marit")).toBe("Solberg");
  });

  test("the recent row's date drops the day once it is not this year", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(rowDate("2026-09-14T12:00:00", now)).toBe("Sep 14");
    expect(rowDate("2025-09-14T12:00:00", now)).toBe("Sep ’25");
    expect(rowDate("not a date", now)).toBe("not a date");
  });

  test("the recent row's date is the match's stored day, at either edge of it", () => {
    // `matches.date` holds a calendar day in its UTC date part
    // (`match-day.ts`). Read as an instant in the viewer's zone, a match
    // stored at 00:00Z was the 13th in the Americas and one stored at 23:59Z
    // the 15th in Asia; `tests/match-day.spec.ts` runs that under real zones.
    const now = new Date("2026-10-12T12:00:00Z");
    expect(rowDate("2026-09-14T00:00:00+00:00", now)).toBe("Sep 14");
    expect(rowDate("2026-09-14T23:59:00+00:00", now)).toBe("Sep 14");
    expect(rowDate("2025-12-31T23:59:00+00:00", now)).toBe("Dec ’25");
    expect(rowDate("2026-01-01T00:00:00+00:00", now)).toBe("Jan 1");
  });
});

test("the face row is the recent row plus one 18px track after the mark", () => {
  expect(RECENT_MATCH_GRID_WITH_FACE).toBe(
    "grid-cols-[14px_18px_minmax(0,1fr)_minmax(72px,max-content)_40px_12px]",
  );
});
