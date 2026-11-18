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
import {
  BASELINE,
  MATCH as APPROACH_MATCH,
  p as netPoint,
  s as netShot,
  withoutLanding,
} from "./fixtures/approach-points";

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

test("the wall has six cuts, in order, one per card", () => {
  expect(DEFAULT_CUTS.map((c) => [c.cut, c.name])).toEqual([
    ["serve", "All serves"],
    ["returnPlacement", "Returns"],
    ["returnContact", "Return contact"],
    ["rallyPlacement", "Rally shots"],
    ["approaches", "Approaches"],
    ["errors", "Unforced errors"],
  ]);
  expect(defaultCutsFor(false).map((c) => [c.cut, c.name])).toEqual([
    ["serve", "All serves"],
    ["returnPlacement", "Returns"],
    ["returnContact", "Return contact"],
    ["rallyPlacement", "Rally shots"],
    ["approaches", "Approaches"],
    ["errors", "Errors"],
  ]);
  // All serves holds no filter (first and second); the errors cut keeps
  // errorsJudgedIn's rule.
  expect(DEFAULT_CUTS[0].filters).toEqual({});
  expect(DEFAULT_CUTS[5].filters).toEqual({ error: ["unforced"] });
  // Approaches opens on approach shots alone, judged or not, as a scatter.
  for (const cuts of [DEFAULT_CUTS, defaultCutsFor(false)]) {
    const approaches = cuts.find((c) => c.cut === "approaches")!;
    expect(approaches.chart).toBe("scatter");
    expect(approaches.filters).toEqual({ entry: ["approach"] });
  }
});

test("twelve tiles, six per player, each with a summary when bands are passed", () => {
  const tiles = buildDefaultTiles(POINTS, SIDES, href, undefined, BANDS);
  expect(tiles.map((t) => t.key)).toEqual([
    "you:serve",
    "you:returnPlacement",
    "you:returnContact",
    "you:rallyPlacement",
    "you:approaches",
    "you:errors",
    "opponent:serve",
    "opponent:returnPlacement",
    "opponent:returnContact",
    "opponent:rallyPlacement",
    "opponent:approaches",
    "opponent:errors",
  ]);
  expect(tiles.filter((t) => t.subject === "you")).toHaveLength(6);
  expect(tiles.filter((t) => t.subject === "opponent")).toHaveLength(6);
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
    if (tile.cut === "approaches") {
      // Every approach counts, drawn or not; the wings hold the drawn ones.
      expect(summary.count + summary.notDrawn).toBe(summary.total);
      expect(summary.countLabel).toBe(
        `${summary.total} ${summary.total === 1 ? "approach" : "approaches"}`,
      );
    } else if (tile.cut === "serve") {
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
    if (tile.cut === "returnContact") {
      // Every return has a contact point: a count, never "in", and the
      // bands in order from inside the baseline to furthest behind it.
      expect(summary.countLabel).toBe(
        `${summary.count} ${summary.count === 1 ? "return" : "returns"}`,
      );
      expect(summary.keyLead).toBe("Struck");
      expect(summary.segments.map((seg) => seg.key)).toEqual([
        "inside",
        "near",
        "far",
      ]);
    } else if (tile.cut !== "errors" && tile.cut !== "approaches") {
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

test("the Opponent cards are the other seat's own: marks and counts from the opposite isPlayer1", () => {
  // "You" is player 2 here, so the Opponent cards must read player 1.
  const sides = {
    you: { name: "P2", isPlayer1: false },
    opp: { name: "P1", isPlayer1: true },
  };
  const tiles = buildDefaultTiles(POINTS, sides, href, undefined, BANDS);
  let compared = 0;
  for (const tile of tiles) {
    const seatIsP1 = tile.subject === "you" ? false : true;
    const own = computeViz(POINTS, tile.cut, tile.state.filters, seatIsP1);
    const other = computeViz(POINTS, tile.cut, tile.state.filters, !seatIsP1);
    expect(tile.dots.map((d) => d.id)).toEqual(own.dots.map((d) => d.id));
    expect(tile.total).toBe(own.total);
    expect(tile.summary!.total).toBe(own.count);
    if (tile.subject === "opponent" && own.count !== other.count) compared++;
    expect(tile.playerName).toBe(tile.subject === "you" ? "P2" : "P1");
  }
  // The fixture's two seats differ, so the check had something to tell apart.
  expect(compared).toBeGreaterThan(0);
});

/* ── Approaches ─────────────────────────────────────────────────────────── */

/** You approach (shot 4) and the landing went unrecorded: counted, not drawn. */
const UNPLACED = netPoint("unplaced", {
  server: 2,
  winner: 1,
  resultType: "Volley Winner",
  shots: [
    netShot(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    netShot(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    netShot(3, false, "Backhand", { cy: 22, ly: 2 }),
    netShot(4, true, "Forehand", { cy: 3, lx: null, ly: null }),
    netShot(5, false, "Backhand", { cy: 22, ly: 6 }),
    netShot(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
  ],
});

const approachSummary = (points: typeof APPROACH_MATCH) => {
  const tiles = buildDefaultTiles(points, SIDES, href, undefined, BANDS);
  const tile = tiles.find((t) => t.key === "you:approaches")!;
  const filters = tile.state.filters;
  const result = computeViz(points, "approaches", filters, true);
  const stats = computeVizStats(
    points,
    "approaches",
    filters,
    true,
    result,
    DEFAULT_BANDS,
    "ft",
  );
  return { tile, result, stats, summary: tile.summary! };
};

test("the approaches card: To backhand / Middle / To forehand, summing to its count, led by 'Won x of n'", () => {
  const { tile, result, stats, summary } = approachSummary(APPROACH_MATCH);
  expect(summary).toEqual(
    wallSummaryFor(
      "approaches",
      result,
      stats,
      depthBandRows(DEFAULT_BANDS, "ft"),
    ),
  );
  expect(summary.segments.map((seg) => [seg.key, seg.label])).toEqual([
    ["backhand", "To backhand"],
    ["middle", "Middle"],
    ["forehand", "To forehand"],
  ]);
  expect(summary.segments.reduce((n, seg) => n + seg.count, 0)).toBe(
    summary.count,
  );
  // Every approach here has a landing: the card counts what the court draws.
  expect(result.count).toBeGreaterThan(0);
  expect(summary.count).toBe(result.count);
  expect(summary.count).toBe(tile.dots.length);
  // Each wing is the Approach to row's own points and wins.
  const wings = stats.groups.find((g) => g.key === "approach-to")!.rows;
  for (const seg of summary.segments) {
    const row = wings.find((r) => r.key === seg.key)!;
    expect([seg.count, seg.won]).toEqual([row.count, row.won]);
  }
  const won = tile.dots.filter((d) => d.outcome === "won").length;
  expect(summary.keyLead).toBe(`Won ${won} of ${result.count}`);
  expect(summary.keyLead).toBe(`Won ${stats.kpi!.won} of ${stats.kpi!.count}`);
  expect(summary.countLabel).toBe(
    `${result.count} ${result.count === 1 ? "approach" : "approaches"}`,
  );
});

test("the approaches count line names the points not drawn, and only when there are some", () => {
  const allDrawn = approachSummary(APPROACH_MATCH).summary;
  expect(allDrawn.notDrawn).toBe(0);
  expect(allDrawn.countNote).toBeNull();

  const { tile, result, stats, summary } = approachSummary([
    ...APPROACH_MATCH,
    UNPLACED,
  ]);
  // Counted in the card's number and the KPI, drawn nowhere.
  expect(result.count).toBe(allDrawn.total + 1);
  expect(tile.dots.map((d) => d.id)).not.toContain(UNPLACED.id);
  expect(summary.total).toBe(result.count);
  expect(summary.count).toBe(tile.dots.length);
  expect(summary.notDrawn).toBe(1);
  expect(summary.countNote).toBe("1 not drawn: no landing recorded");
  expect(summary.countLabel).toBe(`${result.count} approaches`);
  // The segments still sum to the card's (drawn) count.
  expect(summary.segments.reduce((n, seg) => n + seg.count, 0)).toBe(
    summary.count,
  );
  // The lead counts the undrawn point too: it is the KPI's, won-of-shown.
  expect(summary.keyLead).toBe(`Won ${stats.kpi!.won} of ${stats.kpi!.count}`);
  expect(stats.kpi!.count).toBe(result.count);

  // Two undrawn points: the plural reads the same.
  const two = approachSummary([
    ...APPROACH_MATCH,
    UNPLACED,
    { ...UNPLACED, id: "unplaced-2" },
  ]).summary;
  expect(two.countNote).toBe("2 not drawn: no landing recorded");

  // The lightbox header counts every approach and its wins.
  expect(
    lightboxCountLine(
      "approaches",
      result,
      stats,
      depthBandRows(DEFAULT_BANDS, "ft"),
    ),
  ).toBe(`${result.count} approaches, ${stats.kpi!.won} won`);
});

test("approaches counted but none drawn: no wing segments, just the count, the note and the lead", () => {
  // Every point's landings gone (real match 9e4d293e): the approaches still
  // count, but no wing is known, so the card names none — never three 0s.
  const { result, stats, summary } = approachSummary(
    APPROACH_MATCH.map(withoutLanding),
  );
  const n = result.count;
  expect(n).toBeGreaterThan(0);
  expect(summary.count).toBe(0);
  expect(summary.total).toBe(n);
  expect(summary.segments).toEqual([]);
  for (const label of ["To backhand", "Middle", "To forehand"])
    expect(summary.segments.map((seg) => seg.label)).not.toContain(label);
  expect(summary.countLabel).toBe(
    `${n} ${n === 1 ? "approach" : "approaches"}`,
  );
  expect(summary.notDrawn).toBe(n);
  expect(summary.countNote).toBe(`${n} not drawn: no landing recorded`);
  expect(summary.keyLead).toBe(`Won ${stats.kpi!.won} of ${n}`);
  expect(stats.kpi!.count).toBe(n);
});

test("approaches partly drawn: all three wings, summing to the drawn ones only, the note naming the rest", () => {
  const { tile, result, summary } = approachSummary([
    ...APPROACH_MATCH,
    withoutLanding({ ...UNPLACED, id: "bare-1" }),
    withoutLanding({ ...UNPLACED, id: "bare-2" }),
  ]);
  expect(summary.segments.map((seg) => seg.label)).toEqual([
    "To backhand",
    "Middle",
    "To forehand",
  ]);
  const drawn = tile.dots.length;
  expect(drawn).toBeGreaterThan(0);
  expect(summary.segments.reduce((n, seg) => n + seg.count, 0)).toBe(drawn);
  expect(summary.count).toBe(drawn);
  expect(result.count).toBe(drawn + 2);
  expect(summary.notDrawn).toBe(2);
  expect(summary.countNote).toBe("2 not drawn: no landing recorded");
});

test("a subject with no net points gets an approaches tile counting 0, so the wall's empty rule holds", () => {
  const tiles = buildDefaultTiles([BASELINE], SIDES, href, undefined, BANDS);
  for (const subject of ["you", "opponent"] as const) {
    const tile = tiles.find((t) => t.key === `${subject}:approaches`)!;
    expect(tile.total).toBe(0);
    expect(tile.dots).toEqual([]);
    expect(tile.summary!.count).toBe(0);
    expect(tile.summary!.total).toBe(0);
    expect(tile.summary!.countLabel).toBe("0 approaches");
    expect(tile.summary!.keyLead).toBe("Won 0 of 0");
    expect(tile.summary!.countNote).toBeNull();
  }
  // Points elsewhere but no net points: the approaches tile alone is 0.
  const mixed = buildDefaultTiles(POINTS, SIDES, href, undefined, BANDS);
  expect(mixed.find((t) => t.key === "you:approaches")!.total).toBe(0);
});
