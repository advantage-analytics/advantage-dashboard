import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadHomeServes } from "@/lib/data/home-serve-data";
import { inBox, pointMeta } from "./fixtures/serve-dot-row-fixtures";

/**
 * `loadHomeServes` reads the personal Home's serve-placement dots (T3). The
 * shots read is serve rows only, in a total order, paged through the
 * fail-closed `fetchAllPages` — four matches of serves sit near PostgREST's
 * 1000-row cap, so a single request would silently plot a partial set.
 *
 * The fake client below slices a real array by `.range()` so the loader has
 * to issue two pages to see every row.
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

const allRows = [...serveRows, feedRow];

function fakeClient(failShotPage?: number) {
  const shotRanges: [number, number][] = [];
  const shotOrder: string[] = [];
  const shotIn: [string, unknown[]][] = [];
  const tables: string[] = [];

  function from(table: string) {
    tables.push(table);
    let range: [number, number] | null = null;
    const orders: string[] = [];
    let matchFilter: unknown[] | null = null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      limit: () => builder,
      in(column: string, values: unknown[]) {
        if (table === "shots") {
          shotIn.push([column, values]);
          if (column === "points.match_id") matchFilter = values;
        }
        return builder;
      },
      order(column: string) {
        orders.push(column);
        if (table === "shots") shotOrder.push(column);
        return builder;
      },
      range(from: number, to: number) {
        range = [from, to];
        shotRanges.push(range);
        return builder;
      },
      then<R>(resolve: (value: Page) => R) {
        let result: Page = { data: [], error: null };
        if (table === "shots" && range) {
          if (shotRanges.length === failShotPage) {
            result = { data: null, error: { message: "shots page failed" } };
          } else {
            const rows = allRows
              .filter(
                (row) =>
                  !matchFilter || matchFilter.includes(row.points.match_id),
              )
              .sort((a, b) => {
                for (const key of orders) {
                  const x = a[key as keyof typeof a] as string | number;
                  const y = b[key as keyof typeof b] as string | number;
                  if (x < y) return -1;
                  if (x > y) return 1;
                }
                return 0;
              });
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
    shotRanges,
    shotOrder,
    shotIn,
    tables,
  };
}

test("reads 1,200 serve rows across two pages and plots every viewer first serve", async () => {
  const { client, shotRanges, shotOrder, shotIn, tables } = fakeClient();

  const { dots, matchCount } = await loadHomeServes(client, "viewer", matches);

  // `initialMatches` skips the matches read entirely.
  expect(tables.every((table) => table === "shots")).toBe(true);
  expect(shotRanges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  // Total order, so pages never overlap or skip.
  expect(shotOrder.slice(0, 3)).toEqual(["point_id", "shot_number", "id"]);
  expect(shotIn).toContainEqual(["shot_type", ["First Serve", "Second Serve"]]);
  expect(shotIn).toContainEqual(["points.match_id", matches.map((m) => m.id)]);

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
  const { client, shotRanges } = fakeClient(2);

  await expect(loadHomeServes(client, "viewer", matches)).rejects.toThrow(
    "shots page failed",
  );
  expect(shotRanges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test("no matches returns no dots without reading shots", async () => {
  const { client, tables } = fakeClient();

  expect(await loadHomeServes(client, "viewer", [])).toEqual({
    dots: [],
    matchCount: 0,
  });
  expect(tables).toEqual([]);
});
