import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPersonalOpponents,
  loadTeamOpponents,
} from "@/lib/data/opponents-load";
import {
  headToHeadRows,
  opponentPlayerMatches,
} from "@/lib/data/opponents-server";
import { PERSONAL_OPPONENT_MEASURE_KEYS } from "@/lib/data/personal-opponents";
import {
  groupTeamOpponents,
  type TeamOpponentMatchInput,
  type TeamOpponentRosterPlayer,
} from "@/lib/data/team-opponents";
import { createMcpUserReads } from "@/lib/services/mcp/user-reads";

/**
 * Practice and teammates never reach either Opponents page (product decision:
 * practice never counts toward win–loss or head-to-head, and a teammate is
 * never an "opponent").
 *
 * Offline: the loaders run against a fake client that serves fixture rows, so
 * what is pinned is the real read path — the column list, the filter before
 * the statistics read, and the grouping. Every practice fixture is a WIN dated
 * after every competitive match, with statistics far from every competitive
 * figure, so a leak would move the record, the last match and the measures.
 * The MCP `opponent_scouting` tool reads through the same two loaders
 * (`createMcpUserReads`), so it is run here too, unchanged.
 */

const VIEWER = "viewer";
const PROGRAM = "program-1";
const NOW = new Date("2026-11-10T12:00:00.000Z");

const WON = { player1: [6, 6], player2: [3, 4] };
const LOST = { player1: [2, 3], player2: [6, 6] };

type Row = Record<string, unknown>;

function statRow(matchId: string, level: number): Row {
  return {
    match_id: matchId,
    is_player1: true,
    ...Object.fromEntries(
      PERSONAL_OPPONENT_MEASURE_KEYS.map((k) => [k, level]),
    ),
  };
}

/**
 * Serves `matches` and the stats view from fixtures, answers the two RPCs, and
 * records which match ids the statistics read asked for.
 */
function fakeClient(
  matches: Row[],
  stats: Row[],
  roster: Row[] = [],
): { client: SupabaseClient; statsAsked: unknown[][]; selected: string[] } {
  const statsAsked: unknown[][] = [];
  const selected: string[] = [];
  function from(table: string) {
    let rows: Row[] =
      table === "matches"
        ? matches
        : table === "match_stats_with_percentages"
          ? stats
          : [];
    const builder = {
      select(columns: string) {
        if (table === "matches") selected.push(columns);
        return builder;
      },
      eq: () => builder,
      is: () => builder,
      order: () => builder,
      in(column: string, values: unknown[]) {
        if (table === "match_stats_with_percentages") statsAsked.push(values);
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      then<R>(resolve: (value: { data: Row[]; error: null }) => R) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  }
  function rpc(name: string) {
    const data =
      name === "my_player_ids"
        ? [VIEWER]
        : name === "program_roster_full"
          ? roster
          : [];
    return Promise.resolve({ data, error: null });
  }
  const storage = {
    from: () => ({
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://example.test/${path}` },
      }),
    }),
  };
  return {
    client: { from, rpc, storage } as unknown as SupabaseClient,
    statsAsked,
    selected,
  };
}

// ── Personal ────────────────────────────────────────────────────────────────

function personalMatch(
  id: string,
  date: string,
  opponent: string,
  score: typeof WON,
  matchType: string | null,
): Row {
  return {
    id,
    date: `${date}T00:00:00.000Z`,
    player1_id: VIEWER,
    player2_id: null,
    player1_name: "Me",
    player2_name: opponent,
    created_by: VIEWER,
    tournament_name: null,
    score,
    opponent_player_id: null,
    opponent_hand: null,
    opponent_backhand: null,
    match_type: matchType,
  };
}

const PERSONAL_COMPETITIVE = [
  personalMatch("c1", "2026-09-01", "Ana Castillo", WON, "Tournament"),
  personalMatch("c2", "2026-09-15", "Ana Castillo", LOST, null),
  personalMatch("c3", "2026-10-01", "Ana Castillo", WON, "Singles"),
  personalMatch("c4", "2026-10-05", "Bo Reyes", LOST, "Dual Match"),
];
const PERSONAL_PRACTICE = [
  // Against a listed opponent, newest of all.
  personalMatch("p1", "2026-11-01", "Ana Castillo", WON, "Practice"),
  // Against somebody met only in practice, any casing.
  personalMatch("p2", "2026-11-02", "Cal Hitting-Partner", WON, " practice "),
];
const PERSONAL_STATS = [
  ...PERSONAL_COMPETITIVE.map((m) => statRow(m.id as string, 50)),
  ...PERSONAL_PRACTICE.map((m) => statRow(m.id as string, 99)),
];

test.describe("loadPersonalOpponents", () => {
  test("an added practice match changes no opponent's matches, wins or losses", async () => {
    const without = await loadPersonalOpponents(
      fakeClient(PERSONAL_COMPETITIVE, PERSONAL_STATS).client,
      VIEWER,
      [VIEWER],
      NOW,
    );
    const withPractice = await loadPersonalOpponents(
      fakeClient(
        [...PERSONAL_PRACTICE, ...PERSONAL_COMPETITIVE],
        PERSONAL_STATS,
      ).client,
      VIEWER,
      [VIEWER],
      NOW,
    );

    const ana = withPractice.opponents.find((o) => o.name === "Ana Castillo");
    expect(ana).toMatchObject({ played: 3, wins: 2, losses: 1 });
    // The whole page — records, last match, form, measures, totals — is the
    // same with the practice rows as without them.
    expect(withPractice).toEqual(without);
  });

  test("an opponent met only in practice is not listed", async () => {
    const { opponents, totals } = await loadPersonalOpponents(
      fakeClient(
        [...PERSONAL_PRACTICE, ...PERSONAL_COMPETITIVE],
        PERSONAL_STATS,
      ).client,
      VIEWER,
      [VIEWER],
      NOW,
    );
    expect(opponents.map((o) => o.name).sort()).toEqual([
      "Ana Castillo",
      "Bo Reyes",
    ]);
    expect(totals.opponents).toBe(2);
    expect(totals.matches).toBe(4);
  });

  test("practice is dropped before the statistics read, and the read selects match_type", async () => {
    const fake = fakeClient(
      [...PERSONAL_PRACTICE, ...PERSONAL_COMPETITIVE],
      PERSONAL_STATS,
    );
    await loadPersonalOpponents(fake.client, VIEWER, [VIEWER], NOW);
    expect(fake.selected[0]).toContain("match_type");
    expect(fake.statsAsked).toEqual([["c1", "c2", "c3", "c4"]]);
  });

  test("a practice-only history reads as no opponents", async () => {
    const { opponents, totals } = await loadPersonalOpponents(
      fakeClient(PERSONAL_PRACTICE, PERSONAL_STATS).client,
      VIEWER,
      [VIEWER],
      NOW,
    );
    expect(opponents).toEqual([]);
    expect(totals.matches).toBe(0);
  });
});

// ── Team ────────────────────────────────────────────────────────────────────

const ROSTER_ROWS: Row[] = [
  // A claimed player: their profile id, and their login on older rows.
  {
    player_id: "pp-ada",
    user_id: "u-ada",
    display_name: "Ada Okafor",
    email: null,
    role: "player",
    lineup_spot: 1,
  },
  {
    player_id: "pp-bea",
    user_id: null,
    display_name: "Bea Lindqvist",
    email: null,
    role: "player",
    lineup_spot: 2,
  },
  // The safety arm: a seat-holding player with no profile row, keyed by login.
  {
    player_id: "u-cy",
    user_id: "u-cy",
    display_name: "Cy Abara",
    email: null,
    role: "player",
    lineup_spot: null,
  },
  {
    player_id: "u-coach",
    user_id: "u-coach",
    display_name: "Coach",
    email: null,
    role: "coach",
    lineup_spot: null,
  },
];

function teamMatch(
  id: string,
  date: string,
  opponent: string,
  score: typeof WON,
  matchType: string | null,
  extra: Row = {},
): Row {
  return {
    id,
    date: `${date}T00:00:00.000Z`,
    player1_id: "pp-ada",
    player2_id: null,
    player1_name: "Ada Okafor",
    player2_name: opponent,
    created_by: "u-coach",
    tournament_name: null,
    score,
    opponent_player_id: null,
    opponent_hand: null,
    opponent_backhand: null,
    match_type: matchType,
    opponent_program_id: null,
    opponent_school: null,
    opponent_unattached: false,
    opponent_program: null,
    ...extra,
  };
}

const TEAM_COMPETITIVE = [
  teamMatch("t1", "2026-09-01", "Ana Castillo", WON, "Dual Match"),
  teamMatch("t2", "2026-09-20", "Ana Castillo", LOST, "Tournament", {
    player1_id: "pp-bea",
    player1_name: "Bea Lindqvist",
  }),
  teamMatch("t3", "2026-10-01", "Dee Moss", WON, null),
];
const TEAM_PRACTICE = [
  teamMatch("tp1", "2026-11-01", "Ana Castillo", WON, "Practice"),
  teamMatch("tp2", "2026-11-02", "Eli Practice-Only", WON, "PRACTICE"),
];
// Intra-squad rows typed as anything but Practice, each naming a teammate a
// different way. None may form an opponent row.
const TEAM_TEAMMATES = [
  // T5's write: their profile id in both columns.
  teamMatch("tm1", "2026-10-10", "Bea Lindqvist", WON, "Dual Match", {
    player2_id: "pp-bea",
    opponent_player_id: "pp-bea",
  }),
  // A roster member with no profile: the seat only.
  teamMatch("tm2", "2026-10-11", "Cy Abara", LOST, "Tournament", {
    player2_id: "u-cy",
  }),
  // A claimed player's login in seat two, from player one = Bea.
  teamMatch("tm3", "2026-10-12", "Ada Okafor", WON, null, {
    player1_id: "pp-bea",
    player1_name: "Bea Lindqvist",
    player2_id: "u-ada",
  }),
  // A teammate by opponent id alone.
  teamMatch("tm4", "2026-10-13", "Bea L.", WON, "Singles", {
    opponent_player_id: "pp-bea",
  }),
];
const TEAM_ROWS = [...TEAM_PRACTICE, ...TEAM_TEAMMATES, ...TEAM_COMPETITIVE];
const TEAM_STATS = TEAM_ROWS.map((m) =>
  statRow(m.id as string, TEAM_COMPETITIVE.includes(m) ? 50 : 99),
);

test.describe("loadTeamOpponents", () => {
  test("practice and teammates change nothing: the page equals the competitive one", async () => {
    const without = await loadTeamOpponents(
      fakeClient(TEAM_COMPETITIVE, TEAM_STATS, ROSTER_ROWS).client,
      PROGRAM,
      "u-coach",
      new Map(),
      NOW,
    );
    const withAll = await loadTeamOpponents(
      fakeClient(TEAM_ROWS, TEAM_STATS, ROSTER_ROWS).client,
      PROGRAM,
      "u-coach",
      new Map(),
      NOW,
    );

    const ana = withAll.opponents.find((o) => o.name === "Ana Castillo");
    expect(ana).toMatchObject({ played: 2, wins: 1, losses: 1 });
    expect(ana?.matchIds).toEqual(["t2", "t1"]);
    expect(withAll).toEqual(without);
  });

  test("lists no practice-only opponent and no teammate, and counts neither as unattributed", async () => {
    const { opponents, totals } = await loadTeamOpponents(
      fakeClient(TEAM_ROWS, TEAM_STATS, ROSTER_ROWS).client,
      PROGRAM,
      "u-coach",
      new Map(),
      NOW,
    );
    expect(opponents.map((o) => o.name).sort()).toEqual([
      "Ana Castillo",
      "Dee Moss",
    ]);
    expect(totals).toMatchObject({ opponents: 2, matches: 3, unattributed: 0 });
  });

  test("practice is dropped before the statistics read", async () => {
    const fake = fakeClient(TEAM_ROWS, TEAM_STATS, ROSTER_ROWS);
    await loadTeamOpponents(fake.client, PROGRAM, "u-coach", new Map(), NOW);
    expect(fake.selected[0]).toContain("match_type");
    expect(fake.statsAsked[0]).not.toContain("tp1");
    expect(fake.statsAsked[0]).not.toContain("tp2");
  });
});

test.describe("groupTeamOpponents", () => {
  const ROSTER: TeamOpponentRosterPlayer[] = [
    { playerId: "pp-ada", userId: "u-ada", name: "Ada Okafor", photoUrl: null },
    { playerId: "pp-bea", userId: null, name: "Bea Lindqvist", photoUrl: null },
  ];
  const base: TeamOpponentMatchInput = {
    id: "x",
    date: "2026-10-01",
    player1_id: "pp-ada",
    player1_name: "Ada Okafor",
    player2_name: "Bea Lindqvist",
    created_by: "u-coach",
    opponent_player_id: null,
    opponent_hand: null,
    opponent_backhand: null,
    tournament_name: null,
    score: WON,
    values: null,
    opponent_program: null,
    opponent_school: null,
  };

  test("a roster id in seat two or as the opponent forms no group, whatever the type", () => {
    const { opponents, totals } = groupTeamOpponents(
      [
        { ...base, id: "a", player2_id: "pp-bea" },
        { ...base, id: "b", opponent_player_id: "pp-bea" },
        { ...base, id: "c", player1_id: "pp-bea", player2_id: "u-ada" },
      ],
      ROSTER,
      "2026–27",
    );
    expect(opponents).toEqual([]);
    expect(totals.unattributed).toBe(0);
  });

  test("an outside opponent's id is not mistaken for a teammate", () => {
    const { opponents } = groupTeamOpponents(
      [
        {
          ...base,
          player2_name: "Ana Castillo",
          opponent_player_id: "pp-elsewhere",
        },
      ],
      ROSTER,
      "2026–27",
    );
    expect(opponents).toHaveLength(1);
  });
});

// ── Head to head ────────────────────────────────────────────────────────────

test.describe("opponents-server head-to-head", () => {
  const roster = [{ id: "pp-them", name: "Ana Castillo" }];
  const rows = [
    {
      id: "h1",
      player2_name: "Ana Castillo",
      opponent_player_id: null,
      match_type: "Dual Match",
    },
    {
      id: "h2",
      player2_name: "Ana Castillo",
      opponent_player_id: "pp-them",
      match_type: null,
    },
    {
      id: "h3",
      player2_name: "Ana Castillo",
      opponent_player_id: null,
      match_type: "Practice",
    },
    {
      id: "h4",
      player2_name: "Someone",
      opponent_player_id: "pp-them",
      match_type: "practice",
    },
  ];

  test("headToHeadRows counts no practice row, by id or by name", () => {
    expect(headToHeadRows(rows, roster).map((m) => m.id)).toEqual(["h1", "h2"]);
  });

  test("opponentPlayerMatches feeds the profile no practice row", () => {
    expect(
      opponentPlayerMatches(rows, "pp-them", "Ana Castillo").map((m) => m.id),
    ).toEqual(["h1", "h2"]);
  });
});

// ── MCP opponent_scouting ───────────────────────────────────────────────────

test.describe("MCP opponent reads", () => {
  test("personalOpponents returns the same exclusions as the page", async () => {
    const reads = createMcpUserReads(
      fakeClient(
        [...PERSONAL_PRACTICE, ...PERSONAL_COMPETITIVE],
        PERSONAL_STATS,
      ).client,
      VIEWER,
    );
    const { opponents } = await reads.personalOpponents();
    expect(opponents.map((o) => o.name).sort()).toEqual([
      "Ana Castillo",
      "Bo Reyes",
    ]);
    expect(opponents.find((o) => o.name === "Ana Castillo")).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
    });
  });

  test("teamOpponents returns the same exclusions as the page", async () => {
    const reads = createMcpUserReads(
      fakeClient(TEAM_ROWS, TEAM_STATS, ROSTER_ROWS).client,
      "u-coach",
    );
    const { opponents, totals } = await reads.teamOpponents(PROGRAM);
    expect(opponents.map((o) => o.name).sort()).toEqual([
      "Ana Castillo",
      "Dee Moss",
    ]);
    expect(totals).toMatchObject({ matches: 3, unattributed: 0 });
  });
});
