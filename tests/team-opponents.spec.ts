import { expect, test } from "@playwright/test";

import {
  groupTeamOpponents,
  type TeamOpponentMatchInput,
  type TeamOpponentProgram,
  type TeamOpponentRosterPlayer,
} from "@/lib/data/team-opponents";

/**
 * The team Opponents page's grouping, with no database behind it.
 *
 * Imports the pure module only. What these pin is what a team adds to the
 * personal grouping and can get wrong silently: a roster player's record that
 * does not add up to the row's, an old typed school outliving the program
 * somebody later picked, a match credited to nobody being counted as played,
 * and an edit affordance on a match the viewer did not record.
 */

const SEASON = "2026–27";

const WON = { player1: [6, 6], player2: [3, 4] };
const LOST = { player1: [4, 2], player2: [6, 6] };

const ROSTER: TeamOpponentRosterPlayer[] = [
  { playerId: "p-ada", userId: "u-ada", name: "Ada Okafor", photoUrl: "a.png" },
  { playerId: "p-bea", userId: null, name: "Bea Lindqvist", photoUrl: null },
  { playerId: "p-cy", userId: null, name: "Cy Abara", photoUrl: null },
];

const STATE: TeamOpponentProgram = {
  id: "prog-state",
  schoolName: "State University",
  shortCode: "STU",
  crestUrl: "https://example.test/state.png",
  conference: "Big Sky",
  division: "D1",
};

let nextId = 0;

function match(
  overrides: Partial<TeamOpponentMatchInput> = {},
): TeamOpponentMatchInput {
  nextId += 1;
  return {
    id: `m${nextId}`,
    date: "2026-09-01",
    player1_id: "p-ada",
    player1_name: "Ada Okafor",
    player2_name: "Ana Castillo",
    created_by: "coach",
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

test.describe("who on the roster faced them", () => {
  test("two roster players against one opponent are one row with two entries that sum to it", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ player1_id: "p-ada", date: "2026-09-10", score: WON }),
        match({ player1_id: "p-ada", date: "2026-09-03", score: LOST }),
        match({
          player1_id: "p-bea",
          date: "2026-09-05",
          score: WON,
          player2_name: "  ana   CASTILLO ",
          values: { total_points_won_pct: 55 },
        }),
      ],
      ROSTER,
      SEASON,
    );

    expect(opponents).toHaveLength(1);
    const [row] = opponents;
    expect(row.key).toBe("name:ana castillo");
    expect(row.facedBy.map((f) => f.playerId)).toEqual(["p-ada", "p-bea"]);

    const sum = (pick: (f: (typeof row.facedBy)[number]) => number) =>
      row.facedBy.reduce((total, f) => total + pick(f), 0);
    expect(sum((f) => f.played)).toBe(row.played);
    expect(sum((f) => f.wins)).toBe(row.wins);
    expect(sum((f) => f.losses)).toBe(row.losses);
    expect(sum((f) => f.analyzed)).toBe(row.analyzed);
    expect([row.played, row.wins, row.losses, row.analyzed]).toEqual([
      3, 2, 1, 1,
    ]);

    const [ada, bea] = row.facedBy;
    expect(ada).toMatchObject({
      name: "Ada Okafor",
      firstName: "Ada",
      photoUrl: "a.png",
      wins: 1,
      losses: 1,
      played: 2,
      form: ["loss", "win"],
    });
    expect(bea).toMatchObject({ firstName: "Bea", photoUrl: null, wins: 1 });
    expect(bea.measures.map((m) => m.value)).toEqual([55, null, null, null]);
    expect(bea.recent.every((r) => r.rosterPlayerId === "p-bea")).toBe(true);
  });

  test("the row's recent matches say which roster player played each", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ id: "new", player1_id: "p-bea", date: "2026-09-10" }),
        match({ id: "old", player1_id: "p-ada", date: "2026-09-01" }),
      ],
      ROSTER,
      SEASON,
    );

    expect(opponents[0].recent.map((r) => [r.id, r.rosterPlayerId])).toEqual([
      ["new", "p-bea"],
      ["old", "p-ada"],
    ]);
    expect(opponents[0].matchIds).toEqual(["new", "old"]);
  });

  test("entries are ordered by most matches, then name", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ player1_id: "p-cy" }),
        match({ player1_id: "p-bea" }),
        match({ player1_id: "p-ada" }),
        match({ player1_id: "p-bea" }),
      ],
      ROSTER,
      SEASON,
    );

    expect(opponents[0].facedBy.map((f) => f.name)).toEqual([
      "Bea Lindqvist",
      "Ada Okafor",
      "Cy Abara",
    ]);
  });

  test("a claimed player's older rows, recorded under their login, are theirs", () => {
    const { opponents, totals } = groupTeamOpponents(
      [
        match({ player1_id: "u-ada", date: "2025-03-01" }),
        match({ player1_id: "p-ada", date: "2026-09-01" }),
      ],
      ROSTER,
      SEASON,
    );

    expect(totals.unattributed).toBe(0);
    expect(opponents[0].facedBy).toHaveLength(1);
    expect(opponents[0].facedBy[0]).toMatchObject({
      playerId: "p-ada",
      played: 2,
    });
  });
});

test.describe("where the opponent plays", () => {
  test("a program on the latest match wins over an older typed school", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ date: "2026-09-10", opponent_program: STATE }),
        match({ date: "2026-08-20", opponent_school: "State Univ." }),
      ],
      ROSTER,
      SEASON,
    );

    expect(opponents[0].program).toEqual(STATE);
    expect(opponents[0].school).toBeNull();
  });

  test("a program outranks a typed school even when the school is newer", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ date: "2026-09-10", opponent_school: "State Univ." }),
        match({ date: "2026-08-20", opponent_program: STATE }),
      ],
      ROSTER,
      SEASON,
    );

    expect(opponents[0].program?.id).toBe("prog-state");
    expect(opponents[0].school).toBeNull();
  });

  test("unattached only when no match names a program or school", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ date: "2026-09-10", opponent_unattached: true }),
        match({ date: "2026-08-20" }),
      ],
      ROSTER,
      SEASON,
    );
    expect(opponents[0].unattached).toBe(true);

    const named = groupTeamOpponents(
      [
        match({ date: "2026-09-10", opponent_unattached: true }),
        match({ date: "2026-08-20", opponent_school: "State Univ." }),
      ],
      ROSTER,
      SEASON,
    ).opponents[0];
    expect(named.school).toBe("State Univ.");
    expect(named.unattached).toBe(false);
  });

  test("with no program, the most recent typed school; with neither, null", () => {
    const { opponents } = groupTeamOpponents(
      [
        match({ date: "2026-09-10" }),
        match({ date: "2026-09-05", opponent_school: "  Tech   College " }),
        match({ date: "2026-08-01", opponent_school: "Old Tech" }),
        match({ player2_name: "Dee Marsh", date: "2026-07-01" }),
      ],
      ROSTER,
      SEASON,
    );

    const [ana, dee] = opponents;
    expect(ana.program).toBeNull();
    expect(ana.school).toBe("Tech College");
    expect(dee.program).toBeNull();
    expect(dee.school).toBeNull();
  });

  test("totals count each program and each typed school once", () => {
    const { totals } = groupTeamOpponents(
      [
        match({ player2_name: "Ana Castillo", opponent_program: STATE }),
        match({ player2_name: "Bo Reyes", opponent_program: STATE }),
        match({ player2_name: "Cat Lowe", opponent_school: "Tech College" }),
        match({ player2_name: "Dee Marsh", opponent_school: "tech  college" }),
        match({ player2_name: "Eli Stone" }),
      ],
      ROSTER,
      SEASON,
    );

    expect(totals).toEqual({
      opponents: 5,
      programs: 2,
      matches: 5,
      analyzed: 0,
      unattributed: 0,
    });
  });
});

test.describe("a match nobody on the roster played", () => {
  test("an unknown player1_id is excluded and counted", () => {
    const { opponents, totals } = groupTeamOpponents(
      [
        match({ id: "ours", player1_id: "p-ada" }),
        match({ id: "stranger", player1_id: "p-archived" }),
        match({ id: "nobody", player1_id: null }),
      ],
      ROSTER,
      SEASON,
    );

    expect(totals.unattributed).toBe(2);
    expect(totals.matches).toBe(1);
    expect(opponents).toHaveLength(1);
    expect(opponents[0].played).toBe(1);
    expect(opponents[0].matchIds).toEqual(["ours"]);
  });

  test("an opponent met only in unattributed matches is not listed", () => {
    const { opponents, totals } = groupTeamOpponents(
      [match({ player1_id: "p-archived", player2_name: "Dee Marsh" })],
      ROSTER,
      SEASON,
    );

    expect(opponents).toEqual([]);
    expect(totals).toMatchObject({ opponents: 0, matches: 0, unattributed: 1 });
  });
});

test.describe("which matches the viewer may edit", () => {
  const inputs = () => [
    match({ id: "mine-new", date: "2026-09-10", created_by: "viewer" }),
    match({ id: "theirs", date: "2026-09-05", created_by: "coach" }),
    match({ id: "mine-old", date: "2026-09-01", created_by: "viewer" }),
    match({ id: "orphan", date: "2026-08-01", created_by: null }),
  ];

  test("editableMatchIds follows created_by", () => {
    const { opponents } = groupTeamOpponents(
      inputs(),
      ROSTER,
      SEASON,
      "viewer",
    );

    expect(opponents[0].matchIds).toEqual([
      "mine-new",
      "theirs",
      "mine-old",
      "orphan",
    ]);
    expect(opponents[0].editableMatchIds).toEqual(["mine-new", "mine-old"]);
  });

  test("a different viewer gets a different set, and no viewer gets none", () => {
    expect(
      groupTeamOpponents(inputs(), ROSTER, SEASON, "coach").opponents[0]
        .editableMatchIds,
    ).toEqual(["theirs"]);
    expect(
      groupTeamOpponents(inputs(), ROSTER, SEASON).opponents[0]
        .editableMatchIds,
    ).toEqual([]);
  });
});

test("rows sort by last match, newest first", () => {
  const { opponents } = groupTeamOpponents(
    [
      match({ player2_name: "Older One", date: "2026-08-01" }),
      match({ player2_name: "Newer One", date: "2026-09-20" }),
    ],
    ROSTER,
    SEASON,
  );

  expect(opponents.map((o) => o.name)).toEqual(["Newer One", "Older One"]);
});
