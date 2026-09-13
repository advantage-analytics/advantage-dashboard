/**
 * The athlete on an EXISTING `matches` row, in `uploadEligibility()`'s terms.
 *
 * Lifted verbatim from `app/api/splitstep/upload-url/handler.ts` (T15) when
 * `/api/splitstep/jobs` (T16) needed the identical mapping before it spends
 * quota. Two server seams ask the upload contract about the same row — one
 * before the bytes move, one before the allowance is charged — and a second
 * copy of how `player1_id` becomes an `AthleteChoice` is a second copy that
 * can drift into a check that looks enforced on one side and is not on the
 * other. Pure, so both route handlers and their fixture tests can call it.
 */

import type { AthleteChoice } from "@/lib/workspace/upload-eligibility";

/** The two columns of `matches` the mapping reads. */
export interface MatchAthleteRow {
  /** NULL is a personal match; a program id is whose roster the athlete is on. */
  program_id: string | null;
  /**
   * The athlete on the row — a `program_players.id`, or on an older row a
   * login id; the uploader's own login on a personal match. NULL is nobody.
   */
  player1_id: string | null;
}

/**
 * The row's athlete, in the contract's terms.
 *
 * A personal match is the uploader's own: NULL or their login is `self`, and
 * anything else is a roster choice that `uploadEligibility()` refuses as
 * `athlete-not-personal`. A team match names whoever `player1_id` names, or
 * nobody — NULL is passed through as nothing chosen, not rewritten to the
 * uploader, for the reason the contract's header gives: a coach's login on an
 * athlete's row hands the coach read access the athlete then loses. A
 * player-role member whose row carries their own login is still a `roster`
 * choice here, resolved by the roster rather than by equality with the
 * caller — that is what lets an arm-3 player pass and a staff login fail.
 */
export function athleteOnRow(
  match: MatchAthleteRow,
  userId: string,
): AthleteChoice | null {
  if (match.program_id === null) {
    return match.player1_id === null || match.player1_id === userId
      ? { kind: "self" }
      : { kind: "roster", playerId: match.player1_id };
  }
  return match.player1_id === null
    ? null
    : { kind: "roster", playerId: match.player1_id };
}
