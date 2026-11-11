"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import type { FilmCut } from "@/components/dashboard/matches/match-detail/film-cut-context";
import type { RallyLengthBand } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { rallyBandTally } from "@/components/dashboard/matches/match-detail/rally-length-bands";
import {
  RallyLengthBody,
  type RallyBandWatch,
} from "@/components/dashboard/matches/match-detail/rally-length-body";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's rally-length marimekko (artboard 47f): the match's
 * bands, from the viewer's seat, handed to `RallyLengthBody`
 * (`rally-length-body.tsx`), which draws the card and is shared with the
 * team player profile's season card.
 *
 * The tally is `rallyBandTally` (`rally-length-bands.ts`), pure so the
 * season fold runs the same loop on the server. Every "won" test is
 * `wonByPlayer1 === sides.you.isPlayer1` (guardrails §4). `rallyLength` is 0
 * when the source recorded no shot count — not a one-shot rally — so those
 * points fall outside all three bands, exactly as `head-to-head-card.tsx`
 * treats them.
 *
 * Whole match, always: the bands are counted over every point in
 * `useMatchData().points`, the same read every other point-derived card on
 * this tab makes (performance-tracker-chart.tsx makes the identical read).
 * The match filters live on the Video tab only.
 *
 * With a playable video each band opens its points in the Video tab
 * (`RALLY_BAND_CUTS`, through the body's `watch`) on click or Enter —
 * hovering only reads. Without one the body draws exactly the read-only card.
 */

/**
 * The film cut that shows each band's points in the Video tab — Result ›
 * Rally length, whose bands (`rallyLengthBandOf`) are this card's by the same
 * keys. A pure cut: it lands entirely as a pill. Shot-count-less points
 * (`rallyLength` 0) are in no band there, exactly as the bucketing below
 * leaves them out.
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

  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  const tally = useMemo(
    () => rallyBandTally(points, youIsPlayer1),
    [points, youIsPlayer1],
  );

  // Only with a playable video does a band take a click; without one the
  // body gets no `watch` and draws the read-only card.
  const watch: RallyBandWatch | undefined = meta.hasPlayableVideo
    ? (key, title) =>
        actions.watchCut(RALLY_BAND_CUTS[key], title, "rally_length")
    : undefined;

  return (
    <RallyLengthBody
      bands={tally.bands}
      avgShots={tally.avgShots}
      youName={youName}
      oppName={oppName}
      watch={watch}
    />
  );
}
