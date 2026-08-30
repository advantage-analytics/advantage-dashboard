import type { PersonalActivity } from "@/lib/data/personal-activity-server";

/**
 * The personal-Home "Activity" widget — a 52-week × 7-day contribution heatmap
 * of the player's match days, artboard 1b (`activityUnderMatches`) of the
 * Personal Home & Matches canvas.
 *
 * Cells paint with the DS calendar ramp `--viz-heatmap-0..3` (SKILL.md "Heatmap
 * Gradient"), the sanctioned density ramp — not the KPI you/opp blues. The grid
 * fills column-major (`grid-auto-flow: column` over 7 rows), so `days` arrives
 * already in that order from `getPersonalActivity`.
 */

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Aug 12, 2025" from a `YYYY-MM-DD` key, without re-parsing through a tz. */
function cellTitle(date: string, count: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const label = `${MONTHS_LONG[(m ?? 1) - 1]?.slice(0, 3)} ${d}, ${y}`;
  if (count <= 0) return `No matches on ${label}`;
  return `${count} ${count === 1 ? "match" : "matches"} on ${label}`;
}

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

      <div
        role="img"
        aria-label={`Match activity over the last 12 months: ${sessionCount} active ${sessionCount === 1 ? "day" : "days"}`}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(52, 1fr)",
          gridTemplateRows: "repeat(7, 1fr)",
          gridAutoFlow: "column",
          gap: "2px",
        }}
      >
        {days.map((day, i) => (
          <div
            key={i}
            title={cellTitle(day.date, day.count)}
            style={{
              aspectRatio: "1",
              borderRadius: "1px",
              background: `var(--viz-heatmap-${day.level})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
