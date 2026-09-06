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
 * It is graded rather than drawn flat: the strip at 0.55, the cards below at
 * a third, so the tail reads as the page waiting rather than as a second
 * thing competing with the offer.
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

      <div inert className="flex flex-1 flex-col gap-4">
        {/* The strip joins the grade rather than standing outside it.
            It sat at full strength on the argument that its five labels are
            the page's most specific promise — but at full strength it was the
            only region in the tail that did not read as background, so the
            page had an offer, a solid band, and then a fade, which is two
            treatments where there should be one. Matches never had the
            exception, and both day-zero pages now step down together.

            0.55 over 0.32 rather than one flat value: a grade needs a step,
            and the strip is still the first thing under the offer and the
            part worth reading first. */}
        <div style={{ opacity: 0.55 }}>{kpiStrip}</div>
        {/* A third, not a fade to nothing: a mask running to transparent at
            the foot of the page clipped the activity heatmap mid-grid, and a
            calendar cut off partway through its last week reads as a
            rendering fault rather than as depth. */}
        <div style={{ opacity: 0.32 }}>{children}</div>
      </div>
    </div>
  );
}
