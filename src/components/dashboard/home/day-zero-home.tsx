"use client";

import type { ReactNode } from "react";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";

/**
 * Home on the day the account holds no match: the offer, centred, over the
 * page it is offering.
 *
 * The tail below the offer is the real page in its real order, carrying the
 * empty states each region already ships — a rule where every number goes,
 * ghost match rows with their live stat labels, the Focus card's quoted
 * example, the hairline court, and a heatmap whose cells are genuinely all
 * empty because no session has happened. Nothing in it is invented.
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

      <p className="sr-only">
        Once your first match is analysed this page fills with your serve
        numbers, your recent matches, one thing to work on, and a map of where
        your serves land. Nothing below is real data yet.
      </p>

      {/*
       * One continuous grade, not two flat steps.
       *
       * The strip and the cards each carried a fixed opacity, which is a
       * banding, not a fade: the page went 0.55, then a hard edge, then 0.32
       * for everything below regardless of how far down it sat. Matches has
       * always graded properly — its five ghost rows step 1 → 0.3 — and this
       * is the same idea applied to a page whose regions are cards rather
       * than rows.
       *
       * **It fades to 0.32, not to nothing.** That is the value the whole
       * tail already sat at, so nothing at the foot of the page is fainter
       * than it was. It matters most for the activity heatmap, which lives
       * down there and whose empty cells are `#F2F2F2` — five per cent off
       * white before any fade at all. A gradient running to transparent
       * erased it once already.
       */}
      <div
        inert
        className="flex flex-1 flex-col gap-4"
        style={{
          WebkitMaskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 40%, rgba(0,0,0,0.32) 100%)",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 40%, rgba(0,0,0,0.32) 100%)",
        }}
      >
        {kpiStrip}
        {children}
      </div>
    </div>
  );
}
