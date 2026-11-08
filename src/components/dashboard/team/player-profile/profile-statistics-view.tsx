import type { SeasonGroup, SeasonTallies } from "@/lib/data/player-season";
import { ProfileInsightEmpty } from "@/components/dashboard/team/player-profile/profile-insight-empty";
import { SeasonHeadToHeadCard } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { SeasonNetGameCard } from "@/components/dashboard/team/player-profile/season-net-game-card";
import { SeasonPerformanceTracker } from "@/components/dashboard/team/player-profile/season-performance-tracker";
import { SeasonPointEndingsCard } from "@/components/dashboard/team/player-profile/season-point-endings-card";
import { SeasonRallyLengthCard } from "@/components/dashboard/team/player-profile/season-rally-length-card";

/**
 * The player profile's Statistics tab (design Q): the match report's
 * Statistics view (`statistics-view.tsx`) over a season — the insight card
 * slot, then the widgets row, the season Head to head beside a column of the
 * four charts in the report's reading order (Performance tracker → How points
 * ended → Rally length → Net game). The row's classes are the report's: from
 * 720px of pane (the `@container` on `MatchReportPane`) the two columns split
 * 1:1, `flex-1 min-w-0` each; under it they stack, head to head first.
 *
 * ── No analyzed matches ─────────────────────────────────────────────────────
 * Unlike the report, which withholds its row for a match with no points, this
 * view always draws every card. A season is the player's whole record, and
 * each season card already draws its own honest zero — the anatomy, dashes,
 * one sentence of what arrives — so the tab reads the same for a player with
 * nothing analysed yet as for one with a season, and no card pops in when
 * their first match is.
 *
 * The insight slot is `ProfileInsightEmpty` for now: there is no season
 * summary to show yet, and the slot says so rather than collapsing.
 *
 * No hooks and no directive, so the page's Server Component renders it
 * directly; the cards it composes are the client modules. Takes the season's
 * folded figures, never `PlayerSeason.perMatch` — a season's points are
 * megabytes and must not reach the client payload.
 */
export function ProfileStatisticsView({
  playerName,
  firstName,
  analyzed,
  groups,
  tallies,
}: {
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
}) {
  return (
    <>
      <ProfileInsightEmpty firstName={firstName} />

      {/* `statistics-view.tsx`'s row, class for class. The row stretches and
          the chart column hands its slack to Rally length; `*:shrink-0` so
          the column only ever gains height from the row, never gives it up. */}
      <div className="flex shrink-0 flex-col gap-4 @min-[720px]:flex-row">
        <div className="min-w-0 flex-1">
          <SeasonHeadToHeadCard
            playerName={playerName}
            analyzed={analyzed}
            groups={groups}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 *:shrink-0">
          <SeasonPerformanceTracker
            playerName={playerName}
            perMatch={tallies.perMatch}
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
