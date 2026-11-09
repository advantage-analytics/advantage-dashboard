import { expect, test } from "@playwright/test";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BoundedLru,
  cachedPointsReader,
  pointsWeight,
  readPointsVersions,
  seasonPointsCacheKey,
  SEASON_POINTS_CACHE_MAX_WEIGHT,
  SEASON_POINTS_CACHE_TTL_MS,
  seasonPointsCache,
  versionsReadState,
  VERSIONS_ABSENT_RETRY_MS,
  VERSIONS_WARN_INTERVAL_MS,
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

/** A match's points weighing about what an analysed match does: 250 points
 *  of three shots each, 1,000 in all. */
function analysedMatch(matchId: string): MatchPoint[] {
  return Array.from({ length: 250 }, (_, i) => ({
    id: `${matchId}-p${i}`,
    shots: [{}, {}, {}],
  })) as unknown as MatchPoint[];
}

test("a 60-match season — past the old 40,000 bound — and a second one beside it still hit in full", async () => {
  const cache = new BoundedLru<MatchPoint[]>({
    maxWeight: SEASON_POINTS_CACHE_MAX_WEIGHT,
    ttlMs: SEASON_POINTS_CACHE_TTL_MS,
    weigh: pointsWeight,
  });
  const seasons = ["ada", "bea"].map((who) =>
    Array.from({ length: 60 }, (_, i) => `${who}-m${i}`),
  );
  expect(pointsWeight(analysedMatch("x")) * 60).toBeGreaterThan(40_000);
  const loads: string[] = [];
  const readerFor = (ids: string[]) =>
    cachedPointsReader(
      { cache, scope: { viewerId: "u-coach", programId: "prog-1" } },
      new Map(ids.map((id) => [id, "1"])),
      async (id) => {
        loads.push(id);
        return analysedMatch(id);
      },
    );
  // Both seasons, then both again — a coach flipping between two profiles.
  for (const pass of [1, 2])
    for (const ids of seasons) {
      const read = readerFor(ids);
      for (const id of ids) await read(id);
      if (pass === 2) expect(loads).toHaveLength(120);
    }
  expect(loads).toHaveLength(120);
});

test("concurrent misses for one key share a read; a failure is shared, not cached, and the next call reads again", async () => {
  const versions = new Map([["m-1", "3"]]);
  const cache = new BoundedLru<MatchPoint[]>({
    maxWeight: 100,
    ttlMs: 60_000,
    weigh: pointsWeight,
  });
  const caching = { cache, scope: { viewerId: "u-1", programId: "prog-1" } };
  let calls = 0;
  let outcome: "ok" | "null" | "throw" = "throw";
  const read = cachedPointsReader(caching, versions, async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    if (outcome === "throw") throw new Error("boom");
    return outcome === "null" ? null : POINTS;
  });

  const failed = await Promise.allSettled([read("m-1"), read("m-1")]);
  expect(failed.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  expect(calls).toBe(1);
  expect(cache.size).toBe(0);

  outcome = "null";
  expect(await Promise.all([read("m-1"), read("m-1")])).toEqual([null, null]);
  expect(calls).toBe(2);
  expect(cache.size).toBe(0);

  outcome = "ok";
  const [a, b] = await Promise.all([read("m-1"), read("m-1")]);
  expect(a).toBe(POINTS);
  expect(b).toBe(POINTS);
  expect(calls).toBe(3);
  expect(await read("m-1")).toBe(POINTS);
  expect(calls).toBe(3);
});

function versionsClient(error: { code?: string; message: string } | null) {
  let queries = 0;
  const query = {
    select: () => query,
    in: () =>
      Promise.resolve(
        error
          ? { data: null, error }
          : { data: [{ match_id: "m-1", version: 2 }], error: null },
      ),
  };
  const client = {
    from: () => {
      queries += 1;
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, queries: () => queries };
}

async function quietly<T>(fn: () => Promise<T>) {
  const warnings: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    return { value: await fn(), warnings };
  } finally {
    console.warn = warn;
  }
}

test("a missing versions table is asked about once, then not until the retry interval has passed", async () => {
  let now = 1_000;
  const state = versionsReadState(() => now);
  const missing = versionsClient({
    code: "PGRST205",
    message: "Could not find the table 'public.match_points_versions'",
  });
  const { warnings } = await quietly(async () => {
    expect(await readPointsVersions(missing.client, ["m-1"], state)).toBeNull();
    now += VERSIONS_ABSENT_RETRY_MS - 1;
    expect(await readPointsVersions(missing.client, ["m-1"], state)).toBeNull();
  });
  expect(missing.queries()).toBe(1);
  expect(warnings).toHaveLength(1);

  // The migration is applied meanwhile: the next ask after the interval
  // finds the table and caching resumes.
  now += 1;
  const present = versionsClient(null);
  expect(await readPointsVersions(present.client, ["m-1"], state)).toEqual(
    new Map([["m-1", "2"]]),
  );
  expect(present.queries()).toBe(1);
});

test("any other versions failure is asked again every request, but warned about once per interval", async () => {
  let now = 1_000;
  const state = versionsReadState(() => now);
  const flaky = versionsClient({ message: "fetch failed" });
  const { warnings } = await quietly(async () => {
    for (let i = 0; i < 3; i++) {
      expect(await readPointsVersions(flaky.client, ["m-1"], state)).toBeNull();
      now += 1_000;
    }
    now += VERSIONS_WARN_INTERVAL_MS;
    await readPointsVersions(flaky.client, ["m-1"], state);
  });
  expect(flaky.queries()).toBe(4);
  expect(warnings).toHaveLength(2);
});
