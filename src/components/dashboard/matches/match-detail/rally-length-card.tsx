"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import type { FilmCut } from "@/components/dashboard/matches/match-detail/film-cut-context";
import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import {
  RALLY_BAND_META,
  rallyBands,
  type RallyLengthBand,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { RallyLengthMosaic } from "@/components/dashboard/shared/rally-length-mosaic";
import { EmptyMark } from "@/components/ui/empty-mark";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's rally-length marimekko (artboard 47f).
 *
 * The tally is `rallyBands` and the mosaic `RallyLengthMosaic` — both shared
 * with the personal Statistics page, which draws the same card over a
 * season. This file is the match's wrapper: it reads the match context
 * (`useMatchData` / `useMatchSides` / `useMatchReport`), hands the tally
 * the viewer's seat, and owns the card's frame, its empty and its legend.
 *
 * Every "won" test is `wonByPlayer1 === sides.you.isPlayer1` (guardrails §4).
 *
 * `rallyLength` is 0 when the source recorded no shot count — not a one-shot
 * rally — so those points fall outside all three bands, exactly as
 * `head-to-head-card.tsx` treats them.
 *
 * Whole match, always: the bands are counted over every point in
 * `useMatchData().points`, the same read every other point-derived card on
 * this tab makes (performance-tracker-chart.tsx makes the identical read).
 * The match filters live on the Video tab only.
 *
 * With a playable video each band opens its points in the Video tab
 * (`RALLY_BAND_CUTS`) on click or Enter — hovering only reads. Without one
 * the markup is exactly the read-only card.
 *
 * The card is the right column's `flex:1` absorber — its own height comes
 * from the grid row, and the mosaic in turn claims whatever that leaves
 * after the header, labels and legend take their natural height.
 */

/**
 * The film cut that shows each band's points in the Video tab — Result ›
 * Rally length, whose bands (`rallyLengthBandOf`) are this card's by the same
 * keys. A pure cut: it lands entirely as a pill. Shot-count-less points
 * (`rallyLength` 0) are in no band there, exactly as the bucketing leaves
 * them out.
 */
export const RALLY_BAND_CUTS: Record<RallyLengthBand, FilmCut> = {
  short: { resultRallyLength: ["short"] },
  medium: { resultRallyLength: ["medium"] },
  long: { resultRallyLength: ["long"] },
};

export function RallyLengthCard() {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();
  const watchable = meta.hasPlayableVideo;

  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  const { bands, total, avgShots } = useMemo(
    () => rallyBands(points, youIsPlayer1),
    [points, youIsPlayer1],
  );

  // Nothing in this match carries a shot count — a bar of three empty bands
  // would claim every rally was unrecorded length rather than saying so. The
  // card's own anatomy stays (eyebrow, one empty band, the three labels with
  // a dash where a count goes), with a sentence in the legend's place.
  if (total === 0) {
    return (
      <section
        aria-labelledby="rally-length-heading"
        className="surface-card flex min-h-0 flex-1 flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="rally-length-empty"
      >
        <div className="flex items-baseline gap-2">
          <span id="rally-length-heading" className="eyebrow">
            Rally length
          </span>
          <div className="flex-1" />
          <span className="text-micro tabular whitespace-nowrap">
            <EmptyMark label="No average" className="text-[10px]" /> shots
            average
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div
            aria-hidden="true"
            className="min-h-24 flex-1 rounded-[var(--radius-cell)]"
            style={{ background: "var(--surface-subtle)" }}
          />
          <div className="flex">
            {RALLY_BAND_META.map((band) => (
              <div key={band.key} className="box-border flex-1 pr-3">
                <div className="flex items-baseline gap-1 overflow-hidden whitespace-nowrap">
                  <span className="text-[11px] text-[var(--ink-700)]">
                    {band.label}
                  </span>
                  <span className="mono tabular text-[10px]">
                    <EmptyMark
                      label={`No ${band.label.toLowerCase()} rallies recorded`}
                      className="text-[10px]"
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          No rally lengths were recorded on this match&apos;s points.
        </p>
      </section>
    );
  }

  // Only with a playable video does a band take a click; without one the
  // mosaic draws its read-only markup.
  const onWatch = watchable
    ? (key: RallyLengthBand, title: string) =>
        actions.watchCut(RALLY_BAND_CUTS[key], title)
    : undefined;

  return (
    <section
      aria-labelledby="rally-length-heading"
      className="surface-card flex min-h-0 flex-1 flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id="rally-length-heading" className="eyebrow">
          Rally length
        </span>
        <div className="flex-1" />
        <span className="text-micro tabular whitespace-nowrap">
          {avgShots.toFixed(1)} shots average
        </span>
      </div>

      <RallyLengthMosaic
        bands={bands}
        total={total}
        youName={youName}
        oppName={oppName}
        onWatch={onWatch}
      />

      <div className="flex items-center gap-3.5">
        <LegendSwatch color="var(--viz-you-mid)" label={`${youName} won`} />
        <LegendSwatch color="var(--viz-opp-light)" label={`${oppName} won`} />
        <div className="flex-1" />
        <span className="text-micro" style={{ color: "var(--ink-400)" }}>
          Width is how often
        </span>
      </div>
    </section>
  );
}
