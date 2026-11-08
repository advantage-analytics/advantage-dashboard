import { expect, test } from "@playwright/test";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  computeVizStats,
  type Cut,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  SERVE_ROW_KEYS,
  serveRowDotIds,
  statPickDotIds,
} from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import { DEFAULT_BANDS, type BandSettings } from "@/lib/data/viz-bands";
import { ASYMMETRIC_SERVES } from "./fixtures/viz-serve-points";
import { RALLY_POINTS } from "./fixtures/viz-rally-points";

const POINTS = [...ASYMMETRIC_SERVES, ...RALLY_POINTS];
const CUTS: Cut[] = [
  "serve",
  "returnPlacement",
  "returnContact",
  "rallyPlacement",
  "rallyPosition",
  "errors",
];
const THIRDS: BandSettings = { ...DEFAULT_BANDS, depthScheme: "thirds" };

test("a Statistics row's filter keeps exactly the marks the row counted", () => {
  let checked = 0;
  for (const bands of [DEFAULT_BANDS, THIRDS])
    for (const cut of CUTS)
      for (const isPlayer1 of [true, false]) {
        const filters = { ...EMPTY_VIZ_FILTERS };
        const result = computeViz(POINTS, cut, filters, isPlayer1);
        const stats = computeVizStats(
          POINTS,
          cut,
          filters,
          isPlayer1,
          result,
          bands,
          "ft",
        );
        for (const group of stats.groups)
          for (const row of group.rows) {
            const ids = statPickDotIds(
              POINTS,
              cut,
              filters,
              isPlayer1,
              undefined,
              result.dots,
              { group: group.key, row: row.key, label: row.label },
              bands,
            );
            expect(
              ids.size,
              `${cut} ${isPlayer1 ? "p1" : "p2"} ${group.key}:${row.key}`,
            ).toBe(row.count);
            // …and every kept mark is one the court draws.
            const drawn = new Set(result.dots.map((d) => d.id));
            for (const id of ids) expect(drawn.has(id)).toBe(true);
            if (row.count > 0) checked++;
          }
      }
  expect(checked).toBeGreaterThan(10);
});

test("the serve rows precomputed for hovering are the row filter's own marks, row by row", () => {
  for (const isPlayer1 of [true, false])
    for (const filters of [
      { ...EMPTY_VIZ_FILTERS },
      { ...EMPTY_VIZ_FILTERS, ball: ["first" as const] },
    ]) {
      const result = computeViz(POINTS, "serve", filters, isPlayer1);
      const all = serveRowDotIds(
        POINTS,
        filters,
        isPlayer1,
        undefined,
        DEFAULT_BANDS,
      );
      expect([...all.keys()]).toEqual([...SERVE_ROW_KEYS]);
      for (const row of SERVE_ROW_KEYS)
        expect([...all.get(row)!].sort()).toEqual(
          [
            ...statPickDotIds(
              POINTS,
              "serve",
              filters,
              isPlayer1,
              undefined,
              result.dots,
              { group: row.split("-")[0], row, label: row },
              DEFAULT_BANDS,
            ),
          ].sort(),
        );
    }
});
