import { NetGameBody } from "@/components/dashboard/matches/match-detail/net-game-body";
import { SEASON_OPPONENTS_LABEL } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { surname } from "@/lib/data/match-utils";
import type { SeasonNetGame } from "@/lib/data/player-season";

/**
 * The team player profile's season Net game (design Q, the `CohesiveQ`
 * board): the match report's card, drawn over a season. The player's surname
 * heads the first row, "Opponents" the second, and each row is that side's
 * net points summed over every analyzed match (`seasonNetGame`,
 * `lib/data/player-season.ts`) — the endings bar, the "came in by" bar and
 * its line — with the report's own chrome and legend.
 *
 * Lobbed is its own segment only when EVERY analyzed match knew its lobs
 * (`SeasonNetGame.hasLobs`); one match without them would put its lobs among
 * the passes, so the segment reads "Passed or lobbed" then, as the report
 * does without a ball-paths file.
 *
 * Static on purpose. The report's segments open their points in Video; a
 * season segment is many matches, with no one film to open, so no `watch` is
 * passed and the body draws the read-only card.
 *
 * Nothing here decides a side (guardrails §4): the fold tallied every match
 * with that match's own seat. With no net point — no analyzed match, or
 * nobody came in — the anatomy still draws: both names, a dash for each
 * total, empty tracks, the legend, and one sentence saying what fills it.
 */

/**
 * The one sentence under the empty tracks: with nothing analyzed, what the
 * card will hold and when; with matches analyzed but no net point, why the
 * tracks are empty.
 */
export function seasonNetEmptySentence(
  playerName: string,
  analyzed: number,
): string {
  return analyzed === 0
    ? `Net points add up here once one of ${surname(playerName)}'s matches is analyzed.`
    : "Neither side came to the net in these matches.";
}

export function SeasonNetGameCard({
  playerName,
  analyzed,
  netGame,
}: {
  /** The player's full name; the first row shows their surname. */
  playerName: string;
  /** Matches with points — what `netGame` was summed from. */
  analyzed: number;
  /** `seasonNetGame()` — both sides' tallies and whether lobs were known. */
  netGame: SeasonNetGame;
}) {
  return (
    <NetGameBody
      headingId="season-net-game-heading"
      youTally={netGame.you}
      oppTally={netGame.opp}
      youName={surname(playerName)}
      oppName={SEASON_OPPONENTS_LABEL}
      hasLobs={netGame.hasLobs}
      emptySentence={seasonNetEmptySentence(playerName, analyzed)}
    />
  );
}
