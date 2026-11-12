import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * T18 — the shared report (`/m/[token]`) for a practice session, offline.
 *
 * `getSharedMatchData` runs for real against a fake service-role client
 * (`lazyAdminClient` stubbed), so `match.opponentIsTeammate` is the shared
 * loader's own answer: the rule from `match-detail-server.ts`, oriented by
 * the sharer through `transformDbMatchToMatch`. The scoreboard's Teammate
 * pill and the Statistics view's two-name notice read only that flag, and
 * `match-report-practice.spec.ts` already pins how they draw it.
 */

const PROGRAM = "prog-1";
const SUBJECT = "pp-revelli"; // program_players id, seat one
const TEAMMATE = "pp-stepanov"; // program_players id, seat two
const UNSEATED_TEAMMATE = "pp-okafor"; // on the roster, never seated
const COACH = "user-coach"; // the sharer

type Row = Record<string, unknown>;

const BASE_ROW: Row = {
  id: "m-1",
  program_id: PROGRAM,
  created_by: COACH,
  player1_id: SUBJECT,
  player2_id: null,
  player1_name: "Mia Revelli",
  player2_name: "Ana Stepanov",
  tournament_name: null,
  round: null,
  date: "2026-11-02T00:00:00+00:00",
  score: { player1: [6, 6], player2: [4, 3] },
  result: null,
  match_type: "Practice",
  opponent_player_id: null,
  court_type: "Hard",
  event_entry_id: null,
  verified: false,
  verified_at: null,
  errors_judged_at: null,
  duration: 3_600_000,
  source_provider: "swingvision",
  player_hand: null,
  player_backhand: null,
  opponent_hand: null,
  opponent_backhand: null,
  key_moments: null,
  insights: null,
  program: null,
  opponent_program: null,
};

const ROSTER: Row[] = [
  { id: SUBJECT, program_id: PROGRAM, claimed_by_user_id: null },
  { id: TEAMMATE, program_id: PROGRAM, claimed_by_user_id: null },
  { id: UNSEATED_TEAMMATE, program_id: PROGRAM, claimed_by_user_id: null },
];

/** Every `program_players` read the shared loader makes, by filter. */
let rosterReads: string[][] = [];

/**
 * A chainable stand-in for the Supabase query builder, as in
 * `match-report-practice.spec.ts`: filters narrow `tables`, awaiting the
 * builder (or `.maybeSingle()`) answers.
 */
function fakeAdmin(row: Row, token: string) {
  const tables: Record<string, Row[]> = {
    match_share_links: [
      {
        token,
        match_id: row.id,
        created_by: COACH,
        created_at: "2026-11-03T12:00:00Z",
        include_visualizations: false,
        include_video: false,
        video_shared_by: null,
      },
    ],
    matches: [row],
    program_players: ROSTER,
    users: [],
  };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const filters: string[] = [];
    if (table === "program_players") rosterReads.push(filters);
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      is: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push(`eq:${col}`);
        rows = rows.filter((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        filters.push(`in:${col}`);
        rows = rows.filter((r) => values.includes(r[col]));
        return builder;
      },
      single: async () =>
        rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { code: "PGRST116" } },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    from,
    rpc: async () => ({ data: [], error: null }),
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }),
    },
  };
}

let currentAdmin: ReturnType<typeof fakeAdmin> | null = null;

const loader = createLoader({
  stubs: {
    "@/lib/supabase/server": { createClient: async () => null },
    "@/lib/supabase/admin": {
      createAdminClient: () => currentAdmin,
      lazyAdminClient: () => currentAdmin,
    },
    "@/lib/data/match-stats-server": {
      getMatchStatisticsFromSupabase: async () => null,
      getMatchKpiHistory: async () => null,
    },
    "@/lib/data/match-points-server": {
      getMatchPointsFromSupabase: async () => [],
    },
    "@/lib/data/player-identity-server": {
      getMyPlayerIds: async () => [],
      isMe: () => false,
    },
    "@/lib/data/teams-server": { PROGRAM_CRESTS_BUCKET: "crests" },
    "@/components/dashboard/matches/match-detail/use-match-sides": {
      getMatchSides: () => ({
        pick: () => null,
        you: { name: "" },
        opp: { name: "" },
      }),
    },
    "@/lib/data/member-avatars-server": {
      getMemberAvatarUrls: async () => ({}),
    },
    "@/lib/workspace/active-workspace-server": {
      getWorkspaceContext: async () => null,
    },
    "@/lib/data/match-analysis-server": {
      analysisFor: () => ({ status: "complete" }),
      loadMatchAnalysis: async () => new Map(),
    },
    "@/lib/data/match-analysis": {
      matchPageKind: () => "report",
      withStatsPublished: (status: unknown) => status,
    },
  },
});

const { getSharedMatchData } = loader.load(
  "src/lib/data/match-share-server.ts",
) as {
  getSharedMatchData: (
    token: string,
  ) => Promise<{ match: Record<string, unknown> } | null>;
};

let tokenSeq = 0;
async function loadShared(row: Row) {
  const token = `tok-${++tokenSeq}`;
  currentAdmin = fakeAdmin(row, token);
  rosterReads = [];
  const data = await getSharedMatchData(token);
  if (!data) throw new Error("fixture did not load");
  return data.match;
}

test.describe("getSharedMatchData's teammate fact", () => {
  test("a teammate practice: opponentIsTeammate, oriented by the sharer", async () => {
    const match = await loadShared({
      ...BASE_ROW,
      player2_id: TEAMMATE,
      opponent_player_id: TEAMMATE,
    });
    expect(match.isPractice).toBe(true);
    expect(match.opponentIsTeammate).toBe(true);
    // The coach sharing it is on neither seat: `youSeat` falls to seat one.
    expect(match.isUserPlayer1).toBe(true);
  });

  test("a teammate named only by opponent_player_id is found by the extra roster read", async () => {
    const match = await loadShared({
      ...BASE_ROW,
      player2_name: "Ife Okafor",
      opponent_player_id: UNSEATED_TEAMMATE,
    });
    expect(match.opponentIsTeammate).toBe(true);
    // The one existence read: program_id + id, alongside the seat read.
    expect(rosterReads).toContainEqual(["eq:program_id", "eq:id"]);
  });

  test("a practice against a non-roster opponent: false", async () => {
    const match = await loadShared({
      ...BASE_ROW,
      player2_name: "Jo Rival",
      opponent_player_id: "pp-rival-elsewhere",
    });
    expect(match.isPractice).toBe(true);
    expect(match.opponentIsTeammate).toBe(false);
  });

  test("a personal match: false, and no roster existence read", async () => {
    const match = await loadShared({
      ...BASE_ROW,
      program_id: null,
      created_by: COACH,
      player1_id: COACH,
      player2_id: TEAMMATE,
      opponent_player_id: TEAMMATE,
      match_type: "Tournament",
    });
    expect(match.isPractice).toBe(false);
    expect(match.opponentIsTeammate).toBe(false);
    expect(rosterReads).not.toContainEqual(["eq:program_id", "eq:id"]);
  });

  test("the rule is the detail loader's, read inside the one Promise.all", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/data/match-share-server.ts"),
      "utf8",
    );
    const all = src.lastIndexOf("await Promise.all([");
    const read = src.indexOf("resolveOpponentPlayerOnRoster(admin, dbRow)");
    const end = src.indexOf("]);", all);
    expect(all).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(all);
    expect(read).toBeLessThan(end);
    expect(src).toMatch(
      /match\.opponentIsTeammate = opponentIsTeammate\(\s*dbRow,\s*match\.isUserPlayer1,\s*rosterIds,\s*opponentPlayerOnRoster,\s*\)/,
    );
  });
});
