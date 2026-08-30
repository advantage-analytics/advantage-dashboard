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
      className="surface-card"
      style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span className="eyebrow">Activity</span>
        <div style={{ flex: 1 }} />
        <span className="text-micro">
          <span className="tabular">{sessionCount}</span> sessions · last 12 months
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 0, paddingLeft: "2px" }} aria-hidden>
        {monthLabels.map((m, i) => (
          <span key={i} className="text-micro" style={{ flex: 1 }}>
            {m}
          </span>
        ))}
      </div>

      <ActivityHeatmap days={days} sessionCount={sessionCount} />
    </div>
  );
}
