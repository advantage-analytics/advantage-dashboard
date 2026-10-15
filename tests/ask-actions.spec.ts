import { expect, test } from "@playwright/test";

import type { AskSourceMatch, AskVisual } from "@/lib/services/ask/events";
import {
  MAX_ASK_ACTIONS,
  askActionsFor,
  askCsvDataUrl,
  askVisualCsv,
  figureVisualizationsHref,
  figureVizFilters,
} from "@/lib/services/ask/actions";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";

/**
 * `actions.ts` — the action catalogue under an answer (roadmap 6.4) and the
 * CSV export. Offline: sources, figures and a block in; cards out. Nothing
 * here runs anything — every card is a link, a draft or a request.
 */

const TEAM: AskScope = {
  kind: "team",
  programId: "pppppppp-0000-4000-8000-000000000001",
  programName: "Westbrook",
};

const ONE: AskSourceMatch = {
  matchId: "match-sep-28",
  opponentName: "Marcus Hale",
  playedOn: "2026-09-28",
  iWon: true,
  scoreText: "6-4, 6-3",
  playerName: null,
};

const TWO: AskSourceMatch = {
  ...ONE,
  matchId: "match-sep-14",
  playedOn: "2026-09-14",
};

const TABLE: AskVisual = {
  kind: "table",
  caption: "From 1 match.",
  columns: ["Sep 28", "All"],
  rows: [{ label: 'First serves in, "T"', cells: ["37.5%", "58,2 %"] }],
};

test.describe("askActionsFor", () => {
  test("one match, a watchable figure and a block: the film, the pin, the court, the view, the file", () => {
    const actions = askActionsFor({
      sources: [ONE],
      figures: [
        {
          label: "Second serves won",
          value: "55%",
          column: "second_serve_won_pct",
        },
      ],
      visual: TABLE,
      scope: PERSONAL_ASK_SCOPE,
    });
    expect(actions.map((action) => action.kind)).toEqual([
      "watch",
      "pin",
      "visualize",
      "save_view",
      "export",
    ]);
    expect(actions).toHaveLength(MAX_ASK_ACTIONS);

    const watch = actions[0];
    expect(watch.kind === "watch" && watch.href).toMatch(
      /^\/dashboard\/matches\/match-sep-28\?tab=film&f=/,
    );
    const viz = actions[2];
    expect(viz.kind === "visualize" && viz.href).toMatch(
      /^\/dashboard\/matches\/match-sep-28\?tab=shots&cut=serve&vf=/,
    );
    const view = actions[3];
    expect(view.kind === "save_view" && view.view).toMatchObject({
      name: "Second serves won",
      cut: "serve",
      chart: "scatter",
      filters: { player: "you", pressure: [], rally: [] },
    });
  });

  test("no block, no pin and no file; two matches, no film and no court", () => {
    const actions = askActionsFor({
      sources: [ONE, TWO],
      figures: [{ label: "Aces", value: "7", column: "aces" }],
      visual: null,
      scope: PERSONAL_ASK_SCOPE,
    });
    expect(actions.map((action) => action.kind)).toEqual(["open_opponent"]);
    expect(actions[0]).toMatchObject({
      label: "Matches vs. Marcus Hale",
      href: "/dashboard/matches?q=Marcus%20Hale",
    });
  });

  test("a team answer never offers the pin — only the personal Home draws them — and opens the tagged player", () => {
    const actions = askActionsFor({
      sources: [ONE],
      figures: [],
      visual: TABLE,
      scope: TEAM,
      tags: [{ kind: "player", id: "p1", label: "Ana Sokolov" }],
    });
    expect(actions.map((action) => action.kind)).toEqual([
      "export",
      "share",
      "open_match",
      "open_player",
      "open_opponent",
    ]);
    expect(actions[3]).toMatchObject({
      label: "Open Ana Sokolov",
      href: "/dashboard/team/roster/p1",
    });
  });

  test("nothing to act on: no cards", () => {
    expect(
      askActionsFor({ sources: null, figures: [], visual: null, scope: TEAM }),
    ).toEqual([]);
    expect(
      askActionsFor({
        sources: [{ ...ONE, opponentName: null }],
        figures: [{ label: "Points", value: "88", column: "total_points" }],
        visual: null,
        scope: PERSONAL_ASK_SCOPE,
      }).map((action) => action.kind),
    ).toEqual(["share", "open_match"]);
  });
});

test.describe("figureVizFilters", () => {
  test("serve, return placement, return contact, pressure and rally bands find their court", () => {
    expect(figureVizFilters("first_serve_pct")?.cut).toBe("serve");
    expect(figureVizFilters("return_cross_court_pct")?.cut).toBe(
      "returnPlacement",
    );
    expect(figureVizFilters("return_contact_deep_pct")?.cut).toBe(
      "returnContact",
    );
    expect(figureVizFilters("break_points_saved_pct")).toMatchObject({
      cut: "serve",
      filters: { pressure: ["break"] },
    });
    expect(figureVizFilters("long_rally_won_pct")).toMatchObject({
      cut: "rallyPlacement",
      filters: { rally: ["long"] },
    });
  });

  test("the opponent's figure draws their court; a baseline over other matches draws none", () => {
    expect(figureVizFilters("opp_first_serve_pct")?.filters.player).toBe(
      "opponent",
    );
    expect(figureVizFilters("all_first_serve_pct")).toBeNull();
    expect(figureVizFilters("total_points")).toBeNull();
    expect(figureVizFilters("not_a_column")).toBeNull();
  });

  test("the href carries the cut, the extras and the advanced filters", () => {
    const viz = figureVizFilters("break_points_saved_pct")!;
    const href = figureVisualizationsHref("m1", viz.cut, viz.filters);
    expect(
      href.startsWith(
        "/dashboard/matches/m1?tab=shots&cut=serve&pressure=break&vf=",
      ),
    ).toBe(true);
    const opponent = figureVizFilters("opp_second_serve_won_pct")!;
    expect(
      figureVisualizationsHref("m1", opponent.cut, opponent.filters),
    ).toContain("player=opponent");
  });
});

test.describe("askVisualCsv", () => {
  test("a table: the columns as the header, cells quoted only when they need it", () => {
    const file = askVisualCsv(TABLE);
    expect(file.filename).toBe("ask-table.csv");
    expect(file.text).toBe(
      ',Sep 28,All\n"First serves in, ""T""",37.5%,58,2 %'.replace(
        "58,2 %",
        '"58,2 %"',
      ),
    );
    expect(askCsvDataUrl(file)).toBe(
      `data:text/csv;charset=utf-8,${encodeURIComponent(file.text)}`,
    );
  });

  test("every kind prints the server's text, never a reformatted number", () => {
    const n = (value: number, text: string) => ({ value, text });
    const files = [
      askVisualCsv({
        kind: "bars",
        caption: "",
        subjectLabel: "Lefties",
        baselineLabel: "All",
        rows: [
          { label: "In", subject: n(37.5, "37,5 %"), baseline: n(58, "58 %") },
        ],
      }),
      askVisualCsv({
        kind: "trend",
        caption: "",
        points: [{ label: "Jun 4", value: n(61, "61,0 %") }],
        baseline: { label: "Avg", values: [n(58, "58,0 %")] },
      }),
      askVisualCsv({
        kind: "split",
        caption: "",
        parts: [{ label: "Winners", count: n(8, "8 pts") }],
      }),
      askVisualCsv({
        kind: "serve",
        caption: "",
        courts: [
          {
            label: "Deuce",
            t: n(9, "9 srv"),
            body: n(3, "3 srv"),
            wide: n(6, "6 srv"),
          },
        ],
      }),
      askVisualCsv({ kind: "form", caption: "", results: [true, false] }),
      askVisualCsv({
        kind: "momentum",
        caption: "",
        points: [{ won: true, set: 1, mark: "break" }, { won: false }],
      }),
      askVisualCsv({
        kind: "tree",
        caption: "",
        levels: ["Serve", "Plus one"],
        countLabel: "Points",
        partLabel: "Won",
        shareLabel: "Won",
        branches: [
          {
            steps: ["T", "Forehand"],
            count: n(12, "12"),
            part: n(8, "8"),
            share: n(66.7, "67%"),
          },
        ],
      }),
    ].map((file) => file.text);
    expect(files).toEqual([
      ',Lefties,All\nIn,"37,5 %",58 %',
      ',Value,Avg\nJun 4,"61,0 %","58,0 %"',
      "Part,Count\nWinners,8 pts",
      "Court,T,Body,Wide\nDeuce,9 srv,3 srv,6 srv",
      "Match,Result\n1,Won\n2,Lost",
      "Point,Set,Won,Mark\n1,1,Yes,break\n2,,No,",
      "Serve,Plus one,Points,Won,Won\nT,Forehand,12,8,67%",
    ]);
  });
});
