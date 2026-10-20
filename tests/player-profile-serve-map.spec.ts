import { expect, test } from "@playwright/test";

import { serveMapFor } from "@/lib/data/player-profile-server";
import { withConsoleErrors } from "./fixtures/with-console-errors";
import {
  asPointRows,
  inBox,
  pointMeta,
} from "./fixtures/serve-dot-row-fixtures";

/**
 * `serveMapFor` reads the player-profile serve map (T4) — the same job
 * `loadHomeServes` (`home-serve-data.ts`, T3) does for the Home widget, one
 * task ago. Both read through `fetchServeShotsForMatches`: points (indexed on
 * `match_id`) with each point's serve rows embedded, in a total order, paged
 * through the fail-closed `fetchAllPages` — the ten most recent matches'
 * points sit well past PostgREST's 1000-row cap, so a single request would
 * silently plot a partial map while still claiming to have read every match.
 *
 * The fake client below slices an id-ordered array of points by `.range()`,
 * so the loader has to issue three pages to see every row — mirrors the
 * chainable fake in `home-serve-data.spec.ts`.
 */

type Page = { data: unknown[] | null; error: { message: string } | null };

const MATCHES = 10;
const POINTS_PER_MATCH = 220;

// Half the matches have the profile playing as player one, half as player
// two — `serveMapFor` must read the correct side per match, not a bare flag.
const matchSides = Array.from({ length: MATCHES }, (_, m) => ({
  id: `match-${m}`,
  isPlayer1: m % 2 === 0,
}));

// One serve row per point: 10 matches × 220 points = 2,200 points → three
// pages ([0,999], [1000,1999], [2000,2999], the last mostly empty).
const serveRows = matchSides.flatMap((match, m) =>
  Array.from({ length: POINTS_PER_MATCH }, (_, i) => {
    // Alternate the server every point, independent of which side the
    // profile played — half of each match's points are the profile's serves.
    const serverIsPlayer1 = i % 2 === 0;
    const pointId = `m${m}-p${String(i).padStart(3, "0")}`;
    return {
      id: `${pointId}-s1`,
      point_id: pointId,
      shot_number: 1,
      shot_type: "First Serve",
      ...inBox,
      points: pointMeta(pointId, match.id, serverIsPlayer1),
    };
  }),
);

// The rows this player actually served — `server_is_player1` on the point
// equals the profile's own side in that match.
const expectedServeIds = serveRows
  .filter((row) => {
    const side = matchSides.find((m) => m.id === row.points.match_id)!;
    return row.points.server_is_player1 === side.isPlayer1;
  })
  .map((row) => row.point_id);

const allPoints = asPointRows(serveRows);

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
      in(column: string, values: unknown[]) {
        pointIn.push([column, values]);
        if (column === "match_id") matchFilter = values;
        return builder;
      },
      order(column: string, opts?: { referencedTable?: string }) {
        pointOrder.push(
          opts?.referencedTable ? `${opts.referencedTable}.${column}` : column,
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
    client: { from } as unknown as Parameters<typeof serveMapFor>[0],
    pointRanges,
    pointOrder,
    pointIn,
    tables,
  };
}

test("reads 2,200 points of serves across three pages and counts every profile-side serve", async () => {
  const { client, pointRanges, pointOrder, pointIn, tables } = fakeClient();

  const { result: serve, errors } = await withConsoleErrors(() =>
    serveMapFor(client, matchSides),
  );

  expect(errors).toEqual([]);
  // Starts at `points`, never a scan of `shots`.
  expect(tables.every((table) => table === "points")).toBe(true);
  expect(pointRanges).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
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
  expect(pointIn).toContainEqual(["match_id", matchSides.map((m) => m.id)]);

  expect(expectedServeIds).toHaveLength(MATCHES * (POINTS_PER_MATCH / 2));
  expect(serve.matchCount).toBe(MATCHES);
  expect(serve.serves).toBe(expectedServeIds.length);
  expect(serve.zoneStats).not.toBeNull();
});

test("a failed page returns an empty map instead of a partial one, with one console.error", async () => {
  const { client, pointRanges } = fakeClient(2);

  const { result: serve, errors } = await withConsoleErrors(() =>
    serveMapFor(client, matchSides),
  );

  expect(serve).toEqual({
    zoneStats: null,
    matchCount: 0,
    serves: 0,
    unavailable: true,
  });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toEqual([
    "Failed to fetch serve map shots:",
    "points page failed",
  ]);
  // Stops at the failing page — no third request after the error.
  expect(pointRanges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test("no matches returns no map without reading shots", async () => {
  const { client, tables } = fakeClient();

  const serve = await serveMapFor(client, []);

  expect(serve).toEqual({
    zoneStats: null,
    matchCount: 0,
    serves: 0,
    unavailable: false,
  });
  expect(tables).toEqual([]);
});
