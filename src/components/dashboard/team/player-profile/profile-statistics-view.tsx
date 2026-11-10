import type { SeasonEvidence } from "@/lib/data/player-insight";
import {
  withoutSeasonShotKindRows,
  type SeasonGroup,
  type SeasonTallies,
} from "@/lib/data/player-season";
import { ProfileInsightCard } from "@/components/dashboard/team/player-profile/profile-insight-card";
import { ProfileInsightEmpty } from "@/components/dashboard/team/player-profile/profile-insight-empty";
import { SeasonDifferentialCard } from "@/components/dashboard/team/player-profile/season-differential-card";
import { SeasonGameProfileCard } from "@/components/dashboard/team/player-profile/season-game-profile-card";
import { SeasonHeadToHeadCard } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { SeasonNetGameCard } from "@/components/dashboard/team/player-profile/season-net-game-card";
import { SeasonPointEndingsCard } from "@/components/dashboard/team/player-profile/season-point-endings-card";
import { SeasonRallyLengthCard } from "@/components/dashboard/team/player-profile/season-rally-length-card";

/**
 * The player profile's Statistics tab (design Q, reworked on the "Match page
 * refinements" canvas, boards 9–10): the match report's Statistics view
 * (`statistics-view.tsx`) over a season — the insight card slot, then the
 * widgets row: the season Head to head (without the report's dropped Lob and
 * Drop shot rows) and its Differential under it, beside a column of four
 * charts — Game profile (the radar that replaced the season Performance
 * tracker) → How points ended → Rally length → Net game. The row's classes
 * are the report's: from 720px of pane (the `@container` on
 * `MatchReportPane`) the two columns split 1:1, `flex-1 min-w-0` each; under
 * it they stack, head to head first. Whichever column is shorter takes the
 * row's slack — the Differential spreads it between its rows, Rally length
 * and Net game share it on the chart side — so both columns end level.
 *
 * ── The insight slot ────────────────────────────────────────────────────────
 * With analyzed matches it is `ProfileInsightCard`: the season claim streams
 * in from `/api/player-insight` over an evidence line the page composed from
 * the same fold (`buildSeasonEvidence`), so every figure on the card is the
 * server's. With none it is `ProfileInsightEmpty`, saying so — the card is
 * never asked for a player with nothing analyzed, because there is nothing
 * for a claim to be about.
 *
 * ── No analyzed matches ─────────────────────────────────────────────────────
 * Unlike the report, which withholds its row for a match with no points, this
 * view always draws every card. A season is the player's whole record, and
 * each season card already draws its own honest zero — the anatomy, dashes,
 * one sentence of what arrives — so the tab reads the same for a player with
 * nothing analysed yet as for one with a season, and no card pops in when
 * their first match is.
 *
 * No hooks and no directive, so the page's Server Component renders it
 * directly; the cards it composes are the client modules. Takes the season's
 * folded figures, never `PlayerSeason.perMatch` — a season's points are
 * megabytes and must not reach the client payload. The Game profile gets
 * its six values a shape, folded on the server (`seasonGameProfile`).
 */
export function ProfileStatisticsView({
  playerId,
  playerName,
  firstName,
  analyzed,
  groups,
  tallies,
  evidence,
  insightSignature,
}: {
  /** The roster's own id (`profile.playerId`) — what the insight route resolves. */
  playerId: string;
  /** The player's full name; the cards show their surname. */
  playerName: string;
  /** Their given name, for the insight slot's sentence. */
  firstName: string;
  /** Matches with points — what every figure below is folded from. */
  analyzed: number;
  /** `PlayerSeason.groups` — the season Head to head's rows. */
  groups: SeasonGroup[];
  /** `PlayerSeason.tallies` — the chart column's figures. */
  tallies: SeasonTallies;
  /** `buildSeasonEvidence(season)` — the card's figures; `null` with nothing analyzed. */
  evidence: SeasonEvidence | null;
  /** `seasonInsightSignature(season)` — keys the card's session cache. */
  insightSignature: string;
}) {
  return (
    <>
      {analyzed > 0 && evidence ? (
        // Keyed on the signature: a season that changes under the card
        // remounts it, so its cache lookup and stream start over cleanly.
        <ProfileInsightCard
          key={`${playerId}:${insightSignature}`}
          playerId={playerId}
          firstName={firstName}
          evidence={evidence.parts}
          signature={insightSignature}
        />
      ) : (
        <ProfileInsightEmpty firstName={firstName} />
      )}

      {/* `statistics-view.tsx`'s row, class for class. The row stretches;
          `*:shrink-0` so a column only ever gains height from the row, never
          gives it up. */}
      <div className="flex shrink-0 flex-col gap-4 @min-[720px]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4 *:shrink-0">
          <SeasonHeadToHeadCard
            playerName={playerName}
            analyzed={analyzed}
            groups={withoutSeasonShotKindRows(groups)}
          />
          <SeasonDifferentialCard
            playerName={playerName}
            analyzed={analyzed}
            outcomes={tallies.outcomes}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 *:shrink-0">
          <SeasonGameProfileCard
            playerName={playerName}
            analyzed={analyzed}
            profile={tallies.gameProfile}
          />
          <SeasonPointEndingsCard
            playerName={playerName}
            analyzed={analyzed}
            outcomes={tallies.outcomes}
          />
          <SeasonRallyLengthCard
            playerName={playerName}
            analyzed={analyzed}
            rallyBands={tallies.rallyBands}
          />
          <SeasonNetGameCard
            playerName={playerName}
            analyzed={analyzed}
            netGame={tallies.netGame}
          />
        </div>
      </div>
    </>
  );
}
