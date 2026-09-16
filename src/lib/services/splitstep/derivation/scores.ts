/**
 * The score a point STARTS from, lifted off the vendor's predictions.
 *
 * `pred_point_score` / `pred_game_score` / `pred_set_score` ride on every
 * stroke and describe the state BEFORE that stroke; the first stroke of a rally
 * is therefore the state the point was played from — the same reading
 * `pressure.ts` uses to decide whether it was a break point. They are written
 * from the SERVER's perspective ("30-40" is server 30, returner 40) and are
 * persisted verbatim, because `points.game_score` / `point_score` have always
 * been server-first (`process-match/index.ts`) and every reader absolutizes
 * through `server_is_player1`.
 *
 * Nothing here judges the values. `parse.ts` has already nulled the sentinels
 * ("None", "nan-nan"), and a low-confidence score is still the only score the
 * film room can show — the alternative is a fabricated 0-0, which is worse.
 */

import type { SplitStepRally } from "./types";

export interface PointScores {
  set_score: string | null;
  game_score: string | null;
  point_score: string | null;
}

export function pointScoresOf(
  rally: Pick<SplitStepRally, "strokes">,
): PointScores {
  const first = rally.strokes[0];
  return {
    set_score: first?.predSetScore ?? null,
    game_score: first?.predGameScore ?? null,
    point_score: first?.predPointScore ?? null,
  };
}
