import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadHomeServes } from "@/lib/data/home-serve-data";
import {
  asPointRows,
  inBox,
  pointMeta,
} from "./fixtures/serve-dot-row-fixtures";

/**
 * `loadHomeServes` reads the personal Home's serve-placement dots (T3). The
 * read starts at `points` (indexed on `match_id`) with each point's serve rows
 * embedded, in a total order, paged through the fail-closed `fetchAllPages` —
 * four matches of points pass PostgREST's 1000-row cap, so a single request
 * would silently plot a partial set.
 *
 * The fake client below slices a real array of points by `.range()` so the
 * loader has to issue two pages to see every row.
 */

type Page = { data: unknown[] | null; error: { message: string } | null };

const MATCHES = 4;
const POINTS_PER_MATCH = 300;
const matches = Array.from({ length: MATCHES }, (_, m) => ({
  id: `match-${m}`,
}));

type Role = "p1-first" | "p1-second" | "opponent";
// A third each: the viewer's first serves (plotted), the viewer's second
// serves (dropped by the first-serves-only filter) and the opponent's serves
// (dropped by the `serverIsPlayer1` gate).
const roleOf = (i: number): Role =>
  i % 3 === 0 ? "p1-first" : i % 3 === 1 ? "p1-second" : "opponent";

// One serve row per point: 4 × 300 = 1,200 rows.
const serveRows = matches.flatMap((match, m) =>
  Array.from({ length: POINTS_PER_MATCH }, (_, i) => {
    const role = roleOf(i);
    const pointId = `m${m}-p${String(i).padStart(3, "0")}`;
    return {
      id: `${pointId}-s1`,
      point_id: pointId,
      shot_number: 1,
      shot_type: role === "p1-second" ? "Second Serve" : "First Serve",
      ...inBox,
      points: pointMeta(pointId, match.id, role !== "opponent"),
    };
  }),
);

const expectedDotIds = serveRows
  .filter((row) => row.shot_type === "First Serve")
  .filter((row) => row.points.server_is_player1)
  .map((row) => row.point_id);

// A viewer-served point whose only row is SwingVision's `Feed`, with in-box
// coordinates. The serve-only filter keeps it out of a real read; the fake
// deliberately does NOT honour that filter, so the row reaches the loader and
// `pickServeShot` (T1) must refuse to read a Feed's landing as a serve.
const FEED_POINT = "m0-pfeed";
const feedRow = {
  id: `${FEED_POINT}-s0`,
  point_id: FEED_POINT,
  shot_number: 0,
  shot_type: "Feed",
  ...inBox,
  points: pointMeta(FEED_POINT, "match-0", true),
};

const allPoints = asPointRows([...serveRows, feedRow]);

function fakeClient(failPointPage?: number) {
  const pointRanges: [number, number][] = [];
  const pointOrder: string[] = [];
  const pointIn: [string, unknown[]][] = [];
  const tables: string[] = [];

  function from(table: string) {
    tables.push(table);
    let range: [number, number] | null = null;
    let matchFilter: unknown[] | null = null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      limit: () => builder,
      in(column: string, values: unknown[]) {
        if (table === "points") {
          pointIn.push([column, values]);
          if (column === "match_id") matchFilter = values;
        }
        return builder;
      },
      order(column: string, opts?: { referencedTable?: string }) {
        if (table === "points")
          pointOrder.push(
            opts?.referencedTable
              ? `${opts.referencedTable}.${column}`
              : column,
          );
        return builder;
      },
      range(from: number, to: number) {
        range = [from, to];
        pointRanges.push(range);
        return builder;
      },
      then<R>(resolve: (value: Page) => R) {
        let result: Page = { data: [], error: null };
        if (table === "points" && range) {
          if (pointRanges.length === failPointPage) {
            result = { data: null, error: { message: "points page failed" } };
          } else {
            const rows = allPoints.filter(
              (point) => !matchFilter || matchFilter.includes(point.match_id),
            );
            result = { data: rows.slice(range[0], range[1] + 1), error: null };
          }
        }
        return Promise.resolve(result).then(resolve);
      },
    };
    return builder;
  }

  return {
    client: { from } as unknown as SupabaseClient,
    pointRanges,
    pointOrder,
    pointIn,
    tables,
  };
}

test("reads 1,200 points of serves across two pages and plots every viewer first serve", async () => {
  const { client, pointRanges, pointOrder, pointIn, tables } = fakeClient();

  const { dots, matchCount } = await loadHomeServes(client, "viewer", matches);

  // `initialMatches` skips the matches read entirely; the read starts at
  // `points`, never a scan of `shots`.
  expect(tables.every((table) => table === "points")).toBe(true);
  expect(pointRanges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  // Total order, so pages never overlap or skip.
  expect(pointOrder.slice(0, 3)).toEqual([
    "id",
    "shots.shot_number",
    "shots.id",
  ]);
  expect(pointIn).toContainEqual([
    "shots.shot_type",
    ["First Serve", "Second Serve"],
  ]);
  expect(pointIn).toContainEqual(["match_id", matches.map((m) => m.id)]);

  expect(matchCount).toBe(MATCHES);
  expect(expectedDotIds).toHaveLength(MATCHES * (POINTS_PER_MATCH / 3));
  expect(dots.map((dot) => dot.id).sort()).toEqual([...expectedDotIds].sort());
  expect(dots.every((dot) => dot.isFirstServe)).toBe(true);
});

test("a point whose only row is a Feed yields no dot", async () => {
  const { client } = fakeClient();

  const { dots } = await loadHomeServes(client, "viewer", matches);

  expect(dots.some((dot) => dot.id === FEED_POINT)).toBe(false);
});

test("a failed second page throws instead of plotting the first page", async () => {
  const { client, pointRanges } = fakeClient(2);

  await expect(loadHomeServes(client, "viewer", matches)).rejects.toThrow(
    "points page failed",
  );
  expect(pointRanges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test("no matches returns no dots without reading points", async () => {
  const { client, tables } = fakeClient();

  expect(await loadHomeServes(client, "viewer", [])).toEqual({
    dots: [],
    matchCount: 0,
  });
  expect(tables).toEqual([]);
});
