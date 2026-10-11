import { expect, test } from "@playwright/test";

import type { DbStatRow } from "@/lib/data/player-profile";
import {
  STATISTIC_GROUPS,
  toStatisticsMatches,
  type StatisticsMatchRow,
} from "@/lib/data/statistics";

/**
 * `toStatisticsMatches` — one entry per measured match, from the viewer's seat.
 *
 * Pure and offline. The failure this guards never looks broken: read the wrong
 * seat's row and every chart on the Statistics page is a real, plausible
 * season — the opponents'.
 */

const ME = "user-me";
const PROFILE = "profile-me";
const MY_IDS = [ME, PROFILE];

function match(overrides: Partial<StatisticsMatchRow>): StatisticsMatchRow {
  return {
    id: "m",
    date: "2026-03-01",
    player1_id: ME,
    player2_id: null,
    player1_name: "Me Myself",
    player2_name: "Olivia Opponent",
    created_by: ME,
    score: null,
    court_type: "hard",
    opponent_hand: "right",
    opponent_backhand: "two-handed",
    source_provider: null,
    ...overrides,
  };
}

function stat(
  matchId: string,
  isPlayer1: boolean,
  columns: Record<string, unknown> = {},
): DbStatRow {
  return {
    match_id: matchId,
    is_player1: isPlayer1,
    break_points_converted: null,
    break_point_opportunities: null,
    service_games: null,
    service_games_won: null,
    return_games: null,
    return_games_won: null,
    winners: null,
    unforced_errors: null,
    ...columns,
  };
}

const KEYS = STATISTIC_GROUPS.flatMap((g) => g.statistics.map((s) => s.key));

test("derives each value as the head-to-head card reads it", () => {
  const [only] = toStatisticsMatches(
    [match({ id: "a" })],
    [
      stat("a", true, {
        aces: 4,
        double_faults: 2,
        first_serve_pct: "61.50",
        first_serve_won_pct: "70.00",
        second_serve_won_pct: "48.25",
        break_points_saved: 3,
        break_points_faced: 4,
        service_games_won_pct: "80.00",
        first_return_won_pct: "33.30",
        second_return_won_pct: 52,
        break_points_converted_pct: "40.00",
        net_points_won: 6,
        net_points_appearances: 8,
        winners: 21,
        unforced_errors: 17,
        total_points_won: 90,
        total_points: 120,
      }),
    ],
    MY_IDS,
    ME,
  );

  expect(only.values).toEqual({
    aces: 4,
    doubleFaults: 2,
    firstServeInPct: 61.5,
    firstServeWinPct: 70,
    secondServeWinPct: 48.25,
    breakpointsSaved: 75,
    serviceGamesWonPct: 80,
    firstReturnWonPct: 33.3,
    secondReturnWonPct: 52,
    breakpointsWonPct: 40,
    returnWinners: null,
    netPointsWonPct: 75,
    winners: 21,
    unforcedErrors: 17,
    // 90 of 120 points — a percentage on this page, not the card's count.
    totalPointsWon: 75,
  });
  expect(Object.keys(only.values).sort()).toEqual([...KEYS].sort());
});

test("keeps an absent statistic null, never zero", () => {
  const [only] = toStatisticsMatches(
    [match({ id: "a" })],
    [
      stat("a", true, {
        aces: null,
        first_serve_pct: null,
        // Nothing faced and nothing attempted is "no figure", not 0%.
        break_points_saved: 0,
        break_points_faced: 0,
        net_points_won: null,
        net_points_appearances: null,
        winners: 0,
      }),
    ],
    MY_IDS,
    ME,
  );

  expect(only.values.aces).toBeNull();
  expect(only.values.doubleFaults).toBeNull();
  expect(only.values.firstServeInPct).toBeNull();
  expect(only.values.breakpointsSaved).toBeNull();
  expect(only.values.netPointsWonPct).toBeNull();
  expect(only.values.totalPointsWon).toBeNull();
  expect(only.values.returnWinners).toBeNull();
  // A published zero is a zero.
  expect(only.values.winners).toBe(0);
});

test("reads total points won as a percentage of the points played", () => {
  const totalPointsWon = (columns: Record<string, unknown>) =>
    toStatisticsMatches(
      [match({ id: "a" })],
      [stat("a", true, columns)],
      MY_IDS,
      ME,
    )[0].values.totalPointsWon;

  expect(totalPointsWon({ total_points_won: 60, total_points: 120 })).toBe(50);
  // No denominator is "no figure" — never the bare count, never 0%.
  expect(totalPointsWon({ total_points_won: 60 })).toBeNull();
  expect(
    totalPointsWon({ total_points_won: 60, total_points: null }),
  ).toBeNull();
  expect(totalPointsWon({ total_points_won: 0, total_points: 0 })).toBeNull();
  expect(totalPointsWon({ total_points: 120 })).toBeNull();
  // A published zero over a real denominator is a real 0%.
  expect(totalPointsWon({ total_points_won: 0, total_points: 120 })).toBe(0);
});

test("reads a seat-two viewer from seat two, and the opponent from seat one", () => {
  const [only] = toStatisticsMatches(
    [
      match({
        id: "a",
        player1_id: "someone-else",
        player2_id: PROFILE,
        player1_name: "Olivia Opponent",
        player2_name: "Me Myself",
        score: { player1: [3, 2], player2: [6, 6] },
      }),
    ],
    [stat("a", true, { aces: 9 }), stat("a", false, { aces: 1 })],
    MY_IDS,
    ME,
  );

  expect(only.isPlayer1).toBe(false);
  expect(only.values.aces).toBe(1);
  expect(only.opponentValues.aces).toBe(9);
  expect(only.opponentName).toBe("Olivia Opponent");
  expect(only.won).toBe(true);
  expect(only.profile.isPlayer1).toBe(false);
  expect(only.profile.won).toBe(true);
  expect(only.profile.stats).not.toBeNull();
});

test("null-fills opponentValues when the other seat has no row", () => {
  const [only] = toStatisticsMatches(
    [match({ id: "a" })],
    [stat("a", true, { aces: 3 })],
    MY_IDS,
    ME,
  );

  expect(only.values.aces).toBe(3);
  for (const key of KEYS) expect(only.opponentValues[key], key).toBeNull();
});

test("drops a match with no own-seat row or an unresolved side", () => {
  const result = toStatisticsMatches(
    [
      match({ id: "measured" }),
      match({ id: "no-rows" }),
      // Only the OPPONENT's row exists: still nothing of the viewer's.
      match({ id: "opponent-only" }),
      // Both ids are set and neither is the viewer's.
      match({ id: "not-mine", player1_id: "x", player2_id: "y" }),
    ],
    [
      stat("measured", true, { aces: 1 }),
      stat("opponent-only", false, { aces: 5 }),
      stat("not-mine", true, { aces: 7 }),
      stat("not-mine", false, { aces: 7 }),
    ],
    MY_IDS,
    ME,
  );

  expect(result.map((m) => m.id)).toEqual(["measured"]);
});

test("orders oldest to newest whatever order it is handed", () => {
  const rows = ["c", "a", "undated", "b"].map((id) => stat(id, true));
  const result = toStatisticsMatches(
    [
      match({ id: "c", date: "2026-05-01" }),
      match({ id: "a", date: "2026-01-15" }),
      match({ id: "undated", date: null }),
      match({ id: "b", date: "2026-03-09" }),
    ],
    rows,
    MY_IDS,
    ME,
  );

  expect(result.map((m) => m.id)).toEqual(["undated", "a", "b", "c"]);
});

test("marks only an Advantage Intelligence match as derived", () => {
  const result = toStatisticsMatches(
    [
      match({ id: "video", date: "2026-01-01", source_provider: "splitstep" }),
      match({
        id: "sheet",
        date: "2026-01-02",
        source_provider: "swingvision",
      }),
      match({ id: "legacy", date: "2026-01-03", source_provider: null }),
    ],
    [stat("video", true), stat("sheet", true), stat("legacy", true)],
    MY_IDS,
    ME,
  );

  expect(result.map((m) => m.isDerived)).toEqual([true, false, false]);
});

test("carries the match's own facts through", () => {
  const [only] = toStatisticsMatches(
    [match({ id: "a", court_type: "clay", opponent_hand: "left" })],
    [stat("a", true)],
    MY_IDS,
    ME,
  );

  expect(only).toMatchObject({
    id: "a",
    date: "2026-03-01",
    isPlayer1: true,
    opponentName: "Olivia Opponent",
    opponentHand: "left",
    opponentBackhand: "two-handed",
    courtType: "clay",
    isDerived: false,
    won: null,
  });
  expect(only.profile).toMatchObject({ id: "a", date: "2026-03-01" });
});
