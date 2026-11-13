import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  SEASON_CUT_LABEL,
  buildSeasonCards,
  buildSeasonLightbox,
  buildSeasonViewCards,
  courtSignature,
  decodeStatRowDots,
  encodeStatRowDots,
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
import { bandZonesFor } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import type { ZoneStats } from "@/lib/data/serve-zones";
import { DEFAULT_BANDS, depthBandRows } from "@/lib/data/viz-bands";
import { defaultCutsFor } from "@/components/dashboard/matches/match-detail/shots/default-cuts";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import {
  statPickDotIds,
  type StatPick,
} from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  LIGHTBOX_BOX_CLASS,
  LIGHTBOX_OVERLAY_CLASS,
} from "@/components/dashboard/matches/match-detail/shots/lightbox-frame";
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
              : card.cut === "returnContact"
                ? `${card.summary.count} ${card.summary.count === 1 ? "return" : "returns"}`
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
    const judged = buildSeasonCards(JUDGED, "you", BANDS).find(
      (c) => c.cut === "errors",
    )!;
    expect(judged.name).toBe("Unforced errors");
    expect(judged.state.filters.error).toEqual(["unforced"]);

    const unjudged = buildSeasonCards(UNJUDGED, "you", BANDS).find(
      (c) => c.cut === "errors",
    )!;
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

  test("no analyzed matches: five cards, every total 0, nothing counted", () => {
    const cards = buildSeasonCards([], "you", BANDS);
    expect(cards).toHaveLength(5);
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
          const indices = data.statRowDots[statPickKey(pick)];
          expect(indices, statPickKey(pick)).toBeDefined();
          // Positions into the court's marks, ascending, each once.
          expect(indices).toEqual([...new Set(indices)].sort((a, b) => a - b));
          for (const i of indices)
            expect(i >= 0 && i < data.result.dots.length).toBe(true);
          const ids = decodeStatRowDots(data.result.dots, indices);
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
          // The same marks on court as the ids the stats' rule picks: an id
          // the rule picks that is not drawn is never asked about.
          const drawn = new Set(data.result.dots.map((d) => d.id));
          expect([...ids].sort()).toEqual(
            [...new Set(expected.filter((id) => drawn.has(id)))].sort(),
          );
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
    // The serve card holds no filters of its own (every serve, first and
    // second), so a bare `?cut=serve` is the card, and Clear leaves nothing.
    const serves = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=serve")),
      BANDS,
      NAMES,
    )!;
    expect(serves.title).toBe("All serves");
    expect(serves.filterPhrases).toEqual([]);
    expect(serves.panelActive).toBe(false);
    expect(serves.hasFilters).toBe(false);
    expect(serves.clearFilters).toEqual({
      ...EMPTY_VIZ_FILTERS,
      player: "you",
    });
    expect(serves.subtitle).toMatch(
      /^Serve placement · Maya Chen · 2 matches · \d+ (of \d+ )?in(, \d+ of those \d+ won)?$/,
    );
    const servesNarrowed = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=serve&zone=t")),
      BANDS,
      NAMES,
    )!;
    expect(servesNarrowed.title).toBe("All serves");
    expect(servesNarrowed.filterPhrases).toEqual(["T"]);
    expect(servesNarrowed.panelActive).toBe(true);
    expect(servesNarrowed.clearFilters).toEqual(serves.clearFilters);

    // A card with filters of its own (Unforced errors): its name while the
    // court holds them, the cut's once one is loosened.
    const onCard = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=errors&verr=unforced")),
      BANDS,
      NAMES,
    )!;
    expect(onCard.title).toBe("Unforced errors");
    expect(onCard.filterPhrases).toEqual([]);
    expect(onCard.panelActive).toBe(false);
    expect(onCard.hasFilters).toBe(true);
    expect(onCard.clearFilters).toEqual({
      ...EMPTY_VIZ_FILTERS,
      error: ["unforced"],
      player: "you",
    });

    const loosened = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=errors&verr=forced")),
      BANDS,
      NAMES,
    )!;
    expect(loosened.title).toBe(CUT_LABEL.errors);
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

  test("the subtitle's subject word follows the player switch when the chips' words are handed in; the phrases keep the name", () => {
    const state = parseVizState(new URLSearchParams("cut=serve"));
    const own = buildSeasonLightbox(JUDGED, state, BANDS, NAMES, [], {
      you: "You",
      opponent: "Opponents",
    })!;
    expect(own.subtitle).toMatch(/^Serve placement · You · 2 matches · /);
    // The card's subject (its aria name, the phrases) is still the player.
    expect(own.subjectName).toBe(NAMES.you);
    const coach = buildSeasonLightbox(JUDGED, state, BANDS, NAMES, [], {
      you: "Chen",
      opponent: "Opponents",
    })!;
    expect(coach.subtitle).toMatch(/^Serve placement · Chen · 2 matches · /);
    // Left out, the subtitle keeps the names, as before.
    expect(buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!.subtitle).toMatch(
      /^Serve placement · Maya Chen · 2 matches · /,
    );
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
  stats: { groups: unknown[] };
  onClose: () => void;
  player?: { value: string; onChange: (player: "you" | "opponent") => void };
  pending?: boolean;
};

/**
 * The view, rendered to static markup with the shell stubbed to capture its
 * props. `replaced` collects every URL the store asked the router for, so a
 * handler the shell was given can be called and its write read back.
 * `errorSplitJudged` is the season's rule the page hands the view; the match
 * hook under it is stubbed `true`, so a test that passes `false` shows the
 * prop winning.
 *
 * Two passes: the shell is `React.lazy`, so the first render suspends on
 * its import and draws the chunk frame (`firstPass`); a tick later the
 * module has landed and the same tree renders the shell (`html`). The chunk
 * frame's portal is rendered inline (`createPortal` stubbed), as the frame
 * itself is what is read.
 */
async function renderView(
  props: {
    analyzed: number;
    side: "you" | "opponent";
    cards: SeasonCard[];
    savedCards?: SeasonCard[];
    lightbox: SeasonLightboxData | null;
    errorSplitJudged?: boolean;
    saveView?: {
      savedViews: unknown[];
      workspaceName: string;
      workspaceRole?: string;
    };
  },
  query: string,
) {
  const shellProps: ShellProps[] = [];
  const replaced: string[] = [];
  const pushed: string[] = [];
  const loader = createLoader({
    // `vizStateQuery` builds a URLSearchParams per card href; the chunk
    // frame portals onto `document.body`.
    globals: { URLSearchParams, document: { body: {} } },
    stubs: {
      "react-dom": {
        ...ReactDOM,
        createPortal: (children: React.ReactNode) => children,
      },
      "next/navigation": {
        useSearchParams: () => new URLSearchParams(query),
        usePathname: () => "/dashboard/team/roster/p-maya",
        useRouter: () => ({
          replace(url: string) {
            replaced.push(url);
          },
          push(url: string) {
            pushed.push(url);
          },
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
      "@/components/ui/tooltip": { TooltipProvider: fragment },
      "@/components/dashboard/shared/chrome-tooltip": {
        ChromeTooltip: fragment,
      },
      // The Save popover reaches the server action module; the button's
      // props are what is read here.
      "@/components/dashboard/matches/match-detail/shots/save-as-view-button": {
        SaveAsViewButton: (p: Record<string, unknown>) =>
          React.createElement("button", {
            "data-testid": "save-as-view",
            "data-cut": p.cut,
            "data-workspace": p.workspaceName,
          }),
      },
    },
  });
  const { ProfileVisualizationsView } = loader.load(VIEW) as {
    ProfileVisualizationsView: React.ComponentType<
      typeof props & {
        playerName: string;
        firstName: string;
        chipLabels: { you: string; opponent: string };
        errorSplitJudged: boolean;
      }
    >;
  };
  const element = React.createElement(ProfileVisualizationsView, {
    playerName: "Maya Chen",
    firstName: "Maya",
    chipLabels: { you: "Chen", opponent: "Opponents" },
    errorSplitJudged: true,
    savedCards: [],
    ...props,
  });
  const firstPass = renderToStaticMarkup(element);
  await new Promise((resolve) => setTimeout(resolve, 0));
  shellProps.length = 0;
  replaced.length = 0;
  const html = renderToStaticMarkup(element);
  return { html, firstPass, shellProps, replaced, pushed };
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

/* ── Saved views over the season ───────────────────────────────────────── */

const SAVED_VIEWS = [
  {
    id: "v-second",
    name: "Second serves",
    cut: "serve" as const,
    chart: "scatter" as const,
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["second"] } as VizFilters,
    order: 0,
  },
  {
    id: "v-opp-errors",
    name: "Their unforced",
    cut: "errors" as const,
    chart: "scatter" as const,
    filters: {
      ...EMPTY_VIZ_FILTERS,
      error: ["unforced"],
      player: "opponent",
    } as VizFilters,
    order: 1,
  },
];

test.describe("buildSeasonViewCards", () => {
  test("one card per saved view, in order, for the view's own player — every count the sum of the per-match parts", () => {
    const cards = buildSeasonViewCards(JUDGED, SAVED_VIEWS, BANDS);
    expect(cards.map((c) => [c.key, c.name, c.subject])).toEqual([
      ["view:v-second", "Second serves", "you"],
      ["view:v-opp-errors", "Their unforced", "opponent"],
    ]);
    for (const [i, card] of cards.entries()) {
      const view = SAVED_VIEWS[i];
      expect(card.state).toEqual({
        cut: view.cut,
        chart: view.chart,
        filters: view.filters,
        viewId: view.id,
      });
      const parts = JUDGED.map((m) => partFor(m, card.cut, card.state.filters));
      expect(card.total).toBe(sum(parts.map((p) => p.result.total)));
      expect(card.dots.map((d) => d.id)).toEqual(
        parts.flatMap((p) => p.result.dots.map((d) => d.id)),
      );
      expect(card.summary.count).toBe(sum(parts.map((p) => p.summary.count)));
    }
  });

  test("an Unforced view on an unjudged season reads every error, as its link parses there", () => {
    const [, errors] = buildSeasonViewCards(UNJUDGED, SAVED_VIEWS, BANDS);
    expect(errors.state.filters.error).toEqual(
      parseSeasonVizState({ cut: "errors", verr: "unforced" }, false).filters
        .error,
    );
    expect(errors.state.filters.error).toEqual(["unforced", "forced"]);
  });

  test("no saved views, no cards", () => {
    expect(buildSeasonViewCards(JUDGED, [], BANDS)).toEqual([]);
  });
});

test.describe("buildSeasonLightbox over a saved view", () => {
  const open = (query: string, views = SAVED_VIEWS) =>
    buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams(query)),
      BANDS,
      NAMES,
      views,
    )!;

  test("the view's name while the court holds its filters, which the strip does not repeat and Clear keeps", () => {
    const data = open("cut=serve&ball=second&view=v-second");
    expect(data.title).toBe("Second serves");
    expect(data.filterPhrases).toEqual([]);
    expect(data.panelActive).toBe(false);
    expect(data.clearFilters).toEqual({
      ...EMPTY_VIZ_FILTERS,
      ball: ["second"],
      player: "you",
    });
  });

  test("edited (?vfrom=): still the view's name with the extra filter named; loosened, the cut's", () => {
    const narrowed = open("cut=serve&ball=second&zone=t&vfrom=v-second");
    expect(narrowed.title).toBe("Second serves");
    expect(narrowed.filterPhrases).toEqual(["T"]);
    expect(narrowed.panelActive).toBe(true);

    const loosened = open("cut=serve&vfrom=v-second");
    expect(loosened.title).toBe(SEASON_CUT_LABEL.serve);
    expect(loosened.clearFilters).toEqual({
      ...EMPTY_VIZ_FILTERS,
      player: "you",
    });
  });

  test("a view the viewer cannot see, or on another cut, is no baseline", () => {
    expect(open("cut=serve&ball=second&view=v-second", []).title).toBe(
      "All serves",
    );
    expect(open("cut=returnPlacement&vfrom=v-second").title).toBe(
      SEASON_CUT_LABEL.returnPlacement,
    );
  });
});

test.describe("the Visualizations view, rendered", () => {
  test("nothing analyzed: the wall's strip over the redesign's empty wall with a season sentence — no card, no 0, no 0%", async () => {
    const { html, shellProps } = await renderView(
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
    for (const chip of ["Default", "Saved", "Chen", "Opponents"])
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

  test("a season: four wall cards in the wall's grid, each a link into the URL, and the opened card's shell with no points, footer, band editor or draft", async () => {
    const state = parseVizState(new URLSearchParams("cut=serve"), {
      errorSplitJudged: true,
    });
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    const lightbox = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
    const { html, shellProps } = await renderView(
      { analyzed: 2, side: "you", cards, lightbox },
      "tab=visualizations&cut=serve",
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
      'class="grid grid-cols-1 items-start gap-4 @min-[640px]:grid-cols-2"',
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
      'href="/dashboard/team/roster/p-maya?tab=visualizations&amp;cut=serve"',
    );
    for (const card of visible) expect(html).toContain(`cut=${card.cut}`);

    // The lightbox container mounted the shell once, with what the server
    // computed and nothing else.
    expect(html).toContain('data-testid="season-shell"');
    expect(shellProps).toHaveLength(1);
    const props = shellProps[0];
    expect(props.title).toBe("All serves");
    expect(props.cut).toBe("serve");
    for (const omitted of ["pointList", "footer", "bandEditor", "draft"])
      expect(props[omitted], omitted).toBeUndefined();
    // The chart menu is the one control (pass 4); no band editor.
    expect(typeof props.controls).toBe("function");
    expect(props.result).toBe(lightbox.result);
    expect(props.stats).toBe(lightbox.stats);
    expect(props.player).toBeDefined();
    expect(carriesPoints(props)).toBe(false);
    // The two lookups, turned into the shell's functions.
    const pick = { group: "deuce", row: "deuce-t", label: "Deuce T" };
    expect([...props.statRowDots(pick)!].sort()).toEqual(
      [
        ...decodeStatRowDots(
          lightbox.result.dots,
          lightbox.statRowDots[statPickKey(pick)],
        ),
      ].sort(),
    );
    expect(
      props.statRowDots({ group: "ad", row: "ad-wide", label: "x" })?.size,
    ).toBe(
      decodeStatRowDots(
        lightbox.result.dots,
        lightbox.statRowDots["ad/ad-wide"],
      ).size,
    );
    expect(props.filterPanel!.countWith({ zone: ["t"] })).toBe(
      lightbox.optionCounts["zone=t"],
    );
    expect(props.filterPanel!.countWith({ pressure: ["break"] })).toBe(
      lightbox.optionCounts["pressure=break"],
    );
  });

  test("each season mark knows its match: the readout's where and \"vs Opponent · date\" lines, and the second click opens that match's Video tab on that point", async () => {
    const dated = [
      { ...A, date: "2026-11-03", opponent: "Lee Park" },
      { ...B, date: "2026-10-20", opponent: "Sam Ortiz" },
    ];
    const state = parseVizState(new URLSearchParams("cut=serve"), {
      errorSplitJudged: true,
    });
    const lightbox = buildSeasonLightbox(dated, state, BANDS, NAMES)!;
    // The compact lookups: one match row per match, one five-number ref per
    // mark — and still no point-like array leaves the server.
    expect(lightbox.matches).toEqual([
      {
        id: "a",
        date: "2026-11-03",
        opponentName: "Lee Park",
        hasPlayableVideo: false,
      },
      {
        id: "b",
        date: "2026-10-20",
        opponentName: "Sam Ortiz",
        hasPlayableVideo: true,
      },
    ]);
    expect(lightbox.dotPoints).toHaveLength(lightbox.result.dots.length);
    expect(carriesPoints(lightbox)).toBe(false);

    const { shellProps, pushed } = await renderView(
      { analyzed: 2, side: "you", cards: [], lightbox },
      "tab=visualizations&cut=serve",
    );
    const props = shellProps[0] as ShellProps & {
      whereFor: (pointId: string) => string | null;
      matchFor: (dot: unknown) => string | null;
      watch: {
        canWatch: (dot: unknown) => boolean;
        onWatch: (dot: unknown, phrases: string[]) => void;
      };
    };
    expect(carriesPoints(props)).toBe(false);
    const dots = lightbox.result.dots;
    const inA = dots.findIndex((d) => d.id.startsWith("a:"));
    const inB = dots.findIndex((d) => d.id.startsWith("b:"));
    const dotA = dots[inA];
    const dotB = dots[inB];
    expect(props.matchFor(dotA)).toBe("vs Lee Park · Nov 3");
    expect(props.matchFor(dotB)).toBe("vs Sam Ortiz · Oct 20");

    // The where line, read off the match's own point, in its own seat.
    const pointB = B.points.find((p) => p.id === dotB.meta!.pointId)!;
    const server =
      pointB.serverIsPlayer1 === B.isPlayer1 ? "Chen" : "Sam Ortiz";
    expect(props.whereFor(dotB.meta!.pointId!)).toBe(
      `Set ${pointB.setNumber} · Game ${pointB.gameNumber} · ${server} serving`,
    );

    // A (SwingVision, nothing to play): no second click.
    expect(props.watch.canWatch(dotA)).toBe(false);
    props.watch.onWatch(dotA, []);
    expect(pushed).toEqual([]);
    // B: its Video tab, on that one point, named by the card.
    expect(props.watch.canWatch(dotB)).toBe(true);
    props.watch.onWatch(dotB, ["deuce T"]);
    expect(pushed).toHaveLength(1);
    const url = new URL(pushed[0], "http://test");
    expect(url.pathname).toBe("/dashboard/matches/b");
    expect(url.searchParams.get("tab")).toBe("film");
    expect(url.searchParams.get("pn")).toBe(String(pointB.pointNumber));
    expect(url.searchParams.get("pnl")).toBe(`${lightbox.title} · Deuce T`);
  });

  test("a card the server has not answered for is the shell, pending — on the first open, and when the last answer is another card's; before the shell's chunk, the frame by hand", async () => {
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    const serveState = parseVizState(new URLSearchParams("cut=serve"), {
      errorSplitJudged: true,
    });
    const serve = buildSeasonLightbox(JUDGED, serveState, BANDS, NAMES)!;

    // The first open: the URL names a card, the server has answered nothing
    // yet. Until the fix a click showed nothing at all here.
    const first = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: null },
      "tab=visualizations&cut=serve",
    );

    // Before the shell's chunk has loaded: the frame drawn by hand — a
    // modal named for the cut, a status inside it, bars from the primitive,
    // a real Close. The DS loading contract (`empty-and-loading.md`): one
    // status, hidden bars, a token, no spinner; the shell's own geometry,
    // no court, no enter fade.
    const frame = first.firstPass.slice(
      first.firstPass.indexOf('data-testid="lightbox-chunk-pending"'),
    );
    expect(frame.length).toBeGreaterThan(0);
    expect(first.firstPass).not.toContain("season-shell");
    expect(frame.split('role="status"').length - 1).toBe(1);
    // A modal in its own right while it shows: named for the cut, focusable
    // so it can take focus on mount (and give it back to the card as it
    // leaves), Tab kept inside by its own rule.
    expect(first.firstPass).toMatch(
      /<div[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Loading Serve placement"[^>]*tabindex="-1"[^>]*data-testid="lightbox-chunk-pending"/,
    );
    expect(
      first.firstPass.split('aria-label="Loading Serve placement"').length - 1,
    ).toBe(2);
    expect(frame).toContain("data-pending-bar");
    expect(frame).toContain("motion-safe:animate-pulse");
    expect(frame).toContain('aria-hidden="true"');
    expect(frame).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(frame).not.toContain("animate-spin");
    expect(frame).not.toContain("animate-in");
    expect(frame).toContain('aria-label="Close"');
    // The scrim is drawn before the box; both are the shell's own classes.
    expect(first.firstPass).toContain(LIGHTBOX_OVERLAY_CLASS);
    expect(frame).toContain(LIGHTBOX_BOX_CLASS);
    expect(frame).toContain("md:w-[340px]");
    expect(frame).not.toContain("data-court-stage");

    // With the chunk: the shell itself, `pending`, over an empty court — the
    // one dialog that will show the court when the answer lands, so the
    // opener it records is the card.
    expect(first.html).not.toContain("lightbox-chunk-pending");
    expect(first.shellProps).toHaveLength(1);
    const shell = first.shellProps[0];
    expect(shell.pending).toBe(true);
    expect(shell.cut).toBe("serve");
    expect(shell.title).toBe("Serve placement");
    expect(shell.result.dots).toEqual([]);
    expect(shell.stats.groups).toEqual([]);
    expect(
      shell.statRowDots({ group: "deuce", row: "deuce-t", label: "Deuce T" }),
    ).toBeNull();
    expect(shell.filterPanel!.countWith({ zone: ["t"] })).toBe(0);
    expect(shell.player).toBeDefined();
    expect(carriesPoints(shell)).toBe(false);

    // The serve card was closed and the Errors card clicked before the
    // server answered: `data` is still the serve court. Pending again, for
    // Errors — never the serve court under the errors filters.
    const next = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: serve },
      "tab=visualizations&cut=errors&verr=unforced",
    );
    expect(next.shellProps).toHaveLength(1);
    expect(next.shellProps[0].pending).toBe(true);
    expect(next.shellProps[0].cut).toBe("errors");
    expect(next.shellProps[0].title).toBe("Errors");
    expect(next.shellProps[0].result.dots).toEqual([]);

    // Another chart of the same cut is another court too.
    const zones = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: serve },
      "tab=visualizations&cut=serve&chart=zones",
    );
    expect(zones.shellProps[0].pending).toBe(true);
    expect(zones.shellProps[0].chart).toBe("zones");

    // The answer for the card asked for: the shell with the court, not
    // pending.
    const landed = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: serve },
      "tab=visualizations&cut=serve",
    );
    expect(landed.shellProps).toHaveLength(1);
    expect(landed.shellProps[0].pending).toBe(false);
    expect(landed.shellProps[0].result).toBe(serve.result);
  });

  test("an answer from before this opening is never shown: the serve card closed with a filter on and reopened before the close landed is pending, not the filtered court", async () => {
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    // The server's last answer: the serve card with Zone T ticked.
    const filtered = buildSeasonLightbox(
      JUDGED,
      parseVizState(new URLSearchParams("cut=serve&ball=first&zone=t"), {
        errorSplitJudged: true,
      }),
      BANDS,
      NAMES,
    )!;
    expect(filtered.filters.zone).toEqual(["t"]);

    // Reopened on the card's own filters: the cut and chart match, the
    // filters do not — pending, never the filtered court as the default.
    const reopened = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: filtered },
      "tab=visualizations&cut=serve",
    );
    expect(reopened.shellProps).toHaveLength(1);
    expect(reopened.shellProps[0].pending).toBe(true);
    expect(reopened.shellProps[0].result.dots).toEqual([]);
    expect(reopened.shellProps[0].filterPhrases).toEqual([]);

    // The same answer where it was asked for — a hard load of the filtered
    // link — is the court, filters and all: the store's parse of the URL
    // and the server's echo serialise alike.
    const asked = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: filtered },
      "tab=visualizations&cut=serve&ball=first&zone=t",
    );
    expect(asked.shellProps).toHaveLength(1);
    expect(asked.shellProps[0].pending).toBe(false);
    expect(asked.shellProps[0].result).toBe(filtered.result);
    expect(asked.shellProps[0].filterPhrases).toEqual(filtered.filterPhrases);

    // And the wall's own switch inside the card is part of the ask: a court
    // answered for the other player's filters is not this card's.
    const theirs = buildSeasonLightbox(
      JUDGED,
      parseVizState(
        new URLSearchParams("cut=serve&ball=first&player=opponent"),
        { errorSplitJudged: true },
      ),
      BANDS,
      NAMES,
    )!;
    const mine = await renderView(
      { analyzed: 2, side: "you", cards, lightbox: theirs },
      "tab=visualizations&cut=serve",
    );
    expect(mine.shellProps[0].pending).toBe(true);

    // The rule, in the source: every court named since the card opened is
    // remembered, and the answer must echo one of them.
    const source = readFileSync(CONTAINER, "utf8");
    expect(source).toMatch(
      /opening\.asked\.has\(\s*courtSignature\(\s*data\.cut,\s*data\.chart,\s*data\.filters,\s*errorSplitJudged,\s*data\.season,?\s*\)/,
    );
    expect(source).toMatch(/asked: new Set\(\[\.\.\.opening\.asked, asked\]\)/);
  });

  test("a court signature is canonical: options ticked against the option order, and the Error type under the season's rule, sign as the server's echo does", () => {
    const base = parseVizState(new URLSearchParams("cut=errors"), {
      errorSplitJudged: true,
    }).filters;
    // The store appends in click order; the server's echo comes through
    // parseVizState, sorted into option order.
    const clicked = {
      ...base,
      error: ["unforced", "doubleFault", "forced"],
    } as VizFilters;
    const echoed = parseVizState(
      new URLSearchParams(
        "cut=errors&verr=unforced&verr=doubleFault&verr=forced",
      ),
      { errorSplitJudged: true },
    ).filters;
    expect(echoed.error).not.toEqual(clicked.error);
    expect(courtSignature("errors", "scatter", clicked, true)).toBe(
      courtSignature("errors", "scatter", echoed, true),
    );

    const rally = { ...base, rally: ["long", "short"] } as VizFilters;
    const rallyEcho = { ...base, rally: ["short", "long"] } as VizFilters;
    expect(courtSignature("rallyPlacement", "scatter", rally, true)).toBe(
      courtSignature("rallyPlacement", "scatter", rallyEcho, true),
    );

    const serve = { ...base, ball: ["second", "first"] } as VizFilters;
    const serveEcho = { ...base, ball: ["first", "second"] } as VizFilters;
    expect(courtSignature("serve", "scatter", serve, true)).toBe(
      courtSignature("serve", "scatter", serveEcho, true),
    );

    // Unjudged season: a lone Unforced collapses to the all-errors pair on
    // both sides, as the server parses it.
    const lone = { ...base, error: ["unforced"] } as VizFilters;
    const pair = { ...base, error: ["unforced", "forced"] } as VizFilters;
    expect(courtSignature("errors", "scatter", lone, false)).toBe(
      courtSignature("errors", "scatter", pair, false),
    );

    // Different courts still differ.
    expect(courtSignature("serve", "scatter", serve, true)).not.toBe(
      courtSignature(
        "serve",
        "scatter",
        { ...base, ball: ["first"] } as VizFilters,
        true,
      ),
    );
  });

  test("a season with nothing analyzed opens nothing: a ?cut= in a stale link draws neither frame", async () => {
    const { html, firstPass, shellProps } = await renderView(
      {
        analyzed: 0,
        side: "you",
        cards: buildSeasonCards([], "you", BANDS),
        lightbox: null,
      },
      "tab=visualizations&cut=serve",
    );
    expect(firstPass).not.toContain("lightbox-chunk-pending");
    expect(html).not.toContain("lightbox-chunk-pending");
    expect(shellProps).toEqual([]);
    expect(html).toContain("No analyzed matches yet.");
    expect(html).not.toContain("aria-busy");
  });

  test("the wall reads busy while the server's cards are another side's than the chip's, and not once they are", async () => {
    const yours = buildSeasonCards(JUDGED, "you", BANDS);
    // The Opponent chip was clicked: the store (and the chip) say opponent,
    // the server's cards are still yours.
    const stale = await renderView(
      { analyzed: 2, side: "you", cards: yours, lightbox: null },
      "tab=visualizations&player=opponent",
    );
    expect(stale.html).toMatch(/aria-pressed="true"[^>]*>Opponents<\/button>/);
    expect(stale.html).toContain('aria-busy="true"');
    expect(stale.html).toContain("pointer-events-none");
    expect(stale.html).toContain('data-stale=""');
    expect(stale.html).toContain("opacity-40");
    expect(stale.html).toContain("motion-safe:transition-opacity");
    expect(stale.html).toMatch(
      /<p role="status" class="sr-only">Loading the opponents’ courts<\/p>/,
    );
    // The cards stay drawn, as the side they were computed for — a moment
    // old, not a skeleton.
    expect(stale.html).toContain("All serves, Maya Chen");
    expect(stale.html).not.toContain("data-pending-bar");

    // Landed: the cards are the chip's, nothing busy.
    const landed = await renderView(
      {
        analyzed: 2,
        side: "opponent",
        cards: buildSeasonCards(JUDGED, "opponent", BANDS),
        lightbox: null,
      },
      "tab=visualizations&player=opponent",
    );
    expect(landed.html).not.toContain("aria-busy");
    expect(landed.html).not.toContain("pointer-events-none");
    expect(landed.html).not.toContain("data-stale");
    expect(landed.html).not.toContain("Loading the opponents");
    expect(landed.html).toContain("All serves, Opponents");

    // Back to You, the other way round, named for the player.
    const back = await renderView(
      {
        analyzed: 2,
        side: "opponent",
        cards: buildSeasonCards(JUDGED, "opponent", BANDS),
        lightbox: null,
      },
      "tab=visualizations",
    );
    expect(back.html).toContain('aria-busy="true"');
    expect(back.html).toContain("Loading Maya Chen’s courts");
  });

  test("the wall keeps its own player: a You | Opponent switch inside the card rewrites the URL's player, and closing writes the wall's back", async () => {
    // A hard load of the opponents' Returns card: the wall's player is the
    // card's side (what the server drew the cards for), and the wall's chip
    // under the card reads so.
    const state = parseVizState(
      new URLSearchParams("cut=returnPlacement&player=opponent"),
      { errorSplitJudged: true },
    );
    const cards = buildSeasonCards(JUDGED, "opponent", BANDS);
    const lightbox = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
    const { html, shellProps, replaced } = await renderView(
      { analyzed: 2, side: "opponent", cards, lightbox },
      "tab=visualizations&cut=returnPlacement&player=opponent",
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>Opponents<\/button>/);
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
    // never reads the store's player while a card is open. The cards it
    // shows are the last ones computed for that player (`shown`), so a
    // switch inside a card never changes the wall under the scrim — the
    // opener card stays for focus to return to — and the server's cards
    // for another side only mark the wall busy.
    const source = readFileSync(VIEW, "utf8");
    expect(source).toContain("useState<PlayerFilter>");
    expect(source).toContain("player={player}");
    expect(source).toContain("wallPlayer={player}");
    expect(source).toMatch(
      /const player =\s*state\.cut === null \? state\.filters\.player : wallPlayer;/,
    );
    // Any side the browser holds counts — the server's, or the other one
    // once it has streamed in (`otherSideCards`).
    expect(source).toContain("const ready = cardsBySide[player];");
    expect(source).toMatch(
      /if \(ready && \(shown\.cards !== ready \|\| shown\.side !== player\)\)/,
    );
    expect(source).toContain("cards={shown.cards}");
    expect(source).toContain("cardsSide={shown.side}");
    expect(source).toContain("busy={analyzed > 0 && ready === undefined}");
  });

  test("the store reads ?verr= by the season's rule, as the server does: on an unjudged season Unforced opens on every error in the browser too", async () => {
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
    const a = await renderView(
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
    const b = await renderView(
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

  test('with `saveView`, the opened card\'s footer is "Save as view" for its cut, in the team workspace', async () => {
    const state = parseVizState(new URLSearchParams("cut=serve"), {
      errorSplitJudged: true,
    });
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    const lightbox = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
    const { shellProps } = await renderView(
      {
        analyzed: 2,
        side: "you",
        cards,
        lightbox,
        saveView: {
          savedViews: [],
          workspaceName: "Test U",
          workspaceRole: "coach",
        },
      },
      "tab=visualizations&cut=serve",
    );
    const footer = shellProps[0].footer as (args: unknown) => {
      start?: unknown;
      end: React.ReactElement<Record<string, unknown>>;
    };
    expect(typeof footer).toBe("function");
    // The footer's one group is on the right: nothing in the left slot.
    const { start, end } = footer({ matched: [], phrases: [] });
    expect(start).toBeUndefined();
    // The button loads with the opened card (`React.lazy`), so the footer is
    // a Suspense boundary whose fallback reads "Save as view" while it
    // loads, around the button with this card's cut and workspace.
    const boundary = end as React.ReactElement<{
      fallback: React.ReactElement;
      children: React.ReactElement<Record<string, unknown>>;
    }>;
    expect(renderToStaticMarkup(boundary.props.fallback)).toContain(
      "Save as view",
    );
    expect(boundary.props.children.props).toMatchObject({
      cut: "serve",
      workspaceKind: "team",
      workspaceName: "Test U",
    });
    // No season filter on: no "not part of a view" note.
    expect(boundary.props.children.props.note).toBeUndefined();
  });

  test("the container's source names no point: no MatchPoint, no points prop, none of the omitted slots", () => {
    const source = readFileSync(CONTAINER, "utf8");
    expect(source).not.toContain("MatchPoint");
    expect(source).not.toMatch(/\bpoints\b/);
    for (const slot of ["pointList", "bandEditor", "draft"])
      expect(source).not.toMatch(new RegExp(`\\b${slot}=`));
    // The one write, "Save as view", is the footer's, and only with `saveView`.
    expect(source).toMatch(/footer=\{\s*saveView/);
    // Every change goes through the URL store.
    expect(source).toContain("useVizState");
    expect(source).toContain("setState(");
    expect(source).not.toContain("computeViz");
    // The shell is loaded on the first open, never with the profile, and
    // the one dialog per card is keyed on the card: pending and landed
    // share the mount, another card gets another.
    expect(source).not.toMatch(/^import[^;]*viz-lightbox-shell"/m);
    expect(source).toMatch(
      /function loadShell[\s\S]*?import\(\s*"@\/components\/dashboard\/matches\/match-detail\/shots\/viz-lightbox-shell"/,
    );
    expect(source).toMatch(/let LazyShell[\s\S]*?=\s*lazy\(loadShell\)/);
    // A failed chunk forgets itself: the cached import and the lazy
    // component that remembers the rejection are both dropped, so the
    // boundary's retry asks for the chunk again.
    expect(source).toMatch(
      /shellChunk = null;\s*LazyShell = lazy\(loadShell\);\s*throw error;/,
    );
    expect(source).toContain("const Shell = LazyShell;");
    // Not `next/dynamic` anywhere it is `React.lazy`.
    expect(source).not.toMatch(/\bdynamic\(/);
    // One dialog per opening (a chart switch inside it keeps the mount).
    expect(source).toContain("key={opening.id}");
    expect(source).toMatch(/id: opening\.id \+ 1/);
    expect(source).toContain("pending={pending}");
  });
  test("Saved: the workspace's views over the season in the wall's grid, each a link to its view; none says so", async () => {
    const savedCards = buildSeasonViewCards(JUDGED, SAVED_VIEWS, BANDS);
    const cards = buildSeasonCards(JUDGED, "you", BANDS);
    // A view's link lands on Saved (`?view=`), with the view's court open.
    const state = parseVizState(
      new URLSearchParams("cut=serve&ball=second&view=v-second"),
      { errorSplitJudged: true },
    );
    const { html } = await renderView(
      {
        analyzed: 2,
        side: "you",
        cards,
        savedCards,
        lightbox: buildSeasonLightbox(JUDGED, state, BANDS, NAMES, SAVED_VIEWS),
      },
      "tab=visualizations&cut=serve&ball=second&view=v-second",
    );
    expect(html).toContain('aria-label="Saved views"');
    expect(html).not.toContain('aria-label="Default views"');
    expect(html).not.toContain("Saved views live on the match report");
    // The wall lists one player's views, the You | Opponent chip's: here
    // "you". The other side's stay off it until the chip is switched.
    const drawable = savedCards.filter((c) => c.total > 0);
    expect(drawable.some((c) => c.subject === "you")).toBe(true);
    for (const card of drawable) {
      const shown = card.subject === "you";
      expect(html.includes(`view=${card.state.viewId}`)).toBe(shown);
      if (shown) expect(html).toContain(card.name);
    }
    expect(html).toContain("Second serves, Maya Chen");

    const none = await renderView(
      { analyzed: 2, side: "you", cards, savedCards: [], lightbox: null },
      "tab=visualizations&cut=serve&vfrom=gone",
    );
    expect(none.html).toContain("No saved views yet.");
    expect(none.html).toContain('data-testid="season-viz-empty"');
  });
});

/* ── One body per request ───────────────────────────────────────────────── */

const PAGE = "src/app/dashboard/team/roster/[playerId]/page.tsx";
const DEFERRED =
  "src/components/dashboard/team/player-profile/profile-body-deferred.tsx";

test.describe("one body per request", () => {
  const source = readFileSync(PAGE, "utf8");
  const page = source.slice(
    source.indexOf("export default async function PlayerProfilePage"),
  );
  const pageBody = page.slice(0, page.indexOf("\n}\n"));

  test("the page reads ?tab= once on the server and renders the body it names, the other view's stand-in beside it", () => {
    expect(pageBody).toContain(
      'parseProfileView(query[PROFILE_VIEW_PARAM]) === "visualizations"',
    );
    // The Statistics slot: no body on a Visualizations request (the slot
    // draws what it kept, else the stand-in), the Suspense-wrapped body
    // otherwise …
    expect(pageBody).toMatch(
      /<ProfileBodySlot\s+view="statistics"\s+scope=\{active\.id\}\s+body=\{\s*courtsOnly \? null : \(\s*<Suspense[\s\S]*?<ProfileStatisticsBody/,
    );
    // … and the Visualizations slot the other way round.
    expect(pageBody).toMatch(
      /<ProfileBodySlot\s+view="visualizations"\s+scope=\{active\.id\}\s+body=\{\s*courtsOnly \? \(\s*<Suspense[\s\S]*?<ProfileVisualizationsBody[\s\S]*?<\/Suspense>\s*\) : null\s*\}/,
    );
    // The facts line reads whichever season the body of the request reads;
    // the Visualizations body, rendered on its own request alone, reads the
    // courts' season and never the full one.
    expect(pageBody.split("courtsOnly={courtsOnly}").length - 1).toBe(1);
    expect(source).toMatch(
      /async function AnalyzedCount[\s\S]*?courtsOnly\s*\?\s*getPlayerSeasonCourts\(programId, playerId\)\s*:\s*getPlayerSeason\(programId, playerId\)/,
    );
    const vizBody = source.slice(
      source.indexOf("async function ProfileVisualizationsBody"),
    );
    expect(vizBody).toContain("getPlayerSeasonCourts(programId, playerId)");
    expect(vizBody).not.toMatch(/\bgetPlayerSeason\(/);
    // The season's Error-type rule is the one the store gets.
    expect(vizBody).toMatch(
      /const errorSplitJudged = seasonErrorSplitJudged\(season\.perMatch\);[\s\S]*parseSeasonVizState\(query, errorSplitJudged\)[\s\S]*errorSplitJudged=\{errorSplitJudged\}/,
    );
  });

  test("each stand-in shows nothing on the request that rendered it, and its view's skeleton plus one refresh once that view shows — so the two cannot ping-pong", () => {
    const render = (
      name: "ProfileStatisticsDeferred" | "ProfileVisualizationsDeferred",
      query: string,
    ) => {
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
      const mod = loader.load(DEFERRED) as Record<string, React.ComponentType>;
      return renderToStaticMarkup(React.createElement(mod[name]));
    };

    // A Statistics request (no `tab`) renders the Visualizations stand-in:
    // nothing at that URL. A Visualizations request renders the Statistics
    // stand-in: nothing at that URL either. Neither can ask for a refresh
    // on the request that drew it.
    expect(render("ProfileVisualizationsDeferred", "")).toBe("");
    expect(render("ProfileVisualizationsDeferred", "cut=serve")).toBe("");
    expect(render("ProfileStatisticsDeferred", "tab=visualizations")).toBe("");
    expect(
      render("ProfileStatisticsDeferred", "tab=visualizations&cut=serve"),
    ).toBe("");

    // Switched: each draws its own view's skeleton — the first load's — in
    // the tab's panel, nothing interactive.
    const statistics = render("ProfileStatisticsDeferred", "cut=serve");
    expect(statistics).toContain('role="tabpanel"');
    expect(statistics).toContain('aria-label="Loading statistics"');
    expect(statistics).toContain("data-pending-bar");
    expect(statistics).not.toContain("<button");
    const visualizations = render(
      "ProfileVisualizationsDeferred",
      "tab=visualizations",
    );
    expect(visualizations).toContain('role="tabpanel"');
    expect(visualizations).toContain('aria-label="Loading visualizations"');
    expect(visualizations).toContain("data-pending-bar");
    expect(visualizations).not.toContain("<button");

    // And the request that brings the body: once, on mount, a soft replace
    // to the URL the address bar already shows — never `router.refresh()`,
    // which after a native `?tab=` push fell back to a full document load,
    // and never a navigation to a different URL.
    const deferred = readFileSync(DEFERRED, "utf8");
    expect(deferred).toMatch(
      /function RefreshOnMount\(\) \{[\s\S]*?useEffect\(\(\) => \{\s*revalidate\(router\);\s*\}, \[router\]\)/,
    );
    expect(
      deferred.slice(deferred.indexOf("function RefreshOnMount")),
    ).not.toContain("router.refresh");
    expect(deferred).not.toContain("router.push");
    expect(deferred).toContain("<ProfileViewWhen view={view}>");
  });

  test("a slot keeps the body it was handed, so a switch back is not another round trip", () => {
    const loader = createLoader({
      stubs: {
        "next/navigation": {
          useSearchParams: () => new URLSearchParams("tab=visualizations"),
          usePathname: () => "/dashboard/team/roster/p-maya",
          useRouter: () => ({ refresh() {}, replace() {}, push() {} }),
        },
        "next/image": { __esModule: true, default: passthrough("img") },
        "next/link": { __esModule: true, default: passthrough("a") },
        "framer-motion": {
          useReducedMotion: () => true,
          motion: new Proxy({}, { get: (_, tag) => passthrough(String(tag)) }),
          AnimatePresence: fragment,
        },
      },
    });
    const mod = loader.load(DEFERRED) as Record<
      string,
      React.ComponentType<{
        view: string;
        scope: string;
        body: React.ReactNode;
      }>
    >;
    const render = (view: string, body: React.ReactNode) =>
      renderToStaticMarkup(
        React.createElement(mod.ProfileBodySlot, {
          view,
          scope: "prog-a",
          body,
        }),
      );

    // The body this request rendered is drawn as it is …
    expect(
      render("visualizations", React.createElement("i", null, "wall")),
    ).toBe("<i>wall</i>");
    // … and with nothing handed and nothing kept, the stand-in: its
    // skeleton and the refresh while its view is the URL's.
    expect(render("visualizations", null)).toContain(
      'aria-label="Loading visualizations"',
    );

    const deferred = readFileSync(DEFERRED, "utf8");
    const slot = deferred.slice(
      deferred.indexOf("export function ProfileBodySlot"),
      deferred.indexOf("function bodyKey"),
    );
    // It keeps them above the page — in the `[playerId]` layout, whose
    // segment survives a `?tab=` change where the page's does not — stamped
    // once per body with what it was rendered for and when it arrived …
    expect(slot).toContain("useContext(ProfileBodyCacheContext)");
    expect(slot).toMatch(
      /if \(store && body !== null && store\.kept\.get\(view\)\?\.body !== body\)\s*store\.kept\.set\(view, \{ body, key, at: Date\.now\(\) \}\);/,
    );
    expect(
      readFileSync(
        "src/app/dashboard/team/roster/[playerId]/layout.tsx",
        "utf8",
      ),
    ).toContain("<ProfileBodyCache>{children}</ProfileBodyCache>");
    // … and drawn only while that is still what the slot would render: the
    // same program always (the page hands both slots the active workspace),
    // and for Visualizations the same viz state, `tab` aside.
    expect(slot).toContain("const key = bodyKey(view, scope, searchParams);");
    expect(slot).toContain(
      "const shown = body ?? (kept && kept.key === key ? kept.body : null);",
    );
    const keyFn = deferred.slice(deferred.indexOf("function bodyKey"));
    expect(keyFn).toMatch(
      /if \(view !== "visualizations"\) return scope;[\s\S]*?\(\[name\]\) => name !== PROFILE_VIEW_PARAM[\s\S]*?return `\$\{scope\}\?/,
    );
    expect(pageBody.split("scope={active.id}").length - 1).toBe(2);
    // A kept body is never trusted for long: a switch onto a view with a
    // body on screen asks for the page again in the background once that
    // body is 30 seconds old — a switch onto the stand-in does not (its own
    // request is the fetch), and a first load is not a switch.
    expect(slot).toMatch(
      /const was = store\.swapShown\(view\);\s*if \(was === null \|\| was === view \|\| !hasBody\) return;\s*const arrived = store\.kept\.get\(view\)\?\.at \?\? 0;\s*if \(Date\.now\(\) - arrived >= REVALIDATE_AFTER_MS\) revalidate\(router\);/,
    );
    expect(deferred).toContain("const REVALIDATE_AFTER_MS = 30_000;");
    expect(deferred).toMatch(
      /function revalidate\([\s\S]*?router\.replace\(window\.location\.pathname \+ window\.location\.search, \{\s*scroll: false,\s*\}\);/,
    );
  });
});

/* ── Statistics rows as positions (`encodeStatRowDots`) ─────────────────── */

test.describe("statRowDots encoding", () => {
  const DOTS = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  test("round-trips: the decoded set is the picked ids that are on the court", () => {
    const indices = encodeStatRowDots(DOTS, ["c", "a", "a", "zz"]);
    expect(indices).toEqual([0, 2]);
    expect([...decodeStatRowDots(DOTS, indices)].sort()).toEqual(["a", "c"]);
    expect(encodeStatRowDots(DOTS, [])).toEqual([]);
    expect(decodeStatRowDots(DOTS, [])).toEqual(new Set());
    // An index past the court is ignored rather than read as a mark.
    expect([...decodeStatRowDots(DOTS, [1, 9])]).toEqual(["b"]);
  });

  test("for every drawn mark, the decoded rows answer exactly as the old id lists did", () => {
    for (const query of [
      "cut=serve&ball=first",
      "cut=serve&court=deuce",
      "cut=returnPlacement",
      "cut=rallyPlacement",
      "cut=errors",
    ]) {
      const state = parseVizState(new URLSearchParams(query), {
        errorSplitJudged: true,
      });
      const data = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
      const cut = state.cut!;
      const parts = JUDGED.map((m) => partFor(m, cut, state.filters));
      for (const group of data.stats.groups) {
        for (const row of group.rows) {
          const pick = pickFor(cut, group.key, row);
          // What the payload carried before: every id the rule picks.
          const old = new Set(
            parts.flatMap((p) => [
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
            ]),
          );
          const now = decodeStatRowDots(
            data.result.dots,
            data.statRowDots[statPickKey(pick)],
          );
          for (const dot of data.result.dots)
            expect(now.has(dot.id), `${query} ${statPickKey(pick)}`).toBe(
              old.has(dot.id),
            );
        }
      }
    }
  });
});

/* ── Pass 4: the chart menu and the season's own filters ─────────────────── */

/** `?query` as the season page reads it. */
const seasonState = (query: string) =>
  parseVizState(new URLSearchParams(query), {
    errorSplitJudged: true,
    season: true,
  });

test.describe("the chart menu over the season (?chart=heat|zones)", () => {
  const CHARTS: { label: string; query: string }[] = [
    { label: "serve, Heat", query: "cut=serve&chart=heat" },
    { label: "serve, Zones", query: "cut=serve&chart=zones" },
    {
      label: "rally placement, Zones",
      query: "cut=rallyPlacement&chart=zones",
    },
    { label: "return contact, Zones", query: "cut=returnContact&chart=zones" },
    { label: "errors, Heat", query: "cut=errors&chart=heat" },
  ];
  for (const { label, query } of CHARTS) {
    test(`${label}: the chart is the URL's and the court the sum of the per-match parts`, () => {
      const state = seasonState(query);
      const data = buildSeasonLightbox(JUDGED, state, BANDS, NAMES)!;
      const cut = state.cut!;
      const parts = JUDGED.map((m) => partFor(m, cut, state.filters));
      expect(data.chart).toBe(state.chart);
      expect(data.chart).not.toBe("scatter");
      // Heat draws the merged marks' positions: every mark, with its place.
      expect(data.result.dots.map((d) => d.id)).toEqual(
        parts.flatMap((p) => p.result.dots.map((d) => d.id)),
      );
      for (const dot of data.result.dots) {
        expect(typeof dot.lateralM).toBe("number");
        expect(typeof dot.depthM).toBe("number");
      }
      expect(data.result.count).toBe(sum(parts.map((p) => p.result.count)));
      // Zones on serve: the six boxes, each the sum of its parts.
      if (cut === "serve") {
        const zones = data.result.zoneStats as Record<string, ZoneStats>;
        expect(Object.keys(zones).length).toBeGreaterThan(0);
        for (const [key, zone] of Object.entries(zones))
          expect(zone.count, key).toBe(
            sum(
              parts.map(
                (p) =>
                  (p.result.zoneStats as Record<string, ZoneStats>)[key].count,
              ),
            ),
          );
      }
      // Zones off serve: the bands' rows are the merged Statistics' Depth
      // rows, each the sum of its parts.
      if (cut !== "serve" && cut !== "errors" && state.chart === "zones") {
        expect(data.bandZones).toEqual(
          bandZonesFor(cut, DEFAULT_BANDS, "ft", data.stats),
        );
        const depth = data.stats.groups.find((g) => g.key === "depth");
        if (depth)
          for (const row of depth.rows)
            expect(row.count, row.key).toBe(
              sum(
                parts.map((p) => rowOf(p.stats, "depth", row.key)?.count ?? 0),
              ),
            );
      }
      // The same court on Scatter is the same marks: the chart changes the
      // drawing, never the fold.
      const scatter = buildSeasonLightbox(
        JUDGED,
        { ...state, chart: "scatter" },
        BANDS,
        NAMES,
      )!;
      expect(scatter.result.count).toBe(data.result.count);
      // And the court signature tells the two apart.
      expect(courtSignature(cut, data.chart, data.filters, true)).not.toBe(
        courtSignature(cut, "scatter", data.filters, true),
      );
    });
  }
});

test.describe("Opponent plays and Matches (the season's own filters)", () => {
  const D: SeasonVizMatch = {
    ...A,
    matchId: "d",
    points: prefixed(
      BODY.filter((_, i) => i % 4 !== 1),
      "d",
    ),
  };
  // A right-handed opponent on Oct 1, a lefty on Nov 3, one unknown on
  // Oct 20 — listed here oldest-ish first, so the panel's newest-first
  // order is the builder's doing.
  const HANDS: SeasonVizMatch[] = [
    { ...A, date: "2026-10-01", opponent: "Lee", opponentHand: "right" },
    { ...B, date: "2026-11-03", opponent: "Ortiz", opponentHand: "left" },
    { ...D, date: "2026-10-20", opponent: "Park", opponentHand: null },
  ];
  const count = (m: SeasonVizMatch, query: string) => {
    const state = seasonState(query);
    return partFor(m, state.cut!, state.filters).result.count;
  };

  test("no season filter: every match folded, and each option's count is the per-match sum", () => {
    const data = buildSeasonLightbox(
      HANDS,
      seasonState("cut=serve"),
      BANDS,
      NAMES,
    )!;
    const each = HANDS.map((m) => count(m, "cut=serve"));
    expect(data.result.count).toBe(sum(each));
    // Each row carries its match's hand, for the sheet's Opponent menu.
    expect(
      Object.fromEntries(
        data.seasonOptions.matches.map((m) => [m.id, [m.count, m.hand]]),
      ),
    ).toEqual({
      a: [each[0], "right"],
      b: [each[1], "left"],
      d: [each[2], "unknown"],
    });
    // Newest first, by match day.
    expect(data.seasonOptions.matches.map((m) => m.id)).toEqual([
      "b",
      "d",
      "a",
    ]);
    expect(data.seasonOptions.matches.map((m) => m.count)).toEqual([
      each[1],
      each[2],
      each[0],
    ]);
    expect(data.seasonOptions.matches[0]).toMatchObject({
      opponentName: "Ortiz",
      date: "2026-11-03",
    });
    expect(data.season).toBeNull();
    expect(data.panelActive).toBe(false);
    expect(data.hasFilters).toBe(false);
  });

  test("Lefties: the court is the lefty's match alone, named in the strip; every match row keeps its own count for the sheet to sum", () => {
    const state = seasonState("cut=serve&ball=first&vopp=left");
    const data = buildSeasonLightbox(HANDS, state, BANDS, NAMES)!;
    const part = partFor(B, "serve", state.filters);
    expect(data.result.count).toBe(part.result.count);
    expect(data.result.total).toBe(part.result.total);
    expect(data.result.dots.map((d) => d.id)).toEqual(
      part.result.dots.map((d) => d.id),
    );
    // Every mark names B — index 1 into `matches`, which stays the season.
    expect(new Set(data.dotPoints.map((ref) => ref[0]))).toEqual(new Set([1]));
    expect(data.matches.map((m) => m.id)).toEqual(["a", "b", "d"]);
    expect(data.filterPhrases).toEqual(["1st", "Left-handed"]);
    expect(data.subtitle).toContain("1 match ·");
    expect(data.panelActive).toBe(true);
    expect(data.hasFilters).toBe(true);
    expect(data.season).toEqual({
      opponentHand: "left",
      result: null,
      surface: null,
      matches: [],
    });
    // The Matches sheet filters its own draft in the browser, so a row's
    // count is its match under the shot filters, whatever the match filters
    // keep; each row also says the hand the sheet filters on.
    const byId = Object.fromEntries(
      data.seasonOptions.matches.map((m) => [m.id, [m.count, m.hand]]),
    );
    expect(byId).toEqual({
      b: [count(B, "cut=serve&ball=first"), "left"],
      a: [count(A, "cut=serve&ball=first"), "right"],
      d: [count(D, "cut=serve&ball=first"), "unknown"],
    });
    // Statistics and the option counts are the lefty's alone too.
    expect(data.stats.total).toBe(part.result.count);
    expect(data.optionCounts[optionCountKey({ zone: ["t"] })]).toBe(
      computeViz(
        part.points,
        "serve",
        { ...state.filters, zone: ["t"] },
        part.subject,
        "scatter",
        part.ctx,
      ).count,
    );
  });

  test("Unknown: a match whose row does not say", () => {
    const data = buildSeasonLightbox(
      HANDS,
      seasonState("cut=rallyPlacement&vopp=unknown"),
      BANDS,
      NAMES,
    )!;
    expect(data.result.count).toBe(count(D, "cut=rallyPlacement"));
    expect(data.filterPhrases).toEqual(["Hand unknown"]);
  });

  test("two ticked matches: the court is their sum, the strip says '2 matches', and an id outside the season is ignored", () => {
    const query = "cut=errors&verr=unforced&vm=d&vm=a&vm=ffff";
    const data = buildSeasonLightbox(HANDS, seasonState(query), BANDS, NAMES)!;
    const expected = [HANDS[0], HANDS[2]].map((m) =>
      count(m, "cut=errors&verr=unforced"),
    );
    expect(data.result.count).toBe(sum(expected));
    expect(data.filterPhrases).toContain("2 matches");
    expect(data.subtitle).toContain("2 matches ·");
    // The echo is what the URL asked (the ignored id included), so the
    // container's signature still finds it.
    expect(data.season).toEqual({
      opponentHand: null,
      result: null,
      surface: null,
      matches: ["a", "d", "ffff"],
    });
    // A match row is itself alone, ticked or not.
    expect(data.seasonOptions.matches.find((m) => m.id === "b")!.count).toBe(
      count(B, "cut=errors&verr=unforced"),
    );
  });

  test("Result and Surface: the court keeps the won clay matches, the strip names both, and each row carries its result, score and surface", () => {
    const SCORED: SeasonVizMatch[] = [
      { ...HANDS[0], won: true, score: "6–3, 6–4", courtType: "Clay Court" },
      { ...HANDS[1], won: false, score: "4–6, 3–6", courtType: "Clay Court" },
      { ...HANDS[2], won: true, score: null, courtType: "Outdoor Hard Court" },
    ];
    const data = buildSeasonLightbox(
      SCORED,
      seasonState("cut=serve&vres=won&vsurf=clay"),
      BANDS,
      NAMES,
    )!;
    expect(data.result.count).toBe(count(SCORED[0], "cut=serve"));
    expect(data.filterPhrases).toEqual(["Won", "Clay"]);
    expect(data.subtitle).toContain("1 match ·");
    expect(data.season).toEqual({
      opponentHand: null,
      result: "won",
      surface: "clay",
      matches: [],
    });
    const a = data.seasonOptions.matches.find((m) => m.id === "a")!;
    expect(a).toMatchObject({ won: true, score: "6–3, 6–4", surface: "clay" });
    const d = data.seasonOptions.matches.find((m) => m.id === "d")!;
    expect(d).toMatchObject({ won: true, score: null, surface: "hard" });
    // A match with no stored result is in neither Won nor Lost.
    const unscored = buildSeasonLightbox(
      [{ ...SCORED[0], won: null }],
      seasonState("cut=serve&vres=lost"),
      BANDS,
      NAMES,
    )!;
    expect(unscored.result.count).toBe(0);
  });

  test("only ids outside the season: no filter at all, as if none were ticked", () => {
    const plain = buildSeasonLightbox(
      HANDS,
      seasonState("cut=serve"),
      BANDS,
      NAMES,
    )!;
    const bogus = buildSeasonLightbox(
      HANDS,
      seasonState("cut=serve&vm=ffff&vm=0000"),
      BANDS,
      NAMES,
    )!;
    expect(bogus.result).toEqual(plain.result);
    expect(bogus.filterPhrases).toEqual([]);
    expect(bogus.panelActive).toBe(false);
  });

  test("a hand and a tick that leave nothing: an honest empty court that offers Clear", () => {
    const data = buildSeasonLightbox(
      HANDS,
      seasonState("cut=serve&vopp=left&vm=a"),
      BANDS,
      NAMES,
    )!;
    expect(data.result.count).toBe(0);
    expect(data.result.dots).toEqual([]);
    expect(data.hasFilters).toBe(true);
    expect(data.stats.title).not.toBe("");
    expect(data.subtitle).toContain("0 matches");
  });

  test("the wall's cards are the whole season, whatever the lightbox's filters", () => {
    const cards = buildSeasonCards(HANDS, "you", BANDS);
    const serve = cards.find((c) => c.cut === "serve")!;
    expect(serve.total).toBe(
      sum(
        HANDS.map(
          (m) => partFor(m, "serve", { ...EMPTY_VIZ_FILTERS }).result.total,
        ),
      ),
    );
    // A card opens with no season filter.
    expect(serve.state).not.toHaveProperty("season");
  });

  test("a court signature carries the season filters, canonical: tick order does not matter, a tick does", () => {
    const base = seasonState("cut=serve");
    const sig = (season?: { opponentHand: "left" | null; matches: string[] }) =>
      courtSignature("serve", "scatter", base.filters, true, season);
    expect(sig({ opponentHand: null, matches: ["d", "a"] })).toBe(
      sig({ opponentHand: null, matches: ["a", "d"] }),
    );
    expect(sig({ opponentHand: null, matches: ["a"] })).not.toBe(sig());
    expect(sig({ opponentHand: "left", matches: [] })).not.toBe(sig());
    // The server's echo signs as the store's ask.
    const data = buildSeasonLightbox(
      HANDS,
      seasonState("cut=serve&vm=d&vm=a"),
      BANDS,
      NAMES,
    )!;
    expect(
      courtSignature(data.cut, data.chart, data.filters, true, data.season),
    ).toBe(sig({ opponentHand: null, matches: ["d", "a"] }));
  });
});
