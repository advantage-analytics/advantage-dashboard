/**
 * Shared shot-role classification for serve/return analysis.
 *
 * Raw SwingVision data can't be indexed positionally: points include a `Feed`
 * row at shot_number=0, and a faulted first serve + the second serve can share
 * shot_number=1 (and the return rows can likewise collide). Positional indexing
 * mislabels a large share of points, so we pick shots by ROLE instead.
 *
 * Kept dependency-free (no Supabase import) so both the server loader
 * (`match-points-server.ts`) and the client home widget
 * (`serve-placement-home.tsx`) can share one source of truth. Pass shots
 * ordered by `shot_number` ascending so "first" means earliest.
 */

type ShotLike = { shot_type: string | null; shot_number?: number | null };

/**
 * The shots from the serve that counted on. Shot 0 holds everything struck
 * before it (`shotNumber`, `splitstep/derivation/result-type.ts`): a faulted
 * first serve, a SwingVision Feed and — on a hand-labelled point — a let or a
 * fault the players played out, rally and all. None of that is the point's
 * return or rally, and a groundstroke there read as the return drew a
 * "backhand return" on an ace. Every shot when the point has nothing numbered
 * from 1 (an untimed import), so a read never comes back empty for want of
 * numbering. Without `shotNumber` the list is returned as it is.
 */
export function countedShots<T>(
  shots: readonly T[],
  shotNumber?: (shot: T) => number | null | undefined,
): readonly T[] {
  if (!shotNumber) return shots;
  const counted = shots.filter((s) => (shotNumber(s) ?? 0) >= 1);
  return counted.length > 0 ? counted : shots;
}

/** True for either serve row (`First Serve`/`Second Serve`) — a faulted
 * first serve and the second serve actually played can share `shot_number`,
 * so this is the shared predicate every role-based picker below filters by,
 * rather than each re-deriving the two literal strings. */
export function isServeShotType(shotType: string | null | undefined): boolean {
  return shotType === "First Serve" || shotType === "Second Serve";
}

/** True for the `Feed` row SwingVision emits at shot_number=0. */
export function isFeedShotType(shotType: string | null | undefined): boolean {
  return shotType === "Feed";
}

/**
 * The serve that was actually played: second serve if present, else first.
 * `undefined` when the point has no serve row at all (e.g. a shot list of
 * just `Feed`/rally rows from a truncated read) — callers must not treat a
 * Feed row's landing coordinates as a serve.
 * Accessor-taking form, the same pattern `pickRallyShots` below uses — the
 * Visualizations tab's serve cut (`viz-model.ts`, Task 2) needs to resolve a
 * point's serve shot from `MatchPoint.shots`' camelCase `MatchShot` rows
 * (`shotType`), not the raw DB row's `shot_type`, to read that shot's own
 * `contactY`. `pickServeShot` below delegates here with the DB row's own
 * accessor so every existing snake_case caller is unchanged.
 */
export function pickServeShotBy<T>(
  shots: T[],
  shotType: (shot: T) => string | null | undefined,
  /** Each shot's `shot_number`, to skip what came before the serve that
   * counted ({@link countedShots}). */
  shotNumber?: (shot: T) => number | null | undefined,
): T | undefined {
  const serveRows = countedShots(shots, shotNumber).filter((s) =>
    isServeShotType(shotType(s)),
  );
  return (
    serveRows.find((s) => shotType(s) === "Second Serve") ??
    serveRows.find((s) => shotType(s) === "First Serve")
  );
}

/**
 * The serve that was actually played: second serve if present, else first.
 * `undefined` when the point has no serve row at all.
 */
export function pickServeShot<T extends ShotLike>(shots: T[]): T | undefined {
  return pickServeShotBy(
    shots,
    (s) => s.shot_type,
    (s) => s.shot_number,
  );
}

/** The return: the first shot from the counted serve on
 * ({@link countedShots}) that is neither a serve nor a feed. */
export function pickReturnShot<T extends ShotLike>(shots: T[]): T | undefined {
  return countedShots(shots, (s) => s.shot_number).find(
    (s) => !isServeShotType(s.shot_type) && !isFeedShotType(s.shot_type),
  );
}

/**
 * Every rally shot in a point — everything struck after the return, by
 * either player. `shots` must already be ordered by shot_number ascending
 * (both the server loader's DB rows and `MatchPoint.shots` are). Shares
 * `isServeShotType`/`isFeedShotType` with `pickServeShot`/`pickReturnShot`
 * rather than re-deriving the classification: drop every Feed/serve row,
 * then drop the first remaining row (the return — same row
 * `pickReturnShot` would pick), keeping everything after it.
 *
 * Takes a `shotType` accessor instead of extending `ShotLike` because
 * callers pass two different shapes: the raw DB row (`shot_type`, used at
 * load time) and `MatchPoint`'s camelCase `MatchShot` (`shotType`, used by
 * the Visualizations tab's rally-position cut) — one classification, two
 * field names.
 */
export function pickRallyShots<T>(
  shots: T[],
  shotType: (shot: T) => string | null | undefined,
  /** Each shot's `shot_number` ({@link countedShots}). */
  shotNumber?: (shot: T) => number | null | undefined,
): T[] {
  const afterServe = countedShots(shots, shotNumber).filter((s) => {
    const t = shotType(s);
    return !isServeShotType(t) && !isFeedShotType(t);
  });
  return afterServe.slice(1);
}
