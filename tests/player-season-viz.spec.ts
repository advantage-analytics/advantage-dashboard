import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  SEASON_CUT_LABEL,
  buildSeasonCards,
  buildSeasonLightbox,
  filterOptionPatches,
  mergeVizResults,
  mergeVizStats,
  optionCountKey,
  parseSeasonVizState,
  seasonMatchContext,
  statPickKey,
  type SeasonCard,
  type SeasonLightboxData,
  type SeasonVizMatch,
} from "@/lib/data/player-season-viz";
import type { ZoneStats } from "@/lib/data/serve-zones";
import { DEFAULT_BANDS, depthBandRows } from "@/lib/data/viz-bands";
import { defaultCutsFor } from "@/components/dashboard/matches/match-detail/shots/default-cuts";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import {
  statPickDotIds,
  type StatPick,
} from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import { CUT_LABEL } from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  computeVizStats,
  subjectFor,
  type Cut,
  type StatRow,
  type VizFilters,
  type VizStats,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { vizPoints } from "@/components/dashboard/matches/match-detail/shots/viz-points";
import {
  parseVizState,
  vizStateQuery,
  type VizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { wallSummaryFor } from "@/components/dashboard/matches/match-detail/shots/wall-summary";
import { RALLY_POINTS, rallyShot } from "./fixtures/viz-rally-points";
import { ASYMMETRIC_SERVES, servePoint } from "./fixtures/viz-serve-points";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The player profile's Visualizations tab (`lib/data/player-season-viz.ts`,
 * `profile-visualizations-view.tsx`, `season-viz-lightbox.tsx`): the match
 * report's wall cards and lightbox over a season, computed on the server.
 *
 * The rule under test is the fold's one promise — every season figure is
 * the SUM of what the report's own calculators say for each match, run with
 * THAT match's seat and context (guardrails §4) — so each test computes the
 * per-match parts with `computeViz` / `computeVizStats` / `wallSummaryFor`
 * / `statPickDotIds` itself and checks the season against their sum. Then
 * the view, rendered offline from the real modules, with the shell stubbed
 * to capture what the container hands it.
 *
 * Three matches share one body of points under different ids: in A the
 * player is PLAYER 1 (SwingVision, judged); in B PLAYER 2 (Advantage
 * Intelligence, judged — `vizPoints` names its aces); in C PLAYER 2 again,
 * unjudged. A fold that normalised seats, or read a judged match's errors
 * by the season's rule, would print different cards.
 */

const BANDS = { bands: DEFAULT_BANDS, unit: "ft" as const };
const DEPTH_ROWS = depthBandRows(DEFAULT_BANDS, "ft");
const NAMES = { you: "Maya Chen", opponent: "Opponents" };
const CUTS: Cut[] = [
  "serve",
  "returnPlacement",
  "returnContact",
  "rallyPosition",
  "rallyPlacement",
  "errors",
];

/* ── Fixtures ───────────────────────────────────────────────────────────── */

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

const BODY: MatchPoint[] = [
  ...ASYMMETRIC_SERVES,
  ...RALLY_POINTS,
  servePoint({ id: "out", result: "Out", won: false, depth: 9 }),
  errorPoint("ue-p1", "Forehand Unforced Error", true, {
    lateral: 0.5,
    depth: -0.3,
    result: "Net",
    shotType: "Forehand",
  }),
  errorPoint("fe-p1", "Backhand Forced Error", true, {
    lateral: 1,
    depth: 13,
    result: "Out",
    shotType: "Backhand",
  }),
  errorPoint("ue-p2", "Backhand Unforced Error", false, {
    lateral: 4.5,
    depth: 5,
    result: "Out",
    shotType: "Backhand",
  }),
  errorPoint("fe-p2", "Forehand Forced Error", false, {
    lateral: -1,
    depth: 12.5,
    result: "Out",
    shotType: "Forehand",
  }),
  {
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
  },
];

/** The same points under another match's ids — dot ids must stay unique
 *  across a season, as real point and shot ids are. */
function prefixed(points: MatchPoint[], prefix: string): MatchPoint[] {
  return points.map((p) => ({
    ...p,
    id: `${prefix}:${p.id}`,
    shots: p.shots?.map((s) => ({ ...s, id: `${prefix}:${s.id}` })),
  }));
}

const A: SeasonVizMatch = {
  matchId: "a",
  points: prefixed(BODY, "a"),
  isPlayer1: true,
  isDerived: false,
  errorSplitJudged: true,
};
const B: SeasonVizMatch = {
  matchId: "b",
  points: prefixed(
    BODY.filter((_, i) => i % 3 !== 0),
    "b",
  ),
  isPlayer1: false,
  isDerived: true,
  errorSplitJudged: true,
};
const C: SeasonVizMatch = {
  matchId: "c",
  points: prefixed(
    BODY.filter((_, i) => i % 2 === 0),
    "c",
  ),
  isPlayer1: false,
  isDerived: false,
  errorSplitJudged: false,
};

const JUDGED = [A, B];
const UNJUDGED = [A, C];

/* ── Per-match parts, computed the report's way ─────────────────────────── */

function partFor(m: SeasonVizMatch, cut: Cut, filters: VizFilters) {
  const points = vizPoints(m.points, m.isDerived);
  const ctx = seasonMatchContext(m);
  const subject = subjectFor(filters, m.isPlayer1);
  const result = computeViz(points, cut, filters, subject, "scatter", ctx);
  const stats = computeVizStats(
    points,
    cut,
    filters,
    subject,
    result,
    DEFAULT_BANDS,
    "ft",
    ctx,
  );
  return {
    points,
    ctx,
    subject,
    result,
    stats,
    summary: wallSummaryFor(cut, result, stats, DEPTH_ROWS),
  };
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

function rowOf(
  stats: VizStats,
  groupKey: string,
  rowKey: string,
): StatRow | null {
  return (
    stats.groups
      .find((g) => g.key === groupKey)
      ?.rows.find((r) => r.key === rowKey) ?? null
  );
}

function pickFor(cut: Cut, groupKey: string, row: StatRow): StatPick {
  return {
    group: cut === "serve" ? row.key.split("-")[0] : groupKey,
    row: row.key,
    label: row.label,
  };
}

/* ── The wall ───────────────────────────────────────────────────────────── */

test.describe("buildSeasonCards", () => {
  for (const [label, season, judged] of [
    ["judged season (A: player 1, B: player 2)", JUDGED, true],
    ["unjudged season (A judged, C unjudged)", UNJUDGED, false],
  ] as const) {
    for (const side of ["you", "opponent"] as const) {
      test(`${label}, ${side}: every count, segment and mark is the sum of the per-match parts`, () => {
        const cards = buildSeasonCards(season, side, BANDS);
        expect(cards.map((c) => c.name)).toEqual(
          defaultCutsFor(judged).map((c) => c.name),
        );
        for (const card of cards) {
          const parts = season.map((m) =>
            partFor(m, card.cut, card.state.filters),
          );
          // The pool and the marks: concatenated in match order, no meta.
          expect(card.total).toBe(sum(parts.map((p) => p.result.total)));
          expect(card.dots.map((d) => d.id)).toEqual(
            parts.flatMap((p) => p.result.dots.map((d) => d.id)),
          );
          expect(card.dots.every((d) => d.meta === undefined)).toBe(true);
          // The footer: the count and every split-bar segment.
          expect(card.summary.count).toBe(
            sum(parts.map((p) => p.summary.count)),
          );
          expect(card.summary.total).toBe(
            sum(parts.map((p) => p.summary.total)),
          );
          const keys = new Set(
            parts.flatMap((p) => p.summary.segments.map((s) => s.key)),
          );
          expect(new Set(card.summary.segments.map((s) => s.key))).toEqual(
            keys,
          );
          for (const segment of card.summary.segments) {
            const partSegments = parts.map(
              (p) =>
                p.summary.segments.find((s) => s.key === segment.key) ?? {
                  count: 0,
                  won: 0,
                },
            );
            expect(segment.count, `${card.key} ${segment.key}`).toBe(
              sum(partSegments.map((s) => s.count)),
            );
            expect(segment.won, `${card.key} ${segment.key}`).toBe(
              sum(partSegments.map((s) => s.won)),
            );
          }
          expect(sum(card.summary.segments.map((s) => s.count))).toBe(
            card.summary.count,
          );
          // The words follow the summed figures, by the card's own rule.
          const won = sum(card.summary.segments.map((s) => s.won));
          expect(card.summary.averagePct).toBe(
            card.summary.share || card.summary.count === 0
              ? null
              : Math.round((won / card.summary.count) * 100),
          );
          expect(card.summary.countLabel).toBe(
            card.cut === "errors"
              ? `${card.summary.count} total`
              : card.summary.count === card.summary.total
                ? `${card.summary.count} in`
                : `${card.summary.count} of ${card.summary.total} in`,
          );
          // What opening the card asks the URL for: the default cut, this side.
          const cut = defaultCutsFor(judged).find((c) => c.cut === card.cut)!;
          expect(card.state).toEqual({
            cut: card.cut,
            chart: cut.chart,
            filters: { ...EMPTY_VIZ_FILTERS, ...cut.filters, player: side },
            viewId: null,
          });
          expect(card.key).toBe(`${side}:${card.cut}`);
        }
      });
    }
  }

  test("a judged season's cards are the sum of buildDefaultTiles' own tiles, match by match", () => {
    const href = (s: VizState) => vizStateQuery(new URLSearchParams(), s);
    for (const side of ["you", "opponent"] as const) {
      const cards = buildSeasonCards(JUDGED, side, BANDS);
      const tiles = JUDGED.map((m) =>
        buildDefaultTiles(
          vizPoints(m.points, m.isDerived),
          {
            you: { isPlayer1: m.isPlayer1, name: "You" },
            opp: { isPlayer1: !m.isPlayer1, name: "Opp" },
          },
          href,
          seasonMatchContext(m),
          BANDS,
        ),
      );
      for (const card of cards) {
        const parts = tiles.map((t) => t.find((x) => x.key === card.key)!);
        expect(card.total).toBe(sum(parts.map((p) => p.total)));
        expect(card.dots.length).toBe(sum(parts.map((p) => p.dots.length)));
        expect(card.summary.count).toBe(
          sum(parts.map((p) => p.summary!.count)),
        );
        for (const segment of card.summary.segments) {
          expect(segment.count).toBe(
            sum(
              parts.map(
                (p) =>
                  p.summary!.segments.find((s) => s.key === segment.key)
                    ?.count ?? 0,
              ),
            ),
          );
        }
      }
    }
  });

  test("each match keeps its own seat: folding B as player 1 draws a different serve card", () => {
    const right = buildSeasonCards(JUDGED, "you", BANDS)[0];
    const wrong = buildSeasonCards(
      [A, { ...B, isPlayer1: true }],
      "you",
      BANDS,
    )[0];
    expect(right.cut).toBe("serve");
    expect(wrong.summary.segments).not.toEqual(right.summary.segments);
  });

  test("the errors card follows the season's judged rule, as the Statistics tab's Errors row does", () => {
    const judged = buildSeasonCards(JUDGED, "you", BANDS)[3];
    expect(judged.name).toBe("Unforced errors");
    expect(judged.state.filters.error).toEqual(["unforced"]);

    const unjudged = buildSeasonCards(UNJUDGED, "you", BANDS)[3];
    expect(unjudged.name).toBe("Errors");
    expect(unjudged.state.filters.error).toEqual(["unforced", "forced"]);
    // A's forced error counts on the unjudged season's Errors card — more
    // than A's unforced errors alone.
    const aUnforced = partFor(A, "errors", judged.state.filters).result.count;
    const aAll = partFor(A, "errors", unjudged.state.filters).result.count;
    expect(aAll).toBeGreaterThan(aUnforced);
    expect(unjudged.summary.count).toBe(
      aAll + partFor(C, "errors", unjudged.state.filters).result.count,
    );
  });

  test("no analyzed matches: four cards, every total 0, nothing counted", () => {
    const cards = buildSeasonCards([], "you", BANDS);
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.total).toBe(0);
      expect(card.dots).toEqual([]);
      expect(card.summary.count).toBe(0);
    }
  });
});

/* ── Merging ────────────────────────────────────────────────────────────── */

test.describe("merging one match with itself is the report's own answer", () => {
  for (const cut of CUTS) {
    for (const m of [A, B]) {
      test(`${cut}, ${m.matchId}: mergeVizStats keeps computeVizStats' rows, order and figures; mergeVizResults keeps the result`, () => {
        const filters: VizFilters = { ...EMPTY_VIZ_FILTERS, player: "you" };
        const { result, stats } = partFor(m, cut, filters);
        const mergedStats = mergeVizStats([stats], result.dots.length, 1);
        expect(mergedStats.groups).toEqual(stats.groups);
        expect(mergedStats.total).toBe(stats.total);
        expect(mergedStats.title).toBe(stats.title);
        const mergedResult = mergeVizResults(cut, [result]);
        expect(mergedResult).toEqual(result);
      });
    }
  }
});

/* ── The lightbox ───────────────────────────────────────────────────────── */

const STATES: { label: string; query: string }[] = [
  { label: "the First serves card", query: "cut=serve&ball=first" },
  { label: "First serves, Zone T", query: "cut=serve&ball=first&zone=t" },
  { label: "the Returns card", query: "cut=returnPlacement" },
  { label: "the Rally shots card", query: "cut=rallyPlacement" },
  { label: "the Unforced errors card", query: "cut=errors&verr=unforced" },
  {
    label: "the opponents' Returns, deuce court",
    query: "cut=returnPlacement&player=opponent&court=deuce",
  },
  { label: "a return-contact link", query: "cut=returnContact&chart=heat" },
];

test.describe("buildSeasonLightbox", () => {
  for (const { label, query } of STATES) {
    test(`${label}: result, statistics, per-row marks and option counts are sums of the per-match parts, and no point leaves`, () => {
      const state = parseVizState(new URLSearchParams(query), {
        errorSplitJudged: true,
      });
      const data = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
      expect(data).not.toBeNull();
      const cut = state.cut!;
      const parts = JUDGED.map((m) => partFor(m, cut, state.filters));

      // The court.
      expect(data.cut).toBe(cut);
      expect(data.chart).toBe(state.chart);
      expect(data.filters).toEqual(state.filters);
      expect(data.result.count).toBe(sum(parts.map((p) => p.result.count)));
      expect(data.result.total).toBe(sum(parts.map((p) => p.result.total)));
      expect(data.result.dots.map((d) => d.id)).toEqual(
        parts.flatMap((p) => p.result.dots.map((d) => d.id)),
      );
      expect(data.result.noun).toBe(parts[0].result.noun);
      if (cut === "serve") {
        const zones = data.result.zoneStats as Record<string, ZoneStats>;
        for (const [key, zone] of Object.entries(zones)) {
          const partZones = parts.map(
            (p) => (p.result.zoneStats as Record<string, ZoneStats>)[key],
          );
          expect(zone.count, key).toBe(sum(partZones.map((z) => z.count)));
          expect(zone.won, key).toBe(sum(partZones.map((z) => z.won)));
          expect(zone.ace, key).toBe(sum(partZones.map((z) => z.ace)));
          expect(zone.winPct, key).toBe(
            zone.count
              ? Math.round((100 * (zone.won + zone.ace)) / zone.count)
              : 0,
          );
        }
        expect(data.result.serveOutOrNetCount).toBe(
          sum(parts.map((p) => p.result.serveOutOrNetCount ?? 0)),
        );
      } else {
        expect(data.result.zoneStats).toBeNull();
      }

      // The Statistics column: every row the sum of its parts, the
      // percentage divided once.
      expect(data.stats.total).toBe(data.result.count);
      const share = data.result.dots.length;
      for (const group of data.stats.groups) {
        for (const row of group.rows) {
          const partRows = parts.map((p) => rowOf(p.stats, group.key, row.key));
          expect(partRows.some((r) => r !== null)).toBe(true);
          const count = sum(partRows.map((r) => r?.count ?? 0));
          const won = sum(partRows.map((r) => r?.won ?? 0));
          expect(row.count, `${group.key}/${row.key}`).toBe(count);
          expect(row.won, `${group.key}/${row.key}`).toBe(won);
          expect(row.winPct).toBe(
            row.share
              ? share === 0
                ? null
                : Math.round((count / share) * 100)
              : count === 0
                ? null
                : Math.round((won / count) * 100),
          );

          // Its marks: the stats' own rule per match, united.
          const pick = pickFor(cut, group.key, row);
          const ids = data.statRowDotIds[statPickKey(pick)];
          expect(ids, statPickKey(pick)).toBeDefined();
          const expected = parts.flatMap((p) => [
            ...statPickDotIds(
              p.points,
              cut,
              state.filters,
              p.subject,
              p.ctx,
              p.result.dots,
              pick,
              DEFAULT_BANDS,
            ),
          ]);
          expect([...ids].sort()).toEqual([...expected].sort());
        }
      }
      // Every part's row has a season row.
      for (const p of parts)
        for (const g of p.stats.groups)
          for (const r of g.rows)
            expect(
              rowOf(data.stats, g.key, r.key),
              `${g.key}/${r.key}`,
            ).not.toBeNull();

      // The Filters panel's option counts: exactly the panel's patches.
      const patches = filterOptionPatches(cut, true);
      expect(Object.keys(data.optionCounts).sort()).toEqual(
        patches.map(optionCountKey).sort(),
      );
      for (const patch of patches) {
        expect(data.optionCounts[optionCountKey(patch)]).toBe(
          sum(
            parts.map(
              (p) =>
                computeViz(
                  p.points,
                  cut,
                  { ...state.filters, ...patch },
                  p.subject,
                  "scatter",
                  p.ctx,
                ).count,
            ),
          ),
        );
      }

      // The sets there are to pick, across the season.
      expect(data.sets).toEqual(
        [...new Set(parts.flatMap((p) => p.points.map((x) => x.setNumber)))]
          .filter((n) => n > 0)
          .sort((a, b) => a - b),
      );
      expect(data.errorSplitJudged).toBe(true);
      expect(data.unit).toBe("ft");
      expect(data.subjectName).toBe(
        state.filters.player === "you" ? NAMES.you : NAMES.opponent,
      );

      // Nothing of a `MatchPoint` in the payload.
      const json = JSON.stringify(data);
      // (`"shots":[` — the point's shot rows; `noun: "shots"` is a word.)
      for (const field of [
        "wonByPlayer1",
        "serverIsPlayer1",
        '"shots":[',
        "pointNumber",
        "rallyLength",
      ])
        expect(json, field).not.toContain(field);
      // And nothing that will not serialize to the client.
      expect(JSON.parse(json)).toEqual(data);
    });
  }

  test("the words: the card's name while it holds the card's filters, the cut's once loosened, and the strip names what Clear removes", () => {
    const onCard = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=serve&ball=first")),
      BANDS,
      NAMES,
    )!;
    expect(onCard.title).toBe("First serves");
    expect(onCard.filterPhrases).toEqual([]);
    expect(onCard.panelActive).toBe(false);
    expect(onCard.hasFilters).toBe(true);
    expect(onCard.clearFilters).toEqual({
      ...EMPTY_VIZ_FILTERS,
      ball: ["first"],
      player: "you",
    });
    expect(onCard.subtitle).toMatch(
      /^Serve placement · Maya Chen · 2 matches · \d+ (of \d+ )?in(, \d+ of those \d+ won)?$/,
    );

    const narrowed = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=serve&ball=first&zone=t")),
      BANDS,
      NAMES,
    )!;
    expect(narrowed.title).toBe("First serves");
    expect(narrowed.filterPhrases).toEqual(["T"]);
    expect(narrowed.panelActive).toBe(true);
    expect(narrowed.clearFilters).toEqual(onCard.clearFilters);

    const loosened = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=serve&zone=t")),
      BANDS,
      NAMES,
    )!;
    expect(loosened.title).toBe(CUT_LABEL.serve);
    expect(loosened.filterPhrases).toEqual(["T"]);
    expect(loosened.clearFilters).toEqual({
      ...EMPTY_VIZ_FILTERS,
      player: "you",
    });

    const opponents = buildSeasonLightbox(
      JUDGED,
      parseVizState(
        new URLSearchParams("cut=errors&verr=unforced&player=opponent"),
      ),
      BANDS,
      NAMES,
    )!;
    expect(opponents.title).toBe("Unforced errors");
    expect(opponents.subjectName).toBe("Opponents");
    expect(opponents.subtitle).toMatch(
      /^Errors · Opponents · 2 matches · \d+ total$/,
    );
    expect(opponents.filterPhrases).toEqual([]);
  });

  test("an unjudged season reads Error type by its own rule: one Errors option, a forced link opens on every error", () => {
    const state = parseSeasonVizState(
      { cut: "errors", verr: "forced", tab: "visualizations" },
      false,
    );
    expect(state.filters.error).toEqual(["unforced", "forced"]);
    const data = buildSeasonLightbox(UNJUDGED, state, BANDS, NAMES)!;
    expect(data.errorSplitJudged).toBe(false);
    expect(data.title).toBe("Errors");
    // Error type is one "Errors" option (both kinds) and Double faults —
    // never Unforced or Forced alone; Score keeps its two.
    const keys = Object.keys(data.optionCounts).sort();
    expect(keys).toEqual(
      filterOptionPatches("errors", false).map(optionCountKey).sort(),
    );
    expect(keys).toContain("error=unforced|forced");
    expect(keys).toContain("error=doubleFault");
    expect(keys).not.toContain("error=unforced");
    expect(keys).not.toContain("error=forced");
    expect(data.result.count).toBe(
      sum(
        UNJUDGED.map((m) => partFor(m, "errors", state.filters).result.count),
      ),
    );
  });

  test("null on the wall and for a season with nothing analyzed", () => {
    expect(
      buildSeasonLightbox(
        JUDGED,
        parseVizState(new URLSearchParams("")),
        BANDS,
        NAMES,
      ),
    ).toBeNull();
    expect(
      buildSeasonLightbox(
        [],
        parseVizState(new URLSearchParams("cut=serve")),
        BANDS,
        NAMES,
      ),
    ).toBeNull();
  });

  test("parseSeasonVizState reads a page's searchParams as VizStateProvider reads the URL", () => {
    const record = {
      tab: "visualizations",
      cut: "serve",
      ball: "first",
      vset: ["1", "2"],
      zone: ["t", "wide"],
      nothing: undefined,
    };
    const params = new URLSearchParams(
      "tab=visualizations&cut=serve&ball=first&vset=1&vset=2&zone=t&zone=wide",
    );
    expect(parseSeasonVizState(record, true)).toEqual(
      parseVizState(params, { errorSplitJudged: true }),
    );
  });

  test("SEASON_CUT_LABEL is CUT_LABEL", () => {
    expect(SEASON_CUT_LABEL).toEqual(CUT_LABEL);
  });
});

/* ── The view, rendered ─────────────────────────────────────────────────── */

const VIEW =
  "src/components/dashboard/team/player-profile/profile-visualizations-view.tsx";
const CONTAINER =
  "src/components/dashboard/team/player-profile/season-viz-lightbox.tsx";

const passthrough = (tag: string) =>
  function Stub(props: Record<string, unknown>) {
    const { children, ...rest } = props;
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest))
      if (typeof value !== "function" && typeof value !== "object")
        attrs[key] = value;
    return React.createElement(tag, attrs, children as React.ReactNode);
  };

const fragment = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

type ShellProps = Record<string, unknown> & {
  statRowDots: (pick: StatPick) => Set<string> | null;
  filterPanel?: {
    countWith: (patch: Partial<VizFilters>) => number;
    errorSplitJudged: boolean;
  };
  result: { dots: unknown[] };
  filters: VizFilters;
  onClose: () => void;
  player?: { value: string; onChange: (player: "you" | "opponent") => void };
};

/**
 * The view, rendered to static markup with the shell stubbed to capture its
 * props. `replaced` collects every URL the store asked the router for, so a
 * handler the shell was given can be called and its write read back.
 * `errorSplitJudged` is the season's rule the page hands the view; the match
 * hook under it is stubbed `true`, so a test that passes `false` shows the
 * prop winning.
 */
function renderView(
  props: {
    analyzed: number;
    side: "you" | "opponent";
    cards: SeasonCard[];
    lightbox: SeasonLightboxData | null;
    errorSplitJudged?: boolean;
  },
  query: string,
) {
  const shellProps: ShellProps[] = [];
  const replaced: string[] = [];
  const loader = createLoader({
    // `vizStateQuery` builds a URLSearchParams per card href.
    globals: { URLSearchParams },
    stubs: {
      "next/navigation": {
        useSearchParams: () => new URLSearchParams(query),
        usePathname: () => "/dashboard/team/roster/p-maya",
        useRouter: () => ({
          replace(url: string) {
            replaced.push(url);
          },
          push() {},
          refresh() {},
        }),
      },
      "next/link": { __esModule: true, default: passthrough("a") },
      "@/lib/ui/use-mounted": { useMounted: () => true },
      // The store's one read outside its own tree — a season has no match
      // filters provider, and the real hook answers `true` without one.
      "@/components/dashboard/matches/match-detail/match-filters/provider": {
        useErrorSplitJudged: () => true,
      },
      "@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell": {
        VizLightboxShell: (p: ShellProps) => {
          shellProps.push(p);
          return React.createElement("div", {
            "data-testid": "season-shell",
            "data-title": p.title,
          });
        },
      },
      // The pending frame's dialog, inline: a Radix portal renders nothing
      // on the server, and this reads the frame's markup, not its mounting.
      "@radix-ui/react-dialog": {
        Root: fragment,
        Portal: fragment,
        Overlay: passthrough("div"),
        Content: passthrough("div"),
        Title: passthrough("h2"),
        Close: passthrough("button"),
      },
      "@/components/ui/tooltip": { TooltipProvider: fragment },
      "@/components/dashboard/shared/chrome-tooltip": {
        ChromeTooltip: fragment,
      },
    },
  });
  const { ProfileVisualizationsView } = loader.load(VIEW) as {
    ProfileVisualizationsView: React.ComponentType<
      typeof props & {
        playerName: string;
        firstName: string;
        errorSplitJudged: boolean;
      }
    >;
  };
  const html = renderToStaticMarkup(
    React.createElement(ProfileVisualizationsView, {
      playerName: "Maya Chen",
      firstName: "Maya",
      errorSplitJudged: true,
      ...props,
    }),
  );
  return { html, shellProps, replaced };
}

/** The query a `router.replace` URL carries. */
const queryOf = (url: string) => new URL(url, "http://test").searchParams;

/** Anything in `value` that looks like a `MatchPoint[]`. */
function carriesPoints(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    if (
      value.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          ("wonByPlayer1" in item || "pointNumber" in item || "shots" in item),
      )
    )
      return true;
    return value.some((item) => carriesPoints(item, seen));
  }
  return Object.values(value as Record<string, unknown>).some((v) =>
    carriesPoints(v, seen),
  );
}

test.describe("the Visualizations view, rendered", () => {
  test("nothing analyzed: the wall's strip over the redesign's empty wall with a season sentence — no card, no 0, no 0%", () => {
    const { html, shellProps } = renderView(
      {
        analyzed: 0,
        side: "you",
        cards: buildSeasonCards([], "you", BANDS),
        lightbox: null,
      },
      "tab=visualizations",
    );
    // The strip: Default | Saved · You | Opponent · the legend.
    expect(html).toContain('aria-label="View"');
    expect(html).toContain('aria-label="Player"');
    expect(html).toContain('aria-label="Legend"');
    for (const chip of ["Default", "Saved", "You", "Opponent"])
      expect(html).toContain(`>${chip}</button>`);
    // The empty wall, in the card's hairline, with a sentence about the season.
    expect(html).toContain('data-testid="season-viz-empty"');
    expect(html).toContain('role="status"');
    expect(html).toContain("No analyzed matches yet.");
    expect(html).toContain("Maya’s matches");
    expect(html).not.toContain('role="list"');
    expect(html).not.toContain("data-viz-court-art");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("0%");
    expect(html).not.toContain(" of 0");
    // No lightbox.
    expect(html).not.toContain("season-shell");
    expect(shellProps).toEqual([]);
  });

  test("a season: four wall cards in the wall's grid, each a link into the URL, and the opened card's shell with no points, footer, band editor or draft", () => {
    const state = parseVizState(new URLSearchParams("cut=serve&ball=first"), {
      errorSplitJudged: true,
    });
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    const lightbox = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
    const { html, shellProps } = renderView(
      { analyzed: 2, side: "you", cards, lightbox },
      "tab=visualizations&cut=serve&ball=first",
    );

    // The wall: `viz-wall.tsx`'s grid and list, one `WallCard` per card with
    // something in its pool — a card with nothing drawable is not drawn (the
    // wall's own rule, never an empty court). This fixture leaves one of the
    // four empty for the player.
    const visible = cards.filter((card) => card.total > 0);
    const hidden = cards.filter((card) => card.total === 0);
    expect(visible.length).toBeGreaterThanOrEqual(3);
    expect(hidden.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain(
      'class="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2"',
    );
    expect(html).toContain('aria-label="Default views"');
    expect(html.split('role="listitem"').length - 1).toBe(visible.length);
    expect(html.split("data-viz-court-art").length - 1).toBe(visible.length);
    for (const card of visible) {
      expect(html).toContain(
        `${card.name}, Maya Chen: ${card.summary.countLabel}`,
      );
    }
    for (const card of hidden) expect(html).not.toContain(`${card.name},`);
    // Each card is a link into the tab's URL state (`?cut=`, kept `?tab=`).
    expect(html).toContain(
      'href="/dashboard/team/roster/p-maya?tab=visualizations&amp;cut=serve&amp;ball=first"',
    );
    for (const card of visible) expect(html).toContain(`cut=${card.cut}`);

    // The lightbox container mounted the shell once, with what the server
    // computed and nothing else.
    expect(html).toContain('data-testid="season-shell"');
    expect(shellProps).toHaveLength(1);
    const props = shellProps[0];
    expect(props.title).toBe("First serves");
    expect(props.cut).toBe("serve");
    for (const omitted of [
      "pointList",
      "footer",
      "bandEditor",
      "draft",
      "controls",
      "whereFor",
    ])
      expect(props[omitted], omitted).toBeUndefined();
    expect(props.result).toBe(lightbox.result);
    expect(props.stats).toBe(lightbox.stats);
    expect(props.player).toBeDefined();
    expect(carriesPoints(props)).toBe(false);
    // The two lookups, turned into the shell's functions.
    const pick = { group: "deuce", row: "deuce-t", label: "Deuce T" };
    expect([...props.statRowDots(pick)!].sort()).toEqual(
      [...lightbox.statRowDotIds[statPickKey(pick)]].sort(),
    );
    expect(
      props.statRowDots({ group: "ad", row: "ad-wide", label: "x" })?.size,
    ).toBe(lightbox.statRowDotIds["ad/ad-wide"].length);
    expect(props.filterPanel!.countWith({ zone: ["t"] })).toBe(
      lightbox.optionCounts["zone=t"],
    );
    expect(props.filterPanel!.countWith({ pressure: ["break"] })).toBe(
      lightbox.optionCounts["pressure=break"],
    );
  });

  test("a card the server has not answered for draws the shell's frame as a loading status — on the first open, and when the last answer is another card's", () => {
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    const serveState = parseVizState(
      new URLSearchParams("cut=serve&ball=first"),
      { errorSplitJudged: true },
    );
    const serve = buildSeasonLightbox(JUDGED, serveState, BANDS, NAMES)!;

    // The first open: the URL names a card, the server has answered nothing
    // yet. Until T9's fix a click showed nothing at all here.
    const first = renderView(
      { analyzed: 2, side: "you", cards, lightbox: null },
      "tab=visualizations&cut=serve&ball=first",
    );
    expect(first.shellProps).toEqual([]);
    expect(first.html).not.toContain("season-shell");
    const frame = first.html.slice(
      first.html.indexOf('data-testid="season-lightbox-pending"'),
    );
    expect(frame.length).toBeGreaterThan(0);
    // The DS loading contract (`empty-and-loading.md`): one status for the
    // region, named for the cut; the dialog named the same; bars hidden and
    // from the primitive; a token, never a hex; no spinner. Close is real.
    expect(frame.split('role="status"').length - 1).toBe(1);
    expect(frame).toContain('aria-label="Loading Serve placement"');
    expect(frame).toContain(">Loading Serve placement</h2>");
    expect(frame).toContain("data-pending-bar");
    expect(frame).toContain("motion-safe:animate-pulse");
    expect(frame).toContain('aria-hidden="true"');
    expect(frame).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(frame).not.toContain("animate-spin");
    expect(frame).toContain('aria-label="Close"');
    // The shell's own frame: its overlay (drawn before the box), its box,
    // its two columns.
    expect(first.html).toContain("fixed inset-0 z-50");
    expect(frame).toContain("w-[min(1212px,calc(100vw-32px))]");
    expect(frame).toContain("md:w-[340px]");
    expect(frame).not.toContain("data-court-stage");

    // The serve card was closed and the Errors card clicked before the
    // server answered: `data` is still the serve court. The frame again —
    // never the serve court under the errors filters.
    const next = renderView(
      { analyzed: 2, side: "you", cards, lightbox: serve },
      "tab=visualizations&cut=errors&verr=unforced",
    );
    expect(next.shellProps).toEqual([]);
    expect(next.html).toContain('aria-label="Loading Errors"');

    // Another chart of the same cut is another court too.
    const zones = renderView(
      { analyzed: 2, side: "you", cards, lightbox: serve },
      "tab=visualizations&cut=serve&ball=first&chart=zones",
    );
    expect(zones.shellProps).toEqual([]);
    expect(zones.html).toContain('aria-label="Loading Serve placement"');

    // The answer for the card asked for: the shell, no frame.
    const landed = renderView(
      { analyzed: 2, side: "you", cards, lightbox: serve },
      "tab=visualizations&cut=serve&ball=first",
    );
    expect(landed.shellProps).toHaveLength(1);
    expect(landed.html).not.toContain("season-lightbox-pending");

    // Closing the frame goes where closing the shell goes: the wall, on the
    // wall's own player.
    const pendingClose = first.html.indexOf('aria-label="Close"');
    expect(pendingClose).toBeGreaterThan(-1);
  });

  test("the wall keeps its own player: a You | Opponent switch inside the card rewrites the URL's player, and closing writes the wall's back", () => {
    // A hard load of the opponents' Returns card: the wall's player is the
    // card's side (what the server drew the cards for), and the wall's chip
    // under the card reads so.
    const state = parseVizState(
      new URLSearchParams("cut=returnPlacement&player=opponent"),
      { errorSplitJudged: true },
    );
    const cards = buildSeasonCards(JUDGED, "opponent", BANDS);
    const lightbox = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
    const { html, shellProps, replaced } = renderView(
      { analyzed: 2, side: "opponent", cards, lightbox },
      "tab=visualizations&cut=returnPlacement&player=opponent",
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>Opponent<\/button>/);
    expect(shellProps).toHaveLength(1);
    const shell = shellProps[0];
    expect(shell.player!.value).toBe("opponent");

    // The switch inside the card: the URL's player becomes the card's.
    shell.player!.onChange("you");
    expect(replaced).toHaveLength(1);
    expect(queryOf(replaced[0]).get("cut")).toBe("returnPlacement");
    expect(queryOf(replaced[0]).get("player")).toBeNull();

    // Close: no cut, and the player is the WALL's — the one it had when the
    // card opened — not the one just switched to inside it.
    shell.onClose();
    expect(replaced).toHaveLength(2);
    expect(queryOf(replaced[1]).get("cut")).toBeNull();
    expect(queryOf(replaced[1]).get("player")).toBe("opponent");
    expect(queryOf(replaced[1]).get("tab")).toBe("visualizations");

    // The view's wiring: the wall's player is the view's own state, handed
    // to the wall's chip and to the lightbox's close alike, and the wall
    // never reads the store's player while a card is open.
    const source = readFileSync(VIEW, "utf8");
    expect(source).toContain("useState<PlayerFilter>");
    expect(source).toContain("player={wallPlayer}");
    expect(source).toContain("wallPlayer={wallPlayer}");
    expect(source).toMatch(
      /state\.cut === null && state\.filters\.player !== wallPlayer/,
    );
  });

  test("the store reads ?verr= by the season's rule, as the server does: on an unjudged season Unforced opens on every error in the browser too", () => {
    const query = "tab=visualizations&cut=errors&verr=unforced";

    // Unjudged: the server collapsed `unforced` to both kinds, and so must
    // the store's optimistic filters — the match hook under it says `true`.
    const unjudgedState = parseSeasonVizState(
      { cut: "errors", verr: "unforced" },
      false,
    );
    const unjudged = buildSeasonLightbox(
      UNJUDGED,
      unjudgedState,
      BANDS,
      NAMES,
    )!;
    const a = renderView(
      {
        analyzed: 2,
        side: "you",
        cards: buildSeasonCards(UNJUDGED, "you", BANDS),
        lightbox: unjudged,
        errorSplitJudged: false,
      },
      query,
    );
    expect(a.shellProps).toHaveLength(1);
    expect(a.shellProps[0].filters.error).toEqual(["unforced", "forced"]);
    expect(a.shellProps[0].filters).toEqual(unjudged.filters);
    expect(a.shellProps[0].filterPanel!.errorSplitJudged).toBe(false);

    // Judged: the same link keeps Unforced alone, on both ends.
    const judgedState = parseSeasonVizState(
      { cut: "errors", verr: "unforced" },
      true,
    );
    const judged = buildSeasonLightbox(JUDGED, judgedState, BANDS, NAMES)!;
    const b = renderView(
      {
        analyzed: 2,
        side: "you",
        cards: buildSeasonCards(JUDGED, "you", BANDS),
        lightbox: judged,
        errorSplitJudged: true,
      },
      query,
    );
    expect(b.shellProps[0].filters.error).toEqual(["unforced"]);
    expect(b.shellProps[0].filters).toEqual(judged.filters);
  });

  test("the container's source names no point: no MatchPoint, no points prop, none of the omitted slots", () => {
    const source = readFileSync(CONTAINER, "utf8");
    expect(source).not.toContain("MatchPoint");
    expect(source).not.toMatch(/\bpoints\b/);
    for (const slot of ["pointList", "footer", "bandEditor", "draft"])
      expect(source).not.toMatch(new RegExp(`\\b${slot}=`));
    // Every change goes through the URL store.
    expect(source).toContain("useVizState");
    expect(source).toContain("setState(");
    expect(source).not.toContain("computeViz");
  });
});

/* ── A Visualizations request ───────────────────────────────────────────── */

const PAGE = "src/app/dashboard/team/roster/[playerId]/page.tsx";
const DEFERRED =
  "src/components/dashboard/team/player-profile/profile-statistics-deferred.tsx";

test.describe("a Visualizations request renders the courts alone", () => {
  const source = readFileSync(PAGE, "utf8");
  const page = source.slice(
    source.indexOf("export default async function PlayerProfilePage"),
  );
  const pageBody = page.slice(0, page.indexOf("\n}\n"));

  test("the page reads ?tab= once on the server and, for Visualizations, skips the Statistics body and reads the courts' season", () => {
    expect(pageBody).toContain(
      'parseProfileView(query[PROFILE_VIEW_PARAM]) === "visualizations"',
    );
    // The Statistics slot: the deferred stand-in on a courts-only request,
    // the Suspense-wrapped body otherwise.
    expect(pageBody).toMatch(
      /courtsOnly \? \(\s*<ProfileStatisticsDeferred \/>\s*\) : \(\s*<Suspense/,
    );
    // Both season readers on the page pick the loader by it, so the points
    // are read once per request and no lob file on a courts-only one.
    expect(pageBody.split("courtsOnly={courtsOnly}").length - 1).toBe(2);
    for (const reader of ["AnalyzedCount", "ProfileVisualizationsBody"]) {
      expect(source).toMatch(
        new RegExp(
          `async function ${reader}[\\s\\S]*?courtsOnly\\s*\\?\\s*getPlayerSeasonCourts\\(programId, playerId\\)\\s*:\\s*getPlayerSeason\\(programId, playerId\\)`,
        ),
      );
    }
    // The season's Error-type rule is the one the store gets.
    expect(source).toMatch(
      /const errorSplitJudged = seasonErrorSplitJudged\(season\.perMatch\);[\s\S]*parseSeasonVizState\(query, errorSplitJudged\)[\s\S]*errorSplitJudged=\{errorSplitJudged\}/,
    );
  });

  test("ProfileStatisticsDeferred shows nothing under Visualizations, and the Statistics skeleton plus one refresh once Statistics shows", () => {
    const render = (query: string) => {
      const loader = createLoader({
        stubs: {
          "next/navigation": {
            useSearchParams: () => new URLSearchParams(query),
            usePathname: () => "/dashboard/team/roster/p-maya",
            useRouter: () => ({ refresh() {}, replace() {}, push() {} }),
          },
          "next/image": { __esModule: true, default: passthrough("img") },
          "next/link": { __esModule: true, default: passthrough("a") },
          "framer-motion": {
            useReducedMotion: () => true,
            motion: new Proxy(
              {},
              { get: (_, tag) => passthrough(String(tag)) },
            ),
            AnimatePresence: fragment,
          },
        },
      });
      const { ProfileStatisticsDeferred } = loader.load(DEFERRED) as {
        ProfileStatisticsDeferred: React.ComponentType;
      };
      return renderToStaticMarkup(
        React.createElement(ProfileStatisticsDeferred),
      );
    };

    // Visualizations is the view: nothing in the Statistics slot.
    expect(render("tab=visualizations&cut=serve")).toBe("");
    // Statistics is: the skeleton the first load draws, in the tab's panel.
    const shown = render("cut=serve");
    expect(shown).toContain('role="tabpanel"');
    expect(shown).toContain('aria-label="Loading statistics"');
    expect(shown).toContain("data-pending-bar");
    expect(shown).not.toContain("<button");

    // And the refresh that brings the body: asked once, on mount, through
    // the router — never a navigation that would change the URL.
    const deferred = readFileSync(DEFERRED, "utf8");
    expect(deferred).toMatch(
      /useEffect\(\(\) => \{\s*router\.refresh\(\);\s*\}, \[router\]\)/,
    );
    expect(deferred).not.toContain("router.replace");
    expect(deferred).not.toContain("router.push");
    expect(deferred).toContain('<ProfileViewWhen view="statistics">');
  });
});
