import { RallyLengthBody } from "@/components/dashboard/matches/match-detail/rally-length-body";
import { SEASON_OPPONENTS_LABEL } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { surname } from "@/lib/data/match-utils";
import type { SeasonRallyBands } from "@/lib/data/player-season";

/**
 * The team player profile's season Rally length (design Q, the `CohesiveQ`
 * board): the match report's marimekko, drawn over a season. Each band's
 * width is its share of the season's banded points, its split who won them —
 * the player on top, "Opponents" beneath — and the header micro is the
 * season's shots average. The bands are the report's own tally run per match
 * and summed (`seasonRallyBands`, `lib/data/player-season.ts`), so a band
 * here holds exactly the points the per-match cards put in it.
 *
 * Static on purpose. The report's bands open their points in Video; a season
 * band is many matches, with no one film to open, so no `watch` is passed and
 * the body draws the read-only card — the same mosaic and readout on hover,
 * with nothing to click. The readout's share reads "of the season".
 *
 * Nothing here decides a side (guardrails §4): the fold counted every match
 * with that match's own seat. With no banded point — no analyzed match, or
 * none with a shot count — the anatomy still draws: the eyebrow, a dash for
 * the average, one empty band, the three labels each with a dash, and one
 * sentence saying what fills it.
 */

/**
 * The one sentence under the empty band: with nothing analyzed, what the
 * card will hold and when; with matches analyzed but no shot count recorded,
 * why the band is empty.
 */
export function seasonRallyEmptySentence(
  playerName: string,
  analyzed: number,
): string {
  return analyzed === 0
    ? `Rally lengths add up here once one of ${surname(playerName)}'s matches is analyzed.`
    : "No point in these matches records its rally length.";
}

export function SeasonRallyLengthCard({
  playerName,
  analyzed,
  rallyBands,
}: {
  /** The player's full name; the legend shows their surname. */
  playerName: string;
  /** Matches with points — what `rallyBands` was summed from. */
  analyzed: number;
  /** `seasonRallyBands()` — the three bands and the average behind them. */
  rallyBands: SeasonRallyBands;
}) {
  return (
    <RallyLengthBody
      headingId="season-rally-length-heading"
      bands={rallyBands.bands}
      avgShots={rallyBands.avgShots}
      youName={surname(playerName)}
      oppName={SEASON_OPPONENTS_LABEL}
      shareOf="the season"
      emptySentence={seasonRallyEmptySentence(playerName, analyzed)}
    />
  );
}
