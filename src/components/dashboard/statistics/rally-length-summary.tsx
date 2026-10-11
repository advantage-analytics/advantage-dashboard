"use client";

import {
  RALLY_BAND_META,
  type RallyBand,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { RallyLengthMosaic } from "@/components/dashboard/shared/rally-length-mosaic";
import { EmptyMark } from "@/components/ui/empty-mark";
import { rallyBandsAcross } from "@/lib/data/point-tallies";
import { RegionCard } from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's Rally length card: the match report's marimekko
 * (`RallyLengthMosaic`) over every point of the filtered matches.
 *
 * The tally is `rallyBandsAcross` — per match with THAT match's seat
 * (`StatisticsMatch.isPlayer1`, guardrails §4), then summed — so a season
 * in which the viewer sat on both sides still puts the viewer's wins on
 * top of every band. The points arrive for every analyzed match and are
 * narrowed to the filtered set here, by match id.
 *
 * No film cuts: a band here spans many matches and there is no Video tab to
 * open, so the mosaic draws its read-only markup.
 *
 * Its states (widget-states):
 *   - loading — the page's own skeleton (`statistics-skeleton.tsx`)
 *   - no points in a band — the card's anatomy: `—` for the average, one
 *     empty band, the three labels with a dash. Day zero and a season
 *     filtered to nothing land here and say nothing more (the offer or the
 *     controls row already has); matches that are here and recorded no
 *     rally length get one sentence
 *   - points unavailable (`null`) — thrown to the slot's `WidgetBoundary`,
 *     which shows "Couldn't load rally length" and a retry
 */

const LABEL = "text-[11px] text-[var(--ink-700)]";
const FIGURE = "mono tabular text-[10px] text-[var(--ink-400)]";

function rangeOf(band: RallyBand): string {
  return RALLY_BAND_META.find((meta) => meta.key === band.key)?.range ?? "";
}

/** The frame's legend: a 6px swatch per side, the width note at the right. */
function Legend() {
  return (
    <div className="flex items-center gap-3.5">
      {[
        { swatch: "var(--viz-you-mid)", label: "You won" },
        { swatch: "var(--viz-opp-light)", label: "Opponents won" },
      ].map((key) => (
        <span key={key.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-[2px]"
            style={{ background: key.swatch }}
          />
          <span className="text-micro whitespace-nowrap">{key.label}</span>
        </span>
      ))}
      <div className="flex-1" />
      <span className="text-micro" style={{ color: "var(--ink-400)" }}>
        Width is how often
      </span>
    </div>
  );
}

/** One empty band and the three labels with a dash where each share goes. */
function RallyLengthEmpty() {
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="h-28 rounded-[var(--radius-cell)]"
        style={{ background: "var(--surface-subtle)" }}
      />
      <div className="flex">
        {RALLY_BAND_META.map((band) => (
          <div key={band.key} className="box-border flex-1 pr-3">
            <div className="flex items-baseline gap-1 overflow-hidden whitespace-nowrap">
              <span className={LABEL}>{band.label}</span>
              <span className={FIGURE}>
                {band.range} ·{" "}
                <EmptyMark
                  label={`No share for ${band.label.toLowerCase()} rallies yet`}
                  className="text-[10px]"
                />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RallyLengthSummary() {
  const { filtered, points } = useStatistics();
  // The read failed: say so through the slot's boundary rather than draw a
  // season with no rallies in it.
  if (points === null) {
    throw new Error("Point-by-point data could not be loaded.");
  }
  // No `useMemo`: the React Compiler memoizes this, and refuses a manual one.
  const { bands, total, avgShots } = rallyBandsAcross(points, filtered);

  return (
    <RegionCard
      title="Rally length"
      aside={
        <span className="text-micro tabular whitespace-nowrap">
          {total === 0 ? (
            <EmptyMark label="No average rally length yet" className="mr-1" />
          ) : (
            avgShots.toFixed(1)
          )}{" "}
          shots<span className="sr-only"> on average</span>
        </span>
      }
    >
      {total === 0 ? (
        <RallyLengthEmpty />
      ) : (
        <RallyLengthMosaic
          bands={bands}
          total={total}
          youName="You"
          oppName="Opponents"
          scope="all points"
          heightClassName="h-28"
          caption={(band, share) => `${rangeOf(band)} · ${Math.round(share)}%`}
        />
      )}
      {total === 0 && filtered.length > 0 && (
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          No rally lengths were recorded on these matches&apos; points.
        </p>
      )}
      <Legend />
    </RegionCard>
  );
}
