import { expect, test } from "@playwright/test";

import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  BoundedLru,
  cachedPointsReader,
  pointsWeight,
  seasonPointsCacheKey,
  SEASON_POINTS_CACHE_MAX_WEIGHT,
  seasonPointsCache,
} from "@/lib/data/season-points-cache";

/**
 * The season points cache (`lib/data/season-points-cache.ts`) on its own:
 * the key, the LRU's bounds, and the reader's rules — what is served, what
 * is stored, what never is. The loader wired to it is pinned in
 * `tests/player-season-loader.spec.ts` ("Points across requests").
 */

const KEY = {
  viewerId: "u-1",
  programId: "prog-1",
  matchId: "m-1",
  version: "3",
};

test("the key changes with every part: viewer, program, match and version", () => {
  const base = seasonPointsCacheKey(KEY);
  for (const part of Object.keys(KEY) as (keyof typeof KEY)[]) {
    expect(
      seasonPointsCacheKey({ ...KEY, [part]: `${KEY[part]}x` }),
      part,
    ).not.toBe(base);
  }
  expect(seasonPointsCacheKey({ ...KEY })).toBe(base);
});

function lru(maxWeight = 10, ttlMs = 1000) {
  let now = 0;
  const cache = new BoundedLru<{ w: number }>({
    maxWeight,
    ttlMs,
    weigh: (v) => v.w,
    now: () => now,
  });
  return { cache, tick: (ms: number) => (now += ms) };
}

test("the LRU evicts the least recently used past its weight, and a hit counts as use", () => {
  const { cache } = lru(10);
  cache.set("a", { w: 4 });
  cache.set("b", { w: 4 });
  expect(cache.get("a")).toEqual({ w: 4 }); // a is now the most recent
  cache.set("c", { w: 4 }); // 12 > 10: b goes, not a
  expect(cache.keys()).toEqual(["a", "c"]);
  expect(cache.weight).toBe(8);
  cache.set("a", { w: 1 }); // replacing re-weighs
  expect(cache.weight).toBe(5);
});

test("an entry heavier than the whole cache is never kept", () => {
  const { cache } = lru(10);
  cache.set("a", { w: 3 });
  cache.set("huge", { w: 11 });
  expect(cache.has("huge")).toBe(false);
  expect(cache.keys()).toEqual(["a"]);
});

test("an entry expires after its age bound", () => {
  const { cache, tick } = lru(10, 1000);
  cache.set("a", { w: 1 });
  tick(999);
  expect(cache.get("a")).toBeDefined();
  tick(1);
  expect(cache.get("a")).toBeUndefined();
  expect(cache.size).toBe(0);
  expect(cache.weight).toBe(0);
});

const POINTS = [
  { id: "p1", shots: [{}, {}] },
  { id: "p2" },
] as unknown as MatchPoint[];

test("a point weighs one plus its shots", () => {
  expect(pointsWeight(POINTS)).toBe(4);
});

test("the process cache is bounded", () => {
  expect(SEASON_POINTS_CACHE_MAX_WEIGHT).toBeGreaterThan(0);
  expect(seasonPointsCache.weight).toBeLessThanOrEqual(
    SEASON_POINTS_CACHE_MAX_WEIGHT,
  );
});

function reader(
  versions: Map<string, string> | null,
  answer: MatchPoint[] | null = POINTS,
  scope: { viewerId: string; programId: string } | null = {
    viewerId: "u-1",
    programId: "prog-1",
  },
) {
  const cache = new BoundedLru<MatchPoint[]>({
    maxWeight: 100,
    ttlMs: 60_000,
    weigh: pointsWeight,
  });
  const loads: string[] = [];
  const read = cachedPointsReader(
    scope === null ? null : { cache, scope },
    versions,
    async (id) => {
      loads.push(id);
      return answer;
    },
  );
  return { cache, loads, read };
}

test("the reader serves a hit at the same version and loads a miss once", async () => {
  const { read, loads } = reader(new Map([["m-1", "3"]]));
  expect(await read("m-1")).toBe(POINTS);
  expect(await read("m-1")).toBe(POINTS);
  expect(loads).toEqual(["m-1"]);
});

test("the reader never caches without a scope, without versions, or for a match with no version", async () => {
  for (const r of [
    reader(new Map([["m-1", "3"]]), POINTS, null),
    reader(null),
    reader(new Map([["m-2", "3"]])),
  ]) {
    await r.read("m-1");
    await r.read("m-1");
    expect(r.loads).toEqual(["m-1", "m-1"]);
    expect(r.cache.size).toBe(0);
  }
});

test("the reader stores neither a failed read nor an empty match", async () => {
  for (const answer of [null, []]) {
    const r = reader(new Map([["m-1", "3"]]), answer);
    expect(await r.read("m-1")).toEqual(answer);
    expect(r.cache.size).toBe(0);
  }
});
