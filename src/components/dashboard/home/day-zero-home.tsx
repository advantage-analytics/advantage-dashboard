"use client";

import type { ReactNode } from "react";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import { DayZeroGrade } from "@/components/dashboard/home/day-zero-shape";

/**
 * Home on the day the account holds no match: the offer, centred, over the
 * page it is offering.
 *
 * The tail below the offer is the real page in its real order, carrying the
 * empty states each region already ships — a rule where every number goes,
 * ghost match rows with their live stat labels, the Focus card's own
 * anatomy, the serve strip's empty bar tracks, and a heatmap whose cells are
 * genuinely all empty because no session has happened. Nothing in it is invented.
 *
 * It is graded rather than drawn flat, and the grade is continuous: brightest
 * under the offer and fading with distance, so the tail reads as the page
 * waiting rather than as a second thing competing with it.
 *
 * **The tail is decoration, and is marked as such.** At a third opacity its
 * text sits far below any usable contrast and its links would be invisible
 * tab stops, so the whole run is `inert` — which takes it out of the tab
 * order and the accessibility tree together, unlike `aria-hidden` and
 * `pointer-events-none`, which leave a link hidden from a screen reader and
 * still reachable by keyboard. The sentence above carries the same
 * information for anyone not reading the page with their eyes.
 *
 * Day zero carries no title row, no getting-set-up line and no usage footer:
 * the page is the offer and the page it is offering, and every other piece of
 * furniture returns with the first match.
 */
export function DayZeroHome({
  kpiStrip,
  children,
}: {
  /** `KpiStripEmpty` — kept at full strength above the graded regions. */
  kpiStrip: ReactNode;
  /** The card grid, exactly as the populated page composes it. */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer />

      {/*
       * One continuous grade, not two flat steps — `DayZeroGrade` owns the
       * mask, the `inert` and the sentence that pairs with it. The strip and
       * the cards each used to carry a fixed opacity, which is a banding
       * rather than a fade.
       */}
      <DayZeroGrade
        description="Once your first match is analysed this page fills with your serve numbers, your recent matches, one thing to work on, and a map of where your serves land. Nothing below is real data yet."
        className="flex flex-1 flex-col gap-4"
      >
        {kpiStrip}
        {children}
      </DayZeroGrade>
    </div>
  );
}
