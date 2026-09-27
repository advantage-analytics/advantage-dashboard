import { expect, test } from "@playwright/test";

import { serveMapFor } from "@/lib/data/player-profile-server";
import { withConsoleErrors } from "./fixtures/with-console-errors";
import { inBox, pointMeta } from "./fixtures/serve-dot-row-fixtures";

/**
 * `serveMapFor` reads the player-profile serve map (T4) — the same job
 * `loadHomeServes` (`home-serve-data.ts`, T3) does for the Home widget, one
 * task ago. The shots read is serve rows only, in a total order, paged
 * through the fail-closed `fetchAllPages` — the ten most recent matches'
 * serve rows sit well past PostgREST's 1000-row cap, so a single request
 * would silently plot a partial map while still claiming to have read every
 * match.
 *
 * The fake client below sorts by the orders the loader applies and slices by
 * `.range()`, so the loader has to issue three pages to see every row —
 * mirrors the chainable fake in `schedule-outcome-loader.spec.ts` and
 * `home-serve-data.spec.ts`.
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

// One serve row per point: 10 matches × 220 points = 2,200 rows → three
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
      in(column: string, values: unknown[]) {
        shotIn.push([column, values]);
        if (column === "points.match_id") matchFilter = values;
        return builder;
      },
      order(column: string) {
        orders.push(column);
        shotOrder.push(column);
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
            const rows = serveRows
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
    client: { from } as unknown as Parameters<typeof serveMapFor>[0],
    shotRanges,
    shotOrder,
    shotIn,
    tables,
  };
}

test("reads 2,200 serve rows across three pages and counts every profile-side serve", async () => {
  const { client, shotRanges, shotOrder, shotIn, tables } = fakeClient();

  const { result: serve, errors } = await withConsoleErrors(() =>
    serveMapFor(client, matchSides),
  );

  expect(errors).toEqual([]);
  expect(tables.every((table) => table === "shots")).toBe(true);
  expect(shotRanges).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  // Total order, so pages never overlap or skip.
  expect(shotOrder.slice(0, 3)).toEqual(["point_id", "shot_number", "id"]);
  expect(shotIn).toContainEqual(["shot_type", ["First Serve", "Second Serve"]]);
  expect(shotIn).toContainEqual([
    "points.match_id",
    matchSides.map((m) => m.id),
  ]);

  expect(expectedServeIds).toHaveLength(MATCHES * (POINTS_PER_MATCH / 2));
  expect(serve.matchCount).toBe(MATCHES);
  expect(serve.serves).toBe(expectedServeIds.length);
  expect(serve.zoneStats).not.toBeNull();
});

test("a failed page returns an empty map instead of a partial one, with one console.error", async () => {
  const { client, shotRanges } = fakeClient(2);

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
    "shots page failed",
  ]);
  // Stops at the failing page — no third request after the error.
  expect(shotRanges).toEqual([
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
