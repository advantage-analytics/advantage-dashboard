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

  private remove(key: string, entry: Entry<V>): void {
    this.entries.delete(key);
    this.total -= entry.weight;
  }
}

/**
 * The weight of one match's points: its points and their shots. On the live
 * data an analysed match weighs about 700 on average (around a hundred
 * points, about six shots each).
 */
export function pointsWeight(points: readonly MatchPoint[]): number {
  let weight = points.length;
  for (const p of points) weight += p.shots?.length ?? 0;
  return weight;
}

/**
 * The weight bound: points plus shots held at once, per instance. At about
 * 700 a match, 250,000 is some 350 analysed matches — several full seasons,
 * so a coach moving between two big players' profiles still hits. In memory
 * that is roughly 90–115 MB at the full bound (a point is forty-odd fields
 * and its shot picks, a shot sixteen): about a twentieth of a Vercel
 * function's default 2 GB.
 */
export const SEASON_POINTS_CACHE_MAX_WEIGHT = 250_000;
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
 * What the versions read remembers between requests, per process: whether
 * the table is known to be missing (the migration not applied yet) and when
 * each kind of failure was last logged.
 */
export interface VersionsReadState {
  /** Until when the table counts as missing: no query is sent before then. */
  absentUntil: number;
  /** When "the table is missing" was last logged. */
  lastMissingWarnAt: number;
  /** When any other failure was last logged — its own clock, so a missing
   *  table's warning never hides the first sign of something else. */
  lastOtherWarnAt: number;
  now: () => number;
}

/** How long a missing table is believed before asking again — applying the
 *  migration turns the cache on within this, with no deploy. */
export const VERSIONS_ABSENT_RETRY_MS = 10 * 60 * 1000;
/** At most one failure warning per this long. */
export const VERSIONS_WARN_INTERVAL_MS = 10 * 60 * 1000;

export function versionsReadState(
  now: () => number = Date.now,
): VersionsReadState {
  return {
    absentUntil: 0,
    lastMissingWarnAt: -Infinity,
    lastOtherWarnAt: -Infinity,
    now,
  };
}

/** The process's one state. */
const processVersionsState: VersionsReadState = versionsReadState();

/** PostgREST's "no such table" (PGRST205, from its schema cache) or
 *  Postgres's own (42P01) — by code only. A message match would also catch
 *  a missing column (42703), function (42883) or role, none of which says
 *  the migration is absent. */
export function isMissingTable(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

/**
 * The points version of each of `matchIds` the viewer can read, through
 * their own client — `null` when there is no answer (the caller then caches
 * nothing). A match missing from the answer has no version the viewer can
 * see and is read uncached.
 *
 * Until the migration is applied the table does not exist: the first read
 * that says so (by code) marks it missing for `VERSIONS_ABSENT_RETRY_MS`,
 * and no query is sent meanwhile. Each kind of failure — missing, other — is
 * logged at most once per `VERSIONS_WARN_INTERVAL_MS`, on its own clock.
 */
export async function readPointsVersions(
  supabase: SupabaseClient,
  matchIds: readonly string[],
  state: VersionsReadState = processVersionsState,
): Promise<Map<string, string> | null> {
  const versions = new Map<string, string>();
  if (matchIds.length === 0) return versions;
  const now = state.now();
  if (now < state.absentUntil) return null;
  const { data, error } = await supabase
    .from("match_points_versions")
    .select("match_id, version")
    .in("match_id", [...matchIds]);
  if (error) {
    const missing = isMissingTable(error);
    if (missing) state.absentUntil = now + VERSIONS_ABSENT_RETRY_MS;
    const last = missing ? state.lastMissingWarnAt : state.lastOtherWarnAt;
    if (now - last >= VERSIONS_WARN_INTERVAL_MS) {
      if (missing) state.lastMissingWarnAt = now;
      else state.lastOtherWarnAt = now;
      console.warn(
        missing
          ? "[season-points-cache] match_points_versions is missing; reading uncached"
          : "[season-points-cache] versions unreadable; reading uncached",
        error.message,
      );
    }
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
  /** The versions read's memory; the process's own when absent. */
  versionsState?: VersionsReadState;
}

/** Reads in flight, per cache and key: a second miss for a key already
 *  being read waits for that read instead of reading again. */
const inflightByCache = new WeakMap<
  BoundedLru<MatchPoint[]>,
  Map<string, Promise<MatchPoint[] | null>>
>();

function inflightFor(cache: BoundedLru<MatchPoint[]>) {
  let inflight = inflightByCache.get(cache);
  if (!inflight) {
    inflight = new Map();
    inflightByCache.set(cache, inflight);
  }
  return inflight;
}

/**
 * A points reader for one request: `read(matchId)` answers from the cache
 * when this viewer already read that match at its current version, joins a
 * read of the same key already in flight, else calls `load` and stores a
 * successful, non-empty answer. A `null` (a failed read) or a rejection is
 * never stored — the in-flight entry goes either way, and every waiter gets
 * the failure, which the loader throws on. With no caching, or no version
 * for the match, every call is `load`.
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
    const inflight = inflightFor(cache);
    const running = inflight.get(key);
    if (running !== undefined) return running;
    const read = (async () => {
      try {
        const points = await load(matchId);
        if (points !== null && points.length > 0) cache.set(key, points);
        return points;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, read);
    return read;
  };
}
