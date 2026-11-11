import { HeadToHeadTable } from "@/components/dashboard/matches/match-detail/head-to-head-table";
import { surname } from "@/lib/data/match-utils";
import type { SeasonGroup } from "@/lib/data/player-season";

/**
 * The team player profile's season Head to head (design Q, the `CohesiveQ`
 * board): the match report's table, drawn over a season. The player's
 * surname heads the first column under the blue legend mark, "Opponents" the
 * second under the slate one, and the right micro says what every figure
 * covers — "Per match · 6 analyzed": a count row is the per-match average, a
 * rate row the season's pooled percentage (`lib/data/player-season.ts`).
 *
 * Static on purpose. The report's card offers a readout and a click into
 * Video on every figure; a season figure is many matches, and there is no
 * one film to open, so no `interaction` is passed and the table draws plain
 * rows — the same padding, row height, leader emphasis and `--h2h-col` width
 * rule, with nothing to hover but the em dash's "No data".
 *
 * Nothing here decides a side (guardrails §4): the fold tallied every match
 * with that match's own seat, and this card only names the two columns. With
 * no analyzed match every row still renders, a dash in both columns, and the
 * micro reads "Per match · 0 analyzed".
 */

/** The second column's head: everyone the player faced, as one side. */
export const SEASON_OPPONENTS_LABEL = "Opponents";

/** The right micro: how many analyzed matches the figures are folded from. */
export function seasonCaption(analyzed: number): string {
  return `Per match · ${analyzed} analyzed`;
}

export function SeasonHeadToHeadCard({
  playerName,
  analyzed,
  groups,
}: {
  /** The player's full name; the column shows their surname. */
  playerName: string;
  /** Matches with points — what `groups` was folded from. */
  analyzed: number;
  /** `foldSeasonRows()` — every row of the report's table, both sides. */
  groups: SeasonGroup[];
}) {
  return (
    <HeadToHeadTable
      headingId="season-head-to-head-heading"
      groups={groups}
      youName={surname(playerName)}
      oppName={SEASON_OPPONENTS_LABEL}
      caption={seasonCaption(analyzed)}
    />
  );
}
