import { expect, test } from "@playwright/test";

import { transformToPlayerStats } from "@/lib/data/match-stats-server";

/**
 * A percentage the match did not measure is null all the way to the report,
 * where it renders "—" — never 0%. `match_stats_with_percentages` answers
 * null for a rate with nothing under it (no second serves returned, a seed
 * with no return counts), and `transformToPlayerStats` used to read that as
 * `parseFloat(x ?? "0")`: a report of "0% second-serve returns won" for a
 * match with none, beside "—" for second-serve points won on the same points.
 */

type Row = Parameters<typeof transformToPlayerStats>[0];

const UNMEASURED = [
  "firstServeInPct",
  "firstServeWinPct",
  "serviceGamesWonPct",
  "firstReturnWonPct",
  "secondReturnWonPct",
  "returnGamesWonPct",
  "breakpointsWonPct",
  "shortRallyWonPct",
  "mediumRallyWonPct",
  "longRallyWonPct",
] as const;

const COLUMN: Record<(typeof UNMEASURED)[number], string> = {
  firstServeInPct: "first_serve_pct",
  firstServeWinPct: "first_serve_won_pct",
  serviceGamesWonPct: "service_games_won_pct",
  firstReturnWonPct: "first_return_won_pct",
  secondReturnWonPct: "second_return_won_pct",
  returnGamesWonPct: "return_games_won_pct",
  breakpointsWonPct: "break_points_converted_pct",
  shortRallyWonPct: "short_rally_won_pct",
  mediumRallyWonPct: "medium_rally_won_pct",
  longRallyWonPct: "long_rally_won_pct",
};

const rowWith = (values: Record<string, string | null>) =>
  ({ ...values }) as unknown as Row;

test.describe("a percentage the match did not measure", () => {
  test("stays null, so the report draws a dash rather than 0%", () => {
    const nulls = Object.fromEntries(
      UNMEASURED.map((field) => [COLUMN[field], null]),
    );
    const stats = transformToPlayerStats(rowWith(nulls), 0);
    for (const field of UNMEASURED) expect(stats[field], field).toBeNull();
  });

  test("a measured 0% is still 0, and a measured rate is rounded", () => {
    const measured = Object.fromEntries(
      UNMEASURED.map((field) => [COLUMN[field], "0"]),
    );
    measured.second_return_won_pct = "37.6";
    const stats = transformToPlayerStats(rowWith(measured), 0);
    expect(stats.firstReturnWonPct).toBe(0);
    expect(stats.breakpointsWonPct).toBe(0);
    expect(stats.secondReturnWonPct).toBe(38);
  });

  test("a match with no stats row reads every rate as unmeasured", () => {
    const stats = transformToPlayerStats(undefined, 0);
    for (const field of UNMEASURED) expect(stats[field], field).toBeNull();
  });
});
