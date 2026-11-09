import type { SupabaseClient } from "@supabase/supabase-js";

import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * A bounded, in-process cache of one match's points for the team player
 * profile's season (`player-season-server.ts`), so a click on the
 * Visualizations tab — every wall card, lightbox filter and You/Opponent
 * switch is a `router.replace` that renders the page again on the server —
 * does not re-read every analyzed match's points and shots.
 *
 * ── Why in-process, not Next's caches ───────────────────────────────────────
 * `'use cache'` is a Cache Components feature (`cacheComponents` in
 * `next.config.ts`, an app-wide switch this app has not made), and
 * `unstable_cache` serialises its value into the platform's shared data
 * cache: a season's points are megabytes, the data cache is remote and size
 * capped, and an entry there would sit outside the instance that read it.
 * A per-instance LRU keeps the points in the process that read them, under a
 * hard weight bound, and costs nothing when it misses.
 *
 * ── RLS ─────────────────────────────────────────────────────────────────────
 * An entry is keyed by the VIEWER (their auth user id), the program, the
 * match and the match's points version — never shared between viewers, so a
 * hit can only ever hand a viewer points they themselves read through their
 * own client. Every request still runs, as that viewer, the reads that say
 * which matches the season holds (the roster RPC and matches read, the job
 * state, the stats rows) and the version read below, which is RLS-scoped
 * too: a match the viewer can no longer read returns no version, and a match
 * with no version is never served from here. What is cached is only what
 * `getMatchPointsFromSupabase` returns; the service-role ball-paths reads
 * are never cached.
 *
 * ── Invalidation ────────────────────────────────────────────────────────────
 * `match_points_versions` (migration `…_match_points_versions.sql`) holds a
 * counter per match that statement triggers on `points` and `shots` bump on
 * every insert, update and delete — a re-derivation, a label publish, a
 * score-edit rebuild, an autofix, a backfill. The version is part of the
 * key, so a changed match misses and is read again. Everything else a season
 * depends on — which matches, their seats, flags, analysis state and stats —
 * is read fresh on every request and never cached.
 *
 * The version is read BEFORE the points, so what is stored under a version
 * is at least that new: a write between the two reads bumps the version, and
 * the next request misses rather than being served the older points.
 *
 * Fail open: when the version read fails (the migration not applied yet, a
 * network error), the request reads every match itself, exactly as before
 * this cache existed. A cache that cannot say what is current is skipped,
 * never trusted.
 */

/** What one cached match's points are keyed by. */
export interface SeasonPointsCacheKey {
  /** The signed-in viewer — entries are never shared between viewers. */
  viewerId: string;
  /** The program (workspace) the season is read in. */
  programId: string;
  matchId: string;
  /** `match_points_versions.version` as the viewer read it this request. */
  version: string;
}

/** The cache key, spelled out. Every part is an id or a counter, so `|`
 *  cannot appear inside one. */
export function seasonPointsCacheKey(key: SeasonPointsCacheKey): string {
  return `${key.viewerId}|${key.programId}|${key.matchId}|${key.version}`;
}

interface Entry<V> {
  value: V;
  weight: number;
  expiresAt: number;
}

export interface BoundedLruOptions<V> {
  /** The most weight the cache holds; the least recently used go first. */
  maxWeight: number;
  /** How long an entry lives after it is stored, in ms. */
  ttlMs: number;
  /** An entry's weight (≥ 1). An entry heavier than `maxWeight` is never kept. */
  weigh: (value: V) => number;
  /** The clock — `Date.now` in production, a fake in specs. */
  now?: () => number;
}

/**
 * A least-recently-used map bounded by total weight and entry age. `Map`
 * keeps insertion order, so a hit is moved to the end by re-inserting and
 * eviction takes from the front.
 */
export class BoundedLru<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private total = 0;
  private readonly now: () => number;

  constructor(private readonly options: BoundedLruOptions<V>) {
    this.now = options.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.remove(key, entry);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    const existing = this.entries.get(key);
    if (existing) this.remove(key, existing);
    const weight = Math.max(1, this.options.weigh(value));
    if (weight > this.options.maxWeight) return;
    this.entries.set(key, {
      value,
      weight,
      expiresAt: this.now() + this.options.ttlMs,
    });
    this.total += weight;
    for (const [oldest, entry] of this.entries) {
      if (this.total <= this.options.maxWeight) break;
      this.remove(oldest, entry);
    }
  }

  /** Total weight held. */
  get weight(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  /** The keys held, least recently used first. */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }

  private remove(key: string, entry: Entry<V>): void {
    this.entries.delete(key);
    this.total -= entry.weight;
  }
}

/**
 * The weight of one match's points: its points and their shots. A point is a
 * few hundred bytes and a shot about as much again, so 40,000 is a few tens
 * of megabytes per instance — a squad's worth of seasons, a few hundred
 * matches.
 */
export function pointsWeight(points: readonly MatchPoint[]): number {
  let weight = points.length;
  for (const p of points) weight += p.shots?.length ?? 0;
  return weight;
}

/** The weight bound: points plus shots held at once, per instance. */
export const SEASON_POINTS_CACHE_MAX_WEIGHT = 40_000;
/** How long an entry lives. The version already invalidates a changed
 *  match; the age bound only lets memory go back after a session ends. */
export const SEASON_POINTS_CACHE_TTL_MS = 10 * 60 * 1000;

/** The process's one cache. Module scope: it lives as long as the instance. */
export const seasonPointsCache = new BoundedLru<MatchPoint[]>({
  maxWeight: SEASON_POINTS_CACHE_MAX_WEIGHT,
  ttlMs: SEASON_POINTS_CACHE_TTL_MS,
  weigh: pointsWeight,
});

/**
 * The points version of each of `matchIds` the viewer can read, through
 * their own client — `null` when the read failed (the caller then caches
 * nothing). A match missing from the answer has no version the viewer can
 * see and is read uncached.
 */
export async function readPointsVersions(
  supabase: SupabaseClient,
  matchIds: readonly string[],
): Promise<Map<string, string> | null> {
  const versions = new Map<string, string>();
  if (matchIds.length === 0) return versions;
  const { data, error } = await supabase
    .from("match_points_versions")
    .select("match_id, version")
    .in("match_id", [...matchIds]);
  if (error) {
    console.warn(
      "[season-points-cache] versions unreadable; reading uncached",
      error.message,
    );
    return null;
  }
  for (const row of (data ?? []) as {
    match_id: string;
    version: number | string;
  }[]) {
    versions.set(row.match_id, String(row.version));
  }
  return versions;
}

/** Who and where a season is read, for the cache key. `null` caches nothing. */
export interface SeasonPointsScope {
  viewerId: string;
  programId: string;
}

/**
 * Where a season's points may be cached across requests: the process's
 * cache and who is reading in which program. `null` reads every match
 * itself — what the specs pass, and what a request with no signed-in user
 * gets.
 */
export interface SeasonPointsCaching {
  cache: BoundedLru<MatchPoint[]>;
  scope: SeasonPointsScope;
}

/**
 * A points reader for one request: `read(matchId)` answers from the cache
 * when this viewer already read that match at its current version, else
 * calls `load` and stores a successful, non-empty answer. A `null` (a failed
 * read) is never stored — the loader throws on it. With no caching, or no
 * version for the match, every call is `load`.
 */
export function cachedPointsReader(
  caching: SeasonPointsCaching | null,
  versions: ReadonlyMap<string, string> | null,
  load: (matchId: string) => Promise<MatchPoint[] | null>,
): (matchId: string) => Promise<MatchPoint[] | null> {
  return async (matchId) => {
    const version = versions?.get(matchId);
    if (caching === null || version === undefined) return load(matchId);
    const { cache, scope } = caching;
    const key = seasonPointsCacheKey({ ...scope, matchId, version });
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const points = await load(matchId);
    if (points !== null && points.length > 0) cache.set(key, points);
    return points;
  };
}
