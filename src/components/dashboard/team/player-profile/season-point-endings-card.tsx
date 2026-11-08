import { PointEndingsBody } from "@/components/dashboard/matches/match-detail/point-endings-body";
import { SEASON_OPPONENTS_LABEL } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { surname } from "@/lib/data/match-utils";
import type { SeasonOutcomes } from "@/lib/data/player-season";

/**
 * The team player profile's season "How points ended" (design Q, the
 * `CohesiveQ` board): the match report's card, drawn over a season. The
 * player's surname heads the first bar, "Opponents" the second, and each bar
 * is that side's own decisive shots summed over every analyzed match
 * (`seasonOutcomes`, `lib/data/player-season.ts`) — winners, aces, service
 * winners, errors, double faults — with the report's own chrome: the
 * eyebrow, the "Own outcomes" micro, the legend with its Double faults entry.
 *
 * Static on purpose. The report's segments open their points in Video; a
 * season segment is many matches, with no one film to open, so no `watch` is
 * passed and the body draws the read-only card — the same bars, hatching and
 * dark readout on hover, with nothing to click.
 *
 * The errors segment follows the fold's split: Unforced + Forced only when
 * every analyzed match has judged its errors, one "Errors" segment otherwise
 * (`SeasonOutcomes.errorSplitJudged`), as the season Head to head's rows do.
 *
 * Nothing here decides a side (guardrails §4): the fold tallied every match
 * with that match's own seat, and this card only names the two rows. With no
 * analyzed match the anatomy still draws — both names, a dash for each
 * total, empty tracks, the legend — and one sentence says what fills it.
 */

/**
 * The one sentence under the empty tracks: with nothing analyzed, what the
 * card will hold and when; with matches analyzed but no outcome recorded,
 * why the tracks are empty.
 */
export function seasonEndingsEmptySentence(
  playerName: string,
  analyzed: number,
): string {
  return analyzed === 0
    ? `Winners, aces and errors add up here once one of ${surname(playerName)}'s matches is analyzed.`
    : "No point in these matches records how it ended.";
}

export function SeasonPointEndingsCard({
  playerName,
  analyzed,
  outcomes,
}: {
  /** The player's full name; the first row shows their surname. */
  playerName: string;
  /** Matches with points — what `outcomes` was summed from. */
  analyzed: number;
  /** `seasonOutcomes()` — both sides' tallies and the split they were taken with. */
  outcomes: SeasonOutcomes;
}) {
  return (
    <PointEndingsBody
      headingId="season-point-endings-heading"
      youTally={outcomes.you}
      oppTally={outcomes.opp}
      youName={surname(playerName)}
      oppName={SEASON_OPPONENTS_LABEL}
      errorSplitJudged={outcomes.errorSplitJudged}
      emptyLegend
      emptySentence={seasonEndingsEmptySentence(playerName, analyzed)}
    />
  );
}
