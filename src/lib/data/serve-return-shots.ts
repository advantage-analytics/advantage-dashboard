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

type ShotLike = { shot_type: string | null };

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

/** The serve that was actually played: second serve if present, else first. */
export function pickServeShot<T extends ShotLike>(shots: T[]): T | undefined {
  const serveRows = shots.filter((s) => isServeShotType(s.shot_type));
  return (
    serveRows.find((s) => s.shot_type === "Second Serve") ??
    serveRows.find((s) => s.shot_type === "First Serve") ??
    shots[0]
  );
}

/** The return: the first shot that is neither a serve nor a feed. */
export function pickReturnShot<T extends ShotLike>(shots: T[]): T | undefined {
  return shots.find(
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
): T[] {
  const afterServe = shots.filter((s) => {
    const t = shotType(s);
    return !isServeShotType(t) && !isFeedShotType(t);
  });
  return afterServe.slice(1);
}
