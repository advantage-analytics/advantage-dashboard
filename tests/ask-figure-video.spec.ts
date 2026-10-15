import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  type MatchFilters,
  parseMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import {
  barRowVideoHref,
  figureMatchFilters,
  figureVideoHref,
  measureForLabel,
  serveZoneVideoHref,
  tableRowVideoHref,
  watchHref,
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

// ── The rest of a block: rows, zones, branches ──────────────────────────────

test.describe("measureForLabel — a canonical row label back to its column", () => {
  test("the dictionary's names, bare or the opponent's, for measures with a preset", () => {
    expect(measureForLabel("First serves in")).toBe("first_serves_in");
    expect(measureForLabel("first serves in")).toBe("first_serves_in");
    expect(measureForLabel("Second-serve points won")).toMatch(
      /^second_serve_(?:points_won|won_pct)$/,
    );
    expect(measureForLabel("Serves wide")).toBe("serve_wide");
    expect(measureForLabel("Break points saved, opponent")).toBe(
      "opp_break_points_saved",
    );
    // The paired table's own suffix for a share beside its count.
    expect(measureForLabel("First serves in, share")).toBe("first_serves_in");
  });

  test("a label that is no measure, has no preset, or is over other matches is null", () => {
    expect(measureForLabel("Total points won")).toBeNull();
    expect(measureForLabel("Winners")).toBeNull();
    expect(measureForLabel("First serves in, all matches")).toBeNull();
    expect(measureForLabel("Rudy Quan")).toBeNull();
    expect(measureForLabel("")).toBeNull();
  });
});

test.describe("the rows and zones that open the film", () => {
  test("a bars row is its label's measure over the one source", () => {
    expect(opened(barRowVideoHref("Serves wide", ONE))).toEqual(
      filters({ server: "you", serveZone: ["Wide"] }),
    );
    expect(barRowVideoHref("Total points won", ONE)).toBeNull();
    expect(barRowVideoHref("Serves wide", [...ONE, ...ONE])).toBeNull();
    expect(barRowVideoHref("Serves wide", null)).toBeNull();
  });

  test("a table row that is a match opens its film: the source's own points, else its measure's, else the whole", () => {
    expect(
      tableRowVideoHref({ label: "Theo Lindqvist", matchId: "m 1" }, ONE),
    ).toBe("/dashboard/matches/m%201?tab=film");
    expect(
      tableRowVideoHref({ label: "Theo Lindqvist", matchId: "m 1" }, null),
    ).toBe("/dashboard/matches/m%201?tab=film");
    expect(
      opened(tableRowVideoHref({ label: "Aces", matchId: "m 1" }, [])),
    ).toEqual(filters({ server: "you" }));
    expect(
      tableRowVideoHref({ label: "Theo Lindqvist", matchId: "m 1" }, [
        {
          ...ONE[0],
          matchId: "m 1",
          watch: {
            href: "/dashboard/matches/m%201?tab=film&f=cp.y",
            points: 4,
          },
        },
      ]),
    ).toBe("/dashboard/matches/m%201?tab=film&f=cp.y");
    // Another source's watch is not this row's.
    expect(
      tableRowVideoHref({ label: "Theo Lindqvist", matchId: "m 1" }, [
        {
          ...ONE[0],
          matchId: "m 2",
          watch: {
            href: "/dashboard/matches/m%202?tab=film&f=cp.y",
            points: 4,
          },
        },
      ]),
    ).toBe("/dashboard/matches/m%201?tab=film");
  });

  test("a table row that is a measure opens the one source's film on it; any other row nothing", () => {
    expect(opened(tableRowVideoHref({ label: "Aces" }, ONE))).toEqual(
      filters({ server: "you" }),
    );
    expect(tableRowVideoHref({ label: "Aces" }, [...ONE, ...ONE])).toBeNull();
    expect(tableRowVideoHref({ label: "Winners" }, ONE)).toBeNull();
  });

  test("a serve court's zone: that side's serves into the zone from that court", () => {
    expect(opened(serveZoneVideoHref("m 1", "you", "deuce", "T"))).toEqual(
      filters({ server: "you", court: "deuce", serveZone: ["T"] }),
    );
    expect(opened(serveZoneVideoHref("m 1", "opponent", "ad", "Wide"))).toEqual(
      filters({ server: "opponent", court: "ad", serveZone: ["Wide"] }),
    );
    expect(serveZoneVideoHref("m 1", "you", "deuce", "T")).toMatch(
      /^\/dashboard\/matches\/m%201\?tab=film&f=/,
    );
  });

  test("watchHref is the film with a filter already spelt, or the whole film", () => {
    expect(watchHref("m 1", "sv.y_sz.t")).toBe(
      "/dashboard/matches/m%201?tab=film&f=sv.y_sz.t",
    );
    expect(watchHref("m 1")).toBe("/dashboard/matches/m%201?tab=film");
    expect(watchHref("m 1", "")).toBe("/dashboard/matches/m%201?tab=film");
  });
});
