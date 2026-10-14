import Link from "next/link";

import { MATCH_REPORT_PANE_PAD } from "@/components/dashboard/matches/match-detail/match-report-layout";
import { StatePill } from "@/components/ui/state-pill";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The bar the sample match wears so nobody mistakes it for their own data.
 *
 * Edge to edge across the report pane and pinned to its very top. The pane is
 * the scroll container and carries its own padding, and a sticky element
 * sticks inside that padding — so a bar at `top: 0` left a 20px slot above it
 * for the report to scroll through, and stopped 56px short of each side.
 * Negative margins take the bar out to the pane's edges and a negative `top`
 * pins it to the scrollport's edge; its own padding puts the content back on
 * the report's column.
 *
 * The dashboard is white, so the bar is told from the page by its hairline,
 * not a tint. The grey `StatePill` names the state (grey, because a state is
 * not an action); the one blue on the bar is the way out of the sample.
 */
export function SampleBanner() {
  const { top, x } = MATCH_REPORT_PANE_PAD;
  return (
    <div
      data-sample-banner=""
      className="sticky z-20 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--surface-card)]"
      style={{
        top: -top,
        margin: `-${top}px -${x}px 0`,
        padding: `0 ${x}px`,
      }}
    >
      <p className="flex min-w-0 items-center gap-2.5 text-[12px] text-[var(--ink-600)]">
        <StatePill className="shrink-0">Sample match</StatePill>
        <span className="truncate">Anonymised, and not your data.</span>
      </p>
      <Link
        href="/dashboard/matches/new"
        className={advButton("primary", "sm")}
      >
        Send your own match
      </Link>
    </div>
  );
}
