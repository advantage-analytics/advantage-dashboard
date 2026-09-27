import { expect, test } from "@playwright/test";

import { fetchAllPages } from "@/lib/data/paged-query";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { createLoader } from "./fixtures/vm-modules";
import { withConsoleErrors } from "./fixtures/with-console-errors";

/**
 * `fetchAllPages` is the fail-closed paged read (T2): every row in order, or
 * `null` — never the pages that happened to arrive before an error. The second
 * half drives `getMatchPointsFromSupabase` through the vm loader with the
 * server client stubbed, so the shots read it replaced is covered end to end.
 */

type Page<T> = { data: T[] | null; error: { message: string } | null };

function pager<T>(rows: T[], failOn?: number) {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number): Promise<Page<T>> => {
    calls.push([from, to]);
    if (calls.length === failOn)
      return { data: null, error: { message: "boom" } };
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, calls };
}

const rows = Array.from({ length: 2500 }, (_, i) => ({ n: i }));

test("reads 2,500 rows as pages of 1000/1000/500, every row in order", async () => {
  const { page, calls } = pager(rows);

  const all = await fetchAllPages(page);

  expect(calls).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  expect(all).not.toBeNull();
  expect(all!.map((row) => row.n)).toEqual(rows.map((row) => row.n));
});

test("an error on page 2 yields null, not the first page", async () => {
  const { page, calls } = pager(rows, 2);

  expect(await fetchAllPages(page)).toBeNull();
  // Stops at the failing page — no third request after the error.
  expect(calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test("an exact multiple of the page size ends on the empty page after it", async () => {
  const { page, calls } = pager(rows.slice(0, 2000));

  const all = await fetchAllPages(page);

  expect(all).toHaveLength(2000);
  expect(calls).toHaveLength(3);
});

test("a null data page reads as empty and honours a custom page size", async () => {
  const empty = await fetchAllPages(async () => ({ data: null, error: null }));
  expect(empty).toEqual([]);

  const { page, calls } = pager(rows.slice(0, 5));
  const all = await fetchAllPages(page, 2);
  expect(all!.map((row) => row.n)).toEqual([0, 1, 2, 3, 4]);
  expect(calls).toEqual([
    [0, 1],
    [2, 3],
    [4, 5],
  ]);
});

// ── getMatchPointsFromSupabase ──────────────────────────────────────────────

const POINTS = 10;
const SHOTS_PER_POINT = 250; // 2,500 shots → three pages

const dbPoints = Array.from({ length: POINTS }, (_, i) => ({
  id: `p${String(i).padStart(2, "0")}`,
  point_number: i + 1,
  set_number: 1,
  game_number: 1,
  set_score: "0-0",
  game_score: "0-0",
  point_score: "0-0",
  result_type: "Winner",
  won_by_player1: true,
  server_is_player1: true,
  is_break_point: false,
  is_set_point: false,
  is_match_point: false,
  rally_length: SHOTS_PER_POINT,
  duration: null,
  video_time: null,
}));

// Already in the (point_id, shot_number, id) order the loader asks for.
const dbShots = dbPoints.flatMap((point) =>
  Array.from({ length: SHOTS_PER_POINT }, (_, n) => ({
    id: `${point.id}-s${String(n + 1).padStart(3, "0")}`,
    point_id: point.id,
    shot_number: n + 1,
    is_player1: n % 2 === 0,
    shot_type: n === 0 ? "First Serve" : "Forehand",
    spin_type: null,
    speed_mph: null,
    video_time: null,
    bounce_video_time: null,
    zone: null,
    result: "In",
    contact_x: null,
    contact_y: null,
    landing_x: null,
    landing_y: null,
  })),
);

function fakeClient(failShotPage?: number, failPoints = false) {
  const shotRanges: [number, number][] = [];
  const shotOrder: string[] = [];

  function query(table: string) {
    let range: [number, number] | null = null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order(column: string) {
        if (table === "shots") shotOrder.push(column);
        return builder;
      },
      range(from: number, to: number) {
        range = [from, to];
        shotRanges.push(range);
        return builder;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      then<R>(resolve: (value: Page<unknown>) => R) {
        let result: Page<unknown>;
        if (table === "points")
          result = failPoints
            ? { data: null, error: { message: "points read failed" } }
            : { data: dbPoints, error: null };
        else if (table === "shots" && range) {
          result =
            shotRanges.length === failShotPage
              ? { data: null, error: { message: "shots page failed" } }
              : { data: dbShots.slice(range[0], range[1] + 1), error: null };
        } else result = { data: [], error: null };
        return Promise.resolve(result).then(resolve);
      },
    };
    return builder;
  }

  return {
    client: { from: query, rpc: async () => ({ data: [], error: null }) },
    shotRanges,
    shotOrder,
  };
}

function loadGetMatchPoints(client: unknown) {
  const loader = createLoader({
    stubs: { "@/lib/supabase/server": { createClient: async () => client } },
  });
  const mod = loader.load("src/lib/data/match-points-server.ts");
  return mod.getMatchPointsFromSupabase as (
    matchId: string,
  ) => Promise<MatchPoint[] | null>;
}

test("getMatchPointsFromSupabase attaches every shot across three pages", async () => {
  const { client, shotRanges, shotOrder } = fakeClient();
  const getMatchPoints = loadGetMatchPoints(client);

  const { result, errors } = await withConsoleErrors(() =>
    getMatchPoints("match-1"),
  );

  expect(errors).toEqual([]);
  expect(shotRanges).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  // The total order pages depend on — without it pages overlap or skip.
  expect(shotOrder.slice(0, 3)).toEqual(["point_id", "shot_number", "id"]);
  expect(result).toHaveLength(POINTS);
  const shotIds = result!.flatMap((point) =>
    (point.shots ?? []).map((shot) => shot.id),
  );
  expect(shotIds).toEqual(dbShots.map((shot) => shot.id));
});

test("getMatchPointsFromSupabase returns null with one console.error when a shots page fails", async () => {
  const { client, shotRanges } = fakeClient(2);
  const getMatchPoints = loadGetMatchPoints(client);

  const { result, errors } = await withConsoleErrors(() =>
    getMatchPoints("match-1"),
  );

  expect(result).toBeNull();
  expect(errors).toHaveLength(1);
  expect(errors[0]).toEqual(["Failed to fetch shots:", "shots page failed"]);
  expect(shotRanges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test("getMatchPointsFromSupabase returns null with one console.error when the points read fails", async () => {
  const { client, shotRanges } = fakeClient(undefined, true);
  const getMatchPoints = loadGetMatchPoints(client);

  const { result, errors } = await withConsoleErrors(() =>
    getMatchPoints("match-1"),
  );

  // "No answer", not a match with no points — `[]` is reserved for that.
  expect(result).toBeNull();
  expect(errors).toHaveLength(1);
  expect(errors[0]).toEqual(["Failed to fetch points:", "points read failed"]);
  // Stops before the shots read.
  expect(shotRanges).toEqual([]);
});
