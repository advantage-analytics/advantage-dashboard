/**
 * Replayed lets as points: what a reader needs to leave them out.
 *
 * A hand-labelled publish writes a point the labeller marked `let_replayed`
 * as a whole `points` row — strokes and all, flagged `let_replayed`,
 * `result_type` 'Let' — so the Video tab can show it (`labels/apply.ts`). It
 * is no point: it moves no score, and its `won_by_player1` is a placeholder
 * (the server) that NOT NULL forces. Every reader that counts must skip it:
 *
 * - `getMatchPointsFromSupabase` drops it unless asked (`includeLetReplayed`),
 *   so the match report, the share page and every season loader never see it.
 *   Only the Video tab's list reads it, as `MatchDataProvider`'s `letPoints`.
 * - A reader that queries `points` itself filters with `withoutLetPoints` or
 *   `LET_POINT_FILTER`.
 * - The SQL readers (`calculate_match_stats`, `key_moments`, the Ask views)
 *   filter the flag in migration `…_let_points_count_as_nothing`.
 *
 * Kept apart from `derivation/flags.ts` so a client component can read it
 * without pulling the derivation in; `tests/let-points.spec.ts` pins the two
 * to one string.
 */

/** `points.flags` code on a replayed let. Same string as `LET_REPLAYED_FLAG`. */
export const LET_POINT_FLAG = "let_replayed";

/**
 * A PostgREST filter that leaves let points out: `flags` is jsonb, NOT NULL
 * (default `[]`), so `not.cs` never drops a row for a missing value.
 * `query.not(...LET_POINT_FILTER)`.
 */
export const LET_POINT_FILTER = [
  "flags",
  "cs",
  JSON.stringify([LET_POINT_FLAG]),
] as const;

/** Whether a `points.flags` value (jsonb, read raw) marks a replayed let. */
export function isLetPointFlags(flags: unknown): boolean {
  return Array.isArray(flags) && flags.includes(LET_POINT_FLAG);
}

/** The points that count: every one but a replayed let. */
export function withoutLetPoints<T extends { letReplayed?: boolean }>(
  points: readonly T[],
): T[] {
  return points.filter((point) => !point.letReplayed);
}
