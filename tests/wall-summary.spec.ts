import { expect, test } from "@playwright/test";
import {
  DEFAULT_CUTS,
  defaultCutsFor,
} from "@/components/dashboard/matches/match-detail/shots/default-cuts";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  computeVizStats,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  lightboxCountLine,
  wallSegmentReadout,
  wallSummaryFor,
} from "@/components/dashboard/matches/match-detail/shots/wall-summary";
import {
  parseVizState,
  vizStateQuery,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { DEFAULT_BANDS, depthBandRows } from "@/lib/data/viz-bands";
import { ASYMMETRIC_SERVES, servePoint } from "./fixtures/viz-serve-points";
import { RALLY_POINTS } from "./fixtures/viz-rally-points";

const POINTS = [
  ...ASYMMETRIC_SERVES,
  ...RALLY_POINTS,
  servePoint({ id: "out", result: "Out", won: false, depth: 9 }),
];
const SIDES = {
  you: { name: "P1", isPlayer1: true },
  opp: { name: "P2", isPlayer1: false },
};
const href = (s: Parameters<typeof vizStateQuery>[1]) =>
  vizStateQuery(new URLSearchParams(), s);
const BANDS = { bands: DEFAULT_BANDS, unit: "ft" as const };

test("the wall has four cuts, in order, one per card", () => {
  expect(DEFAULT_CUTS.map((c) => [c.cut, c.name])).toEqual([
    ["serve", "First serves"],
    ["returnPlacement", "Returns"],
    ["rallyPlacement", "Rally shots"],
    ["errors", "Unforced errors"],
  ]);
  expect(defaultCutsFor(false).map((c) => c.name)).toEqual([
    "First serves",
    "Returns",
    "Rally shots",
    "Errors",
  ]);
  // First serves keeps its filter; the errors cut keeps errorsJudgedIn's rule.
  expect(DEFAULT_CUTS[0].filters).toEqual({ ball: ["first"] });
  expect(DEFAULT_CUTS[3].filters).toEqual({ error: ["unforced"] });
});

test("eight tiles, four per player, each with a summary when bands are passed", () => {
  const tiles = buildDefaultTiles(POINTS, SIDES, href, undefined, BANDS);
  expect(tiles.map((t) => t.key)).toEqual([
    "you:serve",
    "you:returnPlacement",
    "you:rallyPlacement",
    "you:errors",
    "opponent:serve",
    "opponent:returnPlacement",
    "opponent:rallyPlacement",
    "opponent:errors",
  ]);
  for (const tile of tiles) expect(tile.summary).toBeDefined();
  expect(buildDefaultTiles(POINTS, SIDES, href).every((t) => !t.summary)).toBe(
    true,
  );
});

test("every card's split bar sums to its count, and its count to computeViz/computeVizStats", () => {
  const tiles = buildDefaultTiles(POINTS, SIDES, href, undefined, BANDS);
  for (const tile of tiles) {
    const summary = tile.summary!;
    const sum = summary.segments.reduce((n, s) => n + s.count, 0);
    expect(sum).toBe(summary.count);
    const result = computeViz(
      POINTS,
      tile.cut,
      tile.state.filters,
      tile.subject === "you",
    );
    expect(summary.total).toBe(result.count);
    const stats = computeVizStats(
      POINTS,
      tile.cut,
      tile.state.filters,
      tile.subject === "you",
      result,
      DEFAULT_BANDS,
      "ft",
    );
    if (tile.cut === "serve") {
      // In play = every drawable serve less the out/net ones.
      expect(summary.count).toBe(
        result.count - (result.serveOutOrNetCount ?? 0),
      );
    } else if (tile.cut === "errors") {
      // The label counts what the bar draws.
      expect(summary.countLabel).toBe(`${summary.count} total`);
      expect(summary.count).toBe(
        stats.groups
          .find((g) => g.key === "miss")!
          .rows.reduce((n, r) => n + r.count, 0),
      );
    } else {
      // The Statistics rows' own denominator.
      const group = stats.groups.find((g) =>
        tile.cut === "returnPlacement"
          ? g.key === "direction"
          : g.key === "depth",
      )!;
      expect(summary.count).toBe(group.rows.reduce((n, r) => n + r.count, 0));
    }
    if (tile.cut !== "errors") {
      expect(summary.countLabel).toBe(
        summary.count === summary.total
          ? `${summary.count} in`
          : `${summary.count} of ${summary.total} in`,
      );
    }
  }
});

test("a serve card's T/Body/Wide segments are the Zone filter's own points", () => {
  for (const isPlayer1 of [true, false]) {
    const filters = { ...EMPTY_VIZ_FILTERS, ball: ["first"] as const };
    const result = computeViz(POINTS, "serve", filters, isPlayer1);
    const summary = wallSummaryFor(
      "serve",
      result,
      computeVizStats(
        POINTS,
        "serve",
        filters,
        isPlayer1,
        result,
        DEFAULT_BANDS,
        "ft",
      ),
      depthBandRows(DEFAULT_BANDS, "ft"),
    );
    expect(summary.segments.map((s) => s.label)).toEqual(["T", "Body", "Wide"]);
    for (const segment of summary.segments) {
      const zoned = computeViz(
        POINTS,
        "serve",
        { ...filters, zone: [segment.key as "t" | "body" | "wide"] },
        isPlayer1,
      );
      const inPlay = zoned.count - (zoned.serveOutOrNetCount ?? 0);
      expect(segment.count).toBe(inPlay);
    }
  }
});

test("the segment readout: won and the card's average, or the share of errors", () => {
  const tiles = buildDefaultTiles(POINTS, SIDES, href, undefined, BANDS);
  const serve = tiles.find((t) => t.key === "you:serve")!.summary!;
  const seg = serve.segments.find((s) => s.count > 0)!;
  const readout = wallSegmentReadout(serve, seg, "your", "first serves");
  expect(readout.title).toBe(`${seg.label} · ${seg.count} in play`);
  expect(readout.line1).toBe(`${seg.won} won · ${seg.pct}%`);
  expect(readout.line2).toBe(
    `Average ${serve.averagePct}% across all ${serve.count}`,
  );
  const errors = wallSummaryFor(
    "errors",
    { count: 4 },
    {
      title: "",
      subtitle: "",
      sentence: null,
      total: 4,
      groups: [
        {
          key: "miss",
          label: "Miss",
          rows: [
            {
              key: "wide",
              label: "Wide",
              count: 1,
              won: 0,
              winPct: 25,
              share: true,
            },
            {
              key: "net",
              label: "Net",
              count: 3,
              won: 0,
              winPct: 75,
              share: true,
            },
          ],
        },
      ],
    },
    [],
  );
  expect(errors.segments.map((s) => s.key)).toEqual(["net", "wide"]);
  expect(errors.averagePct).toBeNull();
  expect(
    wallSegmentReadout(errors, errors.segments[0], "their", "unforced errors"),
  ).toEqual({
    title: "Net · 3 errors",
    line1: "75% of their unforced errors",
    line2: null,
  });
});

test("the wall's player is URL-backed and is the only key the wall keeps", () => {
  const wall = parseVizState(
    new URLSearchParams("tab=shots&player=opponent&vset=2&ball=first"),
  );
  expect(wall.cut).toBeNull();
  expect(wall.filters).toEqual({ ...EMPTY_VIZ_FILTERS, player: "opponent" });
  expect(vizStateQuery(new URLSearchParams("tab=shots"), wall)).toBe(
    "tab=shots&player=opponent",
  );
  expect(
    vizStateQuery(new URLSearchParams("tab=shots"), {
      ...wall,
      filters: EMPTY_VIZ_FILTERS,
    }),
  ).toBe("tab=shots");
});

const statsOf = (
  key: string,
  rows: { key: string; count: number; won: number; share?: boolean }[],
) => ({
  title: "",
  subtitle: "",
  sentence: null,
  total: rows.reduce((n, r) => n + r.count, 0),
  groups: [
    {
      key,
      label: null,
      rows: rows.map((r) => ({
        ...r,
        label: r.key,
        winPct: r.count === 0 ? null : Math.round((100 * r.won) / r.count),
      })),
    },
  ],
});

test("the errors card's 'N total' is the sum of its own segments, whatever the result count says", () => {
  const summary = wallSummaryFor(
    "errors",
    // A result count that disagrees with the drawn rows can't leak into the label.
    { count: 9 },
    statsOf("miss", [
      { key: "net", count: 3, won: 0, share: true },
      { key: "long", count: 2, won: 0, share: true },
      { key: "in", count: 1, won: 0, share: true },
    ]),
    [],
  );
  expect(summary.countLabel).toBe("6 total");
  expect(summary.segments.reduce((n, s) => n + s.count, 0)).toBe(6);
});

test("the lightbox count line drops the won clause when nothing landed in", () => {
  const nothingIn = statsOf("direction", [
    { key: "crosscourt", count: 0, won: 0 },
    { key: "middle", count: 0, won: 0 },
    { key: "dtl", count: 0, won: 0 },
  ]);
  expect(
    lightboxCountLine(
      "returnPlacement",
      { count: 4, noun: "returns" },
      nothingIn,
      [],
    ),
  ).toBe("0 of 4 in");
  const someIn = statsOf("direction", [
    { key: "crosscourt", count: 2, won: 1 },
    { key: "middle", count: 1, won: 1 },
    { key: "dtl", count: 0, won: 0 },
  ]);
  expect(
    lightboxCountLine(
      "returnPlacement",
      { count: 4, noun: "returns" },
      someIn,
      [],
    ),
  ).toBe("3 of 4 in, 2 of those 3 won");
});
