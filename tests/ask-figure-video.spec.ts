import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  type MatchFilters,
  parseMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import {
  figureMatchFilters,
  figureVideoHref,
} from "@/lib/services/ask/figure-video";

/**
 * `figure-video.ts`: which figures open the Video tab, and on which points.
 * Pure — a column name and the sources in, a link or null out.
 */

const ONE: AskSourceMatch[] = [
  {
    matchId: "match/sep-28",
    opponentName: "Theo Lindqvist",
    playedOn: "2026-09-28",
    iWon: true,
    scoreText: "6-4, 6-3",
    playerName: null,
  },
];

const filters = (preset: Partial<MatchFilters>): MatchFilters => ({
  ...EMPTY_MATCH_FILTERS,
  ...preset,
});

/** The filters a link opens the Video tab with, read back off its `f`. */
function opened(href: string | null): MatchFilters | null {
  if (href === null) return null;
  const query = new URL(href, "http://x").searchParams;
  expect(query.get("tab")).toBe("film");
  return parseMatchFilters(query.get("f"));
}

test.describe("figureMatchFilters — the measure's preset", () => {
  test("serve measures: your serve, with the type when the name says so, and the zone for a direction", () => {
    expect(figureMatchFilters("second_serve_won_pct")).toEqual(
      filters({ server: "you", serveType: ["second"] }),
    );
    expect(figureMatchFilters("first_serves_in")).toEqual(
      filters({ server: "you", serveType: ["first"] }),
    );
    expect(figureMatchFilters("aces")).toEqual(filters({ server: "you" }));
    expect(figureMatchFilters("double_faults")).toEqual(
      filters({ server: "you" }),
    );
    expect(figureMatchFilters("serve_wide_pct")).toEqual(
      filters({ server: "you", serveZone: ["Wide"] }),
    );
  });

  test("return measures: the other side's serve, the type, the return's direction", () => {
    expect(figureMatchFilters("first_return_won_pct")).toEqual(
      filters({ server: "opponent", serveType: ["first"] }),
    );
    expect(figureMatchFilters("return_points_won_pct")).toEqual(
      filters({ server: "opponent" }),
    );
    expect(figureMatchFilters("return_cross_court")).toEqual(
      filters({ server: "opponent", returnZone: ["Crosscourt"] }),
    );
    expect(figureMatchFilters("return_contact_deep_pct")).toEqual(
      filters({ server: "opponent" }),
    );
  });

  test("break points on the serve they were played on; set points on any; rallies by band", () => {
    expect(figureMatchFilters("break_points_saved_pct")).toEqual(
      filters({ scoreType: ["breakpoint"], server: "you" }),
    );
    expect(figureMatchFilters("break_points_converted")).toEqual(
      filters({ scoreType: ["breakpoint"], server: "opponent" }),
    );
    expect(figureMatchFilters("set_points_saved")).toEqual(
      filters({ scoreType: ["setPoint"] }),
    );
    expect(figureMatchFilters("long_rally_won_pct")).toEqual(
      filters({ resultRallyLength: ["long"] }),
    );
    expect(figureMatchFilters("short_rally_total")).toEqual(
      filters({ resultRallyLength: ["short"] }),
    );
  });

  test("me_ adds nothing; opp_ is the opponent's own points, sides swapped", () => {
    expect(figureMatchFilters("me_first_serve_pct")).toEqual(
      figureMatchFilters("first_serve_pct"),
    );
    expect(figureMatchFilters("opp_first_serve_pct")).toEqual(
      filters({ server: "opponent", serveType: ["first"] }),
    );
    expect(figureMatchFilters("opp_return_won_pct")).toEqual(
      filters({ server: "you" }),
    );
    expect(figureMatchFilters("opp_break_points_saved")).toEqual(
      filters({ scoreType: ["breakpoint"], server: "opponent" }),
    );
    expect(figureMatchFilters("opp_set_points_saved")).toEqual(
      filters({ scoreType: ["setPoint"] }),
    );
  });

  test("no preset: a whole-match measure, an average, a baseline over other matches, an unknown column", () => {
    for (const column of [
      "total_points_won_pct",
      "total_points",
      "winners",
      "unforced_errors",
      "avg_rally_length",
      "net_points_won",
      "all_first_serve_pct",
      "team_second_serve_won_pct",
      "first_serve_pct_prev5",
      "matches_in_scope",
      "played_on",
      "",
    ]) {
      expect(figureMatchFilters(column), column).toBeNull();
    }
  });
});

test.describe("figureVideoHref — the link", () => {
  test("one match in scope: its Video tab, filtered to the figure's points", () => {
    const href = figureVideoHref("second_serve_won_pct", ONE);
    expect(href).toMatch(/^\/dashboard\/matches\/match%2Fsep-28\?tab=film&f=/);
    expect(opened(href)).toEqual(
      filters({ server: "you", serveType: ["second"] }),
    );
    expect(opened(figureVideoHref("break_points_converted_pct", ONE))).toEqual(
      filters({ scoreType: ["breakpoint"], server: "opponent" }),
    );
    expect(opened(figureVideoHref("medium_rally_won", ONE))).toEqual(
      filters({ resultRallyLength: ["medium"] }),
    );
  });

  test("null for more than one match, none, no column, or a measure with no preset", () => {
    expect(
      figureVideoHref("second_serve_won_pct", [...ONE, ...ONE]),
    ).toBeNull();
    expect(figureVideoHref("second_serve_won_pct", [])).toBeNull();
    expect(figureVideoHref("second_serve_won_pct", null)).toBeNull();
    expect(figureVideoHref("second_serve_won_pct", undefined)).toBeNull();
    expect(figureVideoHref(undefined, ONE)).toBeNull();
    expect(figureVideoHref("", ONE)).toBeNull();
    expect(figureVideoHref("total_points_won_pct", ONE)).toBeNull();
    expect(figureVideoHref("all_second_serve_won_pct", ONE)).toBeNull();
  });
});
