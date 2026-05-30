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

/** The serve that was actually played: second serve if present, else first. */
export function pickServeShot<T extends ShotLike>(shots: T[]): T | undefined {
  const serveRows = shots.filter(
    (s) => s.shot_type === "First Serve" || s.shot_type === "Second Serve",
  );
  return (
    serveRows.find((s) => s.shot_type === "Second Serve") ??
    serveRows.find((s) => s.shot_type === "First Serve") ??
    shots[0]
  );
}

/** The return: the first shot that is neither a serve nor a feed. */
export function pickReturnShot<T extends ShotLike>(shots: T[]): T | undefined {
  return shots.find(
    (s) =>
      s.shot_type !== "First Serve" &&
      s.shot_type !== "Second Serve" &&
      s.shot_type !== "Feed",
  );
}
