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
  withPlayer,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { legendItemsFor } from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import {
  activeFilterEntries,
  carryFilters,
  courtFor,
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
  const { match, folded } = foldedMatchFilters(filters);
  expect(match).toMatchObject({
    sets: [1],
    server: "opponent",
    serveType: ["first"],
    court: null,
    serveZone: [],
    scoreType: ["setPoint", "matchPoint"],
    serveResult: [],
    resultOutcome: [],
    resultRallyLength: ["long"],
  });
  const applied = withFoldedFilters(filters, match, folded);
  expect(applied.player).toBe("opponent");
  // Won/Lost are the court player's; Result › Outcome is always yours, so
  // the group stays a pill group rather than coming back named "lost".
  expect(applied.result).toEqual(["won", "ace"]);
  for (const key of ["set", "game", "ball", "pressure", "rally"] as const)
    expect(applied[key]).toEqual([]);
  // Zone and Court measure the serve's landing; the advanced Zone and Court
  // do not, so they stay pill groups.
  expect(applied.court).toEqual(["ad"]);
  expect(applied.zone).toEqual(["t"]);
  expect(applied.match).toBe(match);
  // Ace alone folds to Serve › Result; beside Won it is subsumed.
  expect(
    foldedMatchFilters({ ...EMPTY_VIZ_FILTERS, result: ["ace"] }).match
      .serveResult,
  ).toEqual(["ace"]);
  // Both Game values are no constraint: folded away, nothing set.
  const both = foldedMatchFilters({
    ...EMPTY_VIZ_FILTERS,
    game: ["serving", "returning"],
  });
  expect(both.match.server).toBeNull();
  expect(both.folded).toEqual(["game"]);
});

test("a pill group the advanced filters cannot say exactly stays a pill group", () => {
  // "Lost OR ace" has no advanced equivalent.
  const lostOrAce: VizFilters = {
    ...EMPTY_VIZ_FILTERS,
    result: ["lost", "ace"],
  };
  const fold = foldedMatchFilters(lostOrAce);
  expect(fold.folded).toEqual([]);
  expect(fold.match).toEqual(EMPTY_MATCH_FILTERS);
  const shown = withFoldedFilters(lostOrAce, fold.match, fold.folded);
  expect(shown.result).toEqual(["lost", "ace"]);

  // An advanced group already holding values is never merged into (OR
  // within a group would widen what the pill group AND'd).
  const both: VizFilters = {
    ...EMPTY_VIZ_FILTERS,
    pressure: ["break"],
    game: ["returning"],
    match: { ...EMPTY_MATCH_FILTERS, scoreType: ["pressure"], server: "you" },
  };
  const kept = foldedMatchFilters(both);
  expect(kept.folded).toEqual([]);
  expect(kept.match).toEqual(both.match);
  expect(withFoldedFilters(both, kept.match, kept.folded)).toEqual(both);
});

test("switching the court's player swaps who served, never who won", () => {
  const mine: VizFilters = {
    ...EMPTY_VIZ_FILTERS,
    match: {
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      resultPlayer: "opponent",
      customPlayer: "you",
      resultOutcome: ["won"],
      serveType: ["second"],
    },
  };
  const theirs = withPlayer(mine, "opponent");
  expect(theirs.player).toBe("opponent");
  expect(theirs.match).toMatchObject({
    server: "opponent",
    resultPlayer: "you",
    customPlayer: "opponent",
    // Result › Outcome is yours on every court, as on the Video tab.
    resultOutcome: ["won"],
    serveType: ["second"],
  });
  expect(withPlayer(theirs, "you")).toEqual(mine);
  expect(withPlayer(mine, "you")).toBe(mine);

  // "Serving" on your serve court keeps drawing the court player's serves.
  const serves = [
    servePoint({ id: "p1-serve", player1: true }),
    servePoint({ id: "p2-serve", player1: false }),
  ];
  const ctx = { youIsPlayer1: true, hands: { player1: null, player2: null } };
  const folded = foldedMatchFilters({
    ...EMPTY_VIZ_FILTERS,
    game: ["serving"],
  });
  const yours = withFoldedFilters(
    { ...EMPTY_VIZ_FILTERS, game: ["serving"] },
    folded.match,
    folded.folded,
  );
  expect(
    computeViz(serves, "serve", yours, true, "scatter", ctx).dots.map(
      (d) => d.id,
    ),
  ).toEqual(["p1-serve"]);
  expect(
    computeViz(
      serves,
      "serve",
      withPlayer(yours, "opponent"),
      false,
      "scatter",
      ctx,
    ).dots.map((d) => d.id),
  ).toEqual(["p2-serve"]);
});

test("a double fault misses the service box, never the court", () => {
  const longFault: MatchPoint = {
    ...servePoint({
      id: "df-long",
      second: true,
      result: "Out",
      lateral: -2,
      depth: 8,
      won: false,
    }),
    resultType: "Double Fault",
  };
  const lineFault: MatchPoint = {
    ...servePoint({
      id: "df-line",
      second: true,
      result: "Out",
      lateral: -2,
      depth: 6.44,
      won: false,
    }),
    resultType: "Double Fault",
  };
  const stats = computeVizStats(
    [longFault, lineFault, DOUBLE_FAULT_WIDE],
    "errors",
    EMPTY_VIZ_FILTERS,
    true,
    undefined,
    DEFAULT_BANDS,
    "ft",
  );
  const miss = Object.fromEntries(
    stats.groups[0].rows.map((r) => [r.key, r.count]),
  );
  // 8 m and the imputed just-past-the-line landing are long; the 5 m-wide
  // one is wide. None reads "landed in".
  expect(miss).toEqual({ long: 2, wide: 1, net: 0 });
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

test("switching to Errors drops a carried Won or Aces, keeps Lost", () => {
  const won = {
    ...EMPTY_VIZ_FILTERS,
    result: ["won" as const, "ace" as const],
  };
  expect(carryFilters(won, "errors").result).toEqual([]);
  const lost = { ...EMPTY_VIZ_FILTERS, result: ["lost" as const] };
  expect(carryFilters(lost, "errors").result).toEqual(["lost"]);
  expect(carryFilters(won, "serve").result).toEqual(["won", "ace"]);
});

test("the stats noun follows Serve › Type in the advanced filters", () => {
  const first = servePoint({ id: "first" });
  const stats = computeVizStats(
    [first],
    "serve",
    {
      ...EMPTY_VIZ_FILTERS,
      match: { ...EMPTY_MATCH_FILTERS, serveType: ["first"] },
    },
    true,
    undefined,
    DEFAULT_BANDS,
    "ft",
  );
  expect(stats.subtitle).toContain("1 first serve");
});

test("the errors legend never calls a serve or volley a forehand", () => {
  const labels = legendItemsFor("errors", "scatter").map((i) => i.label);
  expect(labels).toEqual(["Error", "Forehand, serve or other", "Backhand"]);
});

test("switching to Errors drops advanced filters that ask for the court player's wins", () => {
  const winning = {
    ...EMPTY_MATCH_FILTERS,
    resultOutcome: ["won" as const],
    serveResult: ["ace" as const, "double-fault" as const],
    returnResult: ["winner" as const],
    resultEnding: ["winner" as const, "error" as const],
  };
  const mine = carryFilters({ ...EMPTY_VIZ_FILTERS, match: winning }, "errors");
  expect(mine.match).toMatchObject({
    resultOutcome: [],
    serveResult: ["double-fault"],
    returnResult: [],
    resultEnding: ["error"],
  });
  // On the opponent's court "won" (yours) is their loss: it stays.
  const theirs = carryFilters(
    { ...EMPTY_VIZ_FILTERS, player: "opponent", match: winning },
    "errors",
  );
  expect(theirs.match.resultOutcome).toEqual(["won"]);
  // Other cuts carry everything.
  expect(
    carryFilters({ ...EMPTY_VIZ_FILTERS, match: winning }, "rallyPlacement")
      .match,
  ).toEqual(winning);
});

test("Ball stays a pill on the return cuts, where Serve › Type means other points", () => {
  const ball = { ...EMPTY_VIZ_FILTERS, ball: ["first" as const] };
  expect(foldedMatchFilters(ball, "returnContact").folded).toEqual([]);
  expect(foldedMatchFilters(ball, "returnPlacement").match.serveType).toEqual(
    [],
  );
  expect(foldedMatchFilters(ball, "serve").folded).toEqual(["ball"]);
  // And the return nouns never read Serve › Type as "first-serve returns".
  const stats = computeVizStats(
    [],
    "returnContact",
    {
      ...EMPTY_VIZ_FILTERS,
      match: { ...EMPTY_MATCH_FILTERS, serveType: ["first"] },
    },
    true,
    undefined,
    DEFAULT_BANDS,
    "ft",
  );
  expect(stats.subtitle).not.toContain("first-serve");
});

test("switching player on Errors drops an Outcome that would empty it", () => {
  const state = {
    cut: "errors" as const,
    chart: "scatter" as const,
    viewId: null,
    filters: {
      ...EMPTY_VIZ_FILTERS,
      match: { ...EMPTY_MATCH_FILTERS, resultOutcome: ["lost" as const] },
    },
  };
  const theirs = courtFor(state, "opponent");
  expect(theirs.player).toBe("opponent");
  expect(theirs.match.resultOutcome).toEqual([]);
  // Off Errors the outcome is left alone.
  expect(
    courtFor({ ...state, cut: "serve" }, "opponent").match.resultOutcome,
  ).toEqual(["lost"]);
});
