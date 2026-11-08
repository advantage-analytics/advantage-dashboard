"use client";

import { InsightMark } from "@/components/dashboard/matches/match-detail/insight-mark";
import { INSIGHT_SURFACE } from "@/components/dashboard/matches/match-detail/report-insight-card";

/**
 * The insight card slot at the top of the profile's Statistics tab, with no
 * season summary to show — the match report's `InsightEmpty`
 * (`report-insight-card.tsx`) in season words: the same surface
 * (`INSIGHT_SURFACE`), the claim and evidence slots in the quiet inks, the
 * engine credit foot with `InsightMark`. No toggle, no link, no figure and no
 * invented sentence a screen reader could read out as a finding: it is a
 * status, and says so.
 *
 * A `"use client"` module because `INSIGHT_SURFACE` lives in one: a Server
 * Component that imported the constant would get a client reference, not
 * the class string.
 */
export function ProfileInsightEmpty({ firstName }: { firstName: string }) {
  return (
    <section
      aria-label="Advantage Intelligence summary"
      role="status"
      data-testid="insight-empty"
      className={INSIGHT_SURFACE}
    >
      <div className="flex flex-col gap-2 p-[16px_20px_12px]">
        <p
          className="text-body [text-wrap:pretty]"
          style={{ color: "var(--ink-700)", fontWeight: 500 }}
        >
          No Advantage Intelligence summary for {firstName}&apos;s season yet.
        </p>
        <p className="text-[11px] leading-[1.6] [text-wrap:pretty] text-[var(--ink-500)]">
          One is written once a match of theirs is analysed.
        </p>
        <div className="mt-1 flex h-6 items-center gap-[7px] border-t border-[var(--border-hairline)] pt-2.5">
          <InsightMark />
          <span className="text-micro">Advantage Intelligence</span>
        </div>
      </div>
    </section>
  );
}
