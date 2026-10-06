import { expect, test } from "@playwright/test";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  chartAllowedOn,
  computeViz,
  computeVizStats,
  EMPTY_VIZ_FILTERS,
  errorKindOf,
  foldedMatchFilters,
  statRowAnnouncement,
  withFoldedFilters,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import {
  activeFilterEntries,
  carryFilters,
  parseVizState,
  sameView,
  VIZ_MATCH_FILTERS_PARAM,
  vizStateQuery,
  type VizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import {
  EMPTY_MATCH_FILTERS,
  type MatchFilterContext,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { validateVizInput } from "@/lib/data/saved-views-logic";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { rallyShot } from "./fixtures/viz-rally-points";
import { servePoint } from "./fixtures/viz-serve-points";

/**
 * The Visualizations errors cut and the advanced (`MatchFilters`) half of
 * `VizFilters`. Player 1 serves from the low end in every fixture, so player
 * 2's strokes come from the high end.
 */
function errorPoint(
  id: string,
  resultType: string,
  erringP1: boolean,
  miss: { lateral: number; depth: number; result: string; shotType: string },
): MatchPoint {
  const base = servePoint({ id, player1: true });
  return {
    ...base,
    resultType,
    wonByPlayer1: !erringP1,
    shots: [
      ...base.shots!,
      rallyShot(`${id}-return`, false, true, 1, 8, { shotType: "Backhand" }),
      rallyShot(`${id}-miss`, erringP1, !erringP1, miss.lateral, miss.depth, {
        result: miss.result,
        shotType: miss.shotType,
      }),
    ],
  };
}

const UNFORCED_NET = errorPoint("ue-p1", "Forehand Unforced Error", true, {
  lateral: 0.5,
  depth: -0.3,
  result: "Net",
  shotType: "Forehand",
});
const FORCED_LONG = errorPoint("fe-p1", "Backhand Forced Error", true, {
  lateral: 1,
  depth: 13,
  result: "Out",
  shotType: "Backhand",
});
const DOUBLE_FAULT_WIDE: MatchPoint = {
  ...servePoint({
    id: "df-p1",
    player1: true,
    second: true,
    result: "Out",
    lateral: -5,
    depth: 3,
    won: false,
  }),
  resultType: "Double Fault",
};
const OPPONENT_UNFORCED = errorPoint(
  "ue-p2",
  "Backhand Unforced Error",
  false,
  {
    lateral: 4.5,
    depth: 5,
    result: "Out",
    shotType: "Backhand",
  },
);
const WINNER: MatchPoint = { ...servePoint({ id: "winner" }) };

const POINTS = [
  UNFORCED_NET,
  FORCED_LONG,
  DOUBLE_FAULT_WIDE,
  OPPONENT_UNFORCED,
  WINNER,
];

const CTX_P1: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: null, player2: null },
};

test("errorKindOf reads the result type's error kind", () => {
  expect(errorKindOf({ resultType: "Forehand Unforced Error" })).toBe(
    "unforced",
  );
  expect(errorKindOf({ resultType: "Unforced Error" })).toBe("unforced");
  expect(errorKindOf({ resultType: "Backhand Forced Error" })).toBe("forced");
  expect(errorKindOf({ resultType: "Double Fault" })).toBe("doubleFault");
  expect(errorKindOf({ resultType: "Winner" })).toBeNull();
});

test("the errors cut plots the subject's own errors where they landed", () => {
  const result = computeViz(POINTS, "errors", EMPTY_VIZ_FILTERS, true);
  expect(result.noun).toBe("errors");
  expect(result.total).toBe(3);
  expect(result.count).toBe(3);
  expect(result.dots.map((d) => d.id)).toEqual(["ue-p1", "fe-p1", "df-p1"]);
  expect(result.dots.every((d) => d.outcome === "lost")).toBe(true);
  const [net, long, wide] = result.dots;
  expect(net.atNet).toBe(true);
  expect(long.depthM).toBeCloseTo(13);
  expect(long.shape).toBe("triangle");
  expect(wide.lateralM).toBeCloseTo(-5);
  expect(wide.meta?.shotType).toBe("Second Serve");
});

test("attribution flips with the viewer: player 2's court shows only their errors", () => {
  const result = computeViz(POINTS, "errors", EMPTY_VIZ_FILTERS, false);
  expect(result.dots.map((d) => d.id)).toEqual(["ue-p2"]);
  // Read from behind player 2 at the high end.
  expect(result.dots[0].lateralM).toBeCloseTo(4.5);
  expect(result.dots[0].depthM).toBeCloseTo(5);
});

test("Error type narrows the count, never the drawable pool", () => {
  const unforced = computeViz(
    POINTS,
    "errors",
    { ...EMPTY_VIZ_FILTERS, error: ["unforced"] },
    true,
  );
  expect(unforced.dots.map((d) => d.id)).toEqual(["ue-p1"]);
  expect(unforced.total).toBe(3);
  const both = computeViz(
    POINTS,
    "errors",
    { ...EMPTY_VIZ_FILTERS, error: ["forced", "doubleFault"] },
    true,
  );
  expect(both.dots.map((d) => d.id)).toEqual(["fe-p1", "df-p1"]);
});

test("errors stats are shares of the errors shown, by miss and by stroke", () => {
  const stats = computeVizStats(
    POINTS,
    "errors",
    EMPTY_VIZ_FILTERS,
    true,
    undefined,
    DEFAULT_BANDS,
    "ft",
  );
  expect(stats.total).toBe(3);
  const [miss, stroke] = stats.groups;
  expect(miss.rows.map((r) => [r.label, r.count, r.winPct])).toEqual([
    ["Long", 1, 33],
    ["Net", 1, 33],
    ["Wide", 1, 33],
  ]);
  expect(stroke.rows.map((r) => r.label).sort()).toEqual([
    "Backhand",
    "Forehand",
    "Serve",
  ]);
  expect(statRowAnnouncement(miss.rows[0])).toBe("Long: 33% of errors, 1");
  expect(chartAllowedOn("errors", "zones")).toBe(false);
  expect(chartAllowedOn("errors", "heat")).toBe(true);
});

test("the wall has an Unforced errors tile for each player", () => {
  const tiles = buildDefaultTiles(
    POINTS,
    {
      you: { name: "P1", isPlayer1: true },
      opp: { name: "P2", isPlayer1: false },
    },
    (state) => vizStateQuery(new URLSearchParams(), state),
  );
  const errors = tiles.filter((t) => t.cut === "errors");
  expect(errors.map((t) => [t.key, t.name, t.countLabel])).toEqual([
    ["you:errors", "Unforced errors", "1 of 3"],
    ["opponent:errors", "Unforced errors", "1 of 1"],
  ]);
  for (const tile of errors)
    expect(parseVizState(new URLSearchParams(tile.href))).toEqual(tile.state);
});

test("advanced filters narrow every cut, on top of the pill groups", () => {
  const first = servePoint({ id: "first", lateral: -3.4 });
  const second = servePoint({ id: "second", second: true, lateral: 3.4 });
  const filters: VizFilters = {
    ...EMPTY_VIZ_FILTERS,
    match: { ...EMPTY_MATCH_FILTERS, serveType: ["second"] },
  };
  const result = computeViz(
    [first, second],
    "serve",
    filters,
    true,
    "scatter",
    CTX_P1,
  );
  expect(result.dots.map((d) => d.id)).toEqual(["second"]);
  expect(result.total).toBe(2);
  // Without the report's context it falls back to the subject as "you".
  expect(computeViz([first, second], "serve", filters, true).count).toBe(1);
});

test("the advanced filters round-trip through the URL as their own param", () => {
  const state = {
    cut: "errors" as const,
    chart: "heat",
    filters: {
      ...EMPTY_VIZ_FILTERS,
      error: ["unforced"],
      match: { ...EMPTY_MATCH_FILTERS, server: "you", sets: [2] },
    },
    viewId: null,
  } satisfies VizState;
  const query = vizStateQuery(new URLSearchParams("tab=shots&f=xyz"), state);
  const params = new URLSearchParams(query);
  expect(params.get(VIZ_MATCH_FILTERS_PARAM)).not.toBeNull();
  // The Video tab's own `?f=` is carried through untouched.
  expect(params.get("f")).toBe("xyz");
  const parsed = parseVizState(params);
  expect(parsed.filters.error).toEqual(["unforced"]);
  expect(parsed.filters.match.server).toBe("you");
  expect(parsed.filters.match.sets).toEqual([2]);
  expect(sameView(parsed, state)).toBe(true);
  expect(
    sameView(parsed, {
      ...state,
      filters: { ...state.filters, match: EMPTY_MATCH_FILTERS },
    }),
  ).toBe(false);
});

test("Error type is dropped off the errors cut", () => {
  const filters = { ...EMPTY_VIZ_FILTERS, error: ["unforced" as const] };
  expect(carryFilters(filters, "errors").error).toEqual(["unforced"]);
  expect(carryFilters(filters, "rallyPlacement").error).toEqual([]);
  expect(carryFilters(filters, "serve").error).toEqual([]);
});

test("applied tokens name each advanced option with the players' names", () => {
  const entries = activeFilterEntries(
    {
      cut: "serve",
      chart: "scatter",
      filters: {
        ...EMPTY_VIZ_FILTERS,
        match: {
          ...EMPTY_MATCH_FILTERS,
          server: "opponent",
          serveType: ["second"],
        },
      },
      viewId: null,
    },
    { you: "Rudy", opponent: "G. Revelli" },
  );
  expect(entries.map((e) => [e.key, e.label, e.matchKey])).toEqual([
    ["match", "G. Revelli serving", "server"],
    ["match", "Second serve", "serveType"],
  ]);
});

test("the pill groups fold into advanced filters, you-relative", () => {
  const filters: VizFilters = {
    ...EMPTY_VIZ_FILTERS,
    player: "opponent",
    set: [1],
    game: ["serving"],
    ball: ["first"],
    court: ["ad"],
    zone: ["t"],
    pressure: ["setMatch"],
    result: ["won", "ace"],
    rally: ["long"],
  };
  const folded = foldedMatchFilters(filters);
  expect(folded).toMatchObject({
    sets: [1],
    server: "opponent",
    serveType: ["first"],
    court: "ad",
    serveZone: ["T"],
    scoreType: ["setPoint", "matchPoint"],
    serveResult: ["ace"],
    resultOutcome: ["lost"],
    resultRallyLength: ["long"],
  });
  const applied = withFoldedFilters(filters, folded);
  expect(applied.player).toBe("opponent");
  for (const key of [
    "set",
    "game",
    "ball",
    "court",
    "zone",
    "pressure",
    "result",
    "rally",
  ] as const)
    expect(applied[key]).toEqual([]);
  expect(applied.match).toBe(folded);
  // Both Game values are no constraint.
  expect(
    foldedMatchFilters({ ...EMPTY_VIZ_FILTERS, game: ["serving", "returning"] })
      .server,
  ).toBeNull();
});

test("saved views keep the errors cut and advanced filters, and drop garbage", () => {
  const saved = validateVizInput({
    cut: "errors",
    chart: "scatter",
    filters: {
      ...EMPTY_VIZ_FILTERS,
      error: ["unforced"],
      match: { ...EMPTY_MATCH_FILTERS, serveType: ["first"] },
    },
  });
  expect(saved?.cut).toBe("errors");
  expect(saved?.filters.error).toEqual(["unforced"]);
  expect(saved?.filters.match.serveType).toEqual(["first"]);

  const stale = validateVizInput({
    cut: "serve",
    chart: "scatter",
    filters: { ball: "first", match: "not-an-object" },
  });
  expect(stale?.filters.ball).toEqual(["first"]);
  expect(stale?.filters.match).toEqual(EMPTY_MATCH_FILTERS);
});
