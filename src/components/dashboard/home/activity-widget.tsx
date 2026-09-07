import Link from "next/link";
import type { PersonalActivity } from "@/lib/data/personal-activity-server";
import { ActivityHeatmap } from "@/components/dashboard/home/activity-heatmap";

/**
 * The personal-Home "Activity" widget — a 52-week × 7-day contribution heatmap
 * of the player's match days, artboard 1b (`activityUnderMatches`) of the
 * Personal Home & Matches canvas.
 *
 * Cells paint with the DS calendar ramp `--viz-heatmap-0..3` (SKILL.md "Heatmap
 * Gradient"), the sanctioned density ramp — not the KPI you/opp blues. The grid
 * fills column-major (`grid-auto-flow: column` over 7 rows), so `days` arrives
 * already in that order from `getPersonalActivity`.
 *
 * This shell stays a server component; the grid and its dark hover tooltip live
 * in the client `ActivityHeatmap` so only that leaf carries interactivity.
 */

export function ActivityWidget({ activity }: { activity: PersonalActivity }) {
  const { days, sessionCount, monthLabels } = activity;

  return (
    <div
      // `@container/activity` so the grid's gap below can scale with this
      // card's width (`cqi`) rather than the viewport's.
      className="surface-card @container/activity"
      style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: "6px" }}
    >
      {/* Pa2's header grammar: eyebrow left, the card's one link right. The
          session count moved out of the header and into the footer under the
          grid, where the frame states it as the grid's own reading. */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="eyebrow">Activity</span>
        <div style={{ flex: 1 }} />
        {/* The matches list IS the session log — every cell here is a day
            on that list, so the link opens the list rather than a page of
            its own. */}
        <Link
          href="/dashboard/matches"
          className="whitespace-nowrap text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Session log
        </Link>
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: 0, paddingLeft: "2px", marginTop: "6px" }}
        aria-hidden
      >
        {monthLabels.map((m, i) => (
          <span key={i} className="text-micro" style={{ flex: 1 }}>
            {m}
          </span>
        ))}
      </div>

      <ActivityHeatmap days={days} sessionCount={sessionCount} />

      <span className="text-[11px] text-[var(--ink-600)]" style={{ marginTop: "6px" }}>
        <span className="tabular">{sessionCount}</span>{" "}
        {sessionCount === 1 ? "session" : "sessions"} · <span className="tabular">12</span> months
      </span>
    </div>
  );
}
