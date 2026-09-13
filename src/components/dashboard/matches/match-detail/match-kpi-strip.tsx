"use client";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { KpiTile, KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import type { MatchKpiKey } from "@/lib/data/match-stats-server";
import type { PlayerStatistics } from "@/lib/data/types";

/**
 * The Statistics tab's four-tile KPI strip (47f).
 *
 * Its whole job is saying what this match measured WITHOUT inventing the parts
 * it didn't. Three things are therefore never rounded off:
 *
 * 1. A withheld statistic is not zero. `secondServeWinPct` is null on
 *    video-derived matches, and break points saved has no value at all when the
 *    player never faced one — both print an em dash, not `0%`.
 * 2. No baseline means no trend and no sparkline — not a zero delta and not a
 *    flat line. A first match has nothing to compare against and says so.
 * 3. "vs your avg" is only true when the viewer IS the player these figures
 *    describe; a coach reading an athlete's match gets the neutral wording.
 *
 * The side is `useMatchSides().you` and nothing else — never player1/player2
 * (guardrails §4: a silent flip attributes every number to the wrong player
 * with nothing looking broken on screen).
 *
 * Known limitation: a viewer who is NEITHER player — a coach reading an
 * athlete's match — is seated at player 2 by the page's two-state rule
 * (`resolveYouSide`), so the history shown is that seat's, and the delta reads
 * the neutral "vs avg" rather than "vs your avg" (point 3). `kpiHistory` itself
 * now covers both seats — the seat-one-only fetch that once truncated a
 * player-2 appearance's series was fixed in the loader — so a real participant
 * always sees their own history; the residual gap is only that a coach's
 * history is keyed to the single id on the row, not the athlete's full claimed
 * id set. The absent path above is what the thin cases degrade to.
 */

interface KpiSpec {
  key: MatchKpiKey;
  label: string;
  /** This match's value in whole-ish percent, or null when not measured. */
  value: (stats: PlayerStatistics) => number | null;
}

const KPI_SPECS: KpiSpec[] = [
  {
    key: "firstServeIn",
    label: "First serve in",
    value: (stats) => stats.firstServeInPct,
  },
  {
    key: "firstServeWon",
    label: "First serve points won",
    value: (stats) => stats.firstServeWinPct,
  },
  {
    key: "secondServeWon",
    label: "Second serve points won",
    value: (stats) => stats.secondServeWinPct,
  },
  {
    key: "breakPointsSaved",
    label: "Break points saved",
    // A percentage of nothing is not zero: a server who never faced a break
    // point has no save rate, and `0%` would read as "saved none of them".
    value: (stats) => {
      const fraction = stats.fractions.breakpointsSaved;
      if (!fraction || fraction.attempts <= 0) return null;
      return (fraction.made / fraction.attempts) * 100;
    },
  },
];

export function MatchKpiStrip() {
  const { kpiHistory } = useMatchData();
  const { you } = useMatchSides();
  const stats = you.stats;

  if (!stats) return null;

  return (
    <KpiTileStrip>
      {KPI_SPECS.map((spec, index) => {
        const value = spec.value(stats);
        const baseline = kpiHistory?.baseline[spec.key];
        const series = kpiHistory?.series[spec.key];

        // Both comparisons need a number on this match to compare: with the
        // headline at "—" a trend would have no left-hand side, and a
        // sparkline would end at a point this match never produced.
        const comparable = value !== null && baseline !== undefined;

        const trend = comparable
          ? {
              change: Math.round(value - baseline),
              changeLabel: `${kpiHistory?.viewerIsPlayer ? "vs your avg" : "vs avg"} ${Math.round(baseline)}%`,
            }
          : undefined;

        return (
          <KpiTile
            key={spec.key}
            index={index}
            label={spec.label}
            value={value === null ? "—" : `${Math.round(value)}%`}
            trend={trend}
            // `KpiTile` drops a series below two points on its own — one dot is
            // not a trend line.
            sparkline={value === null ? undefined : series}
            hintText={
              value === null
                ? "Not measured"
                : trend
                  ? undefined
                  : "No earlier matches to compare"
            }
          />
        );
      })}
    </KpiTileStrip>
  );
}
