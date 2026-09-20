import type { VizStats, StatRow } from "./viz-model";

/**
 * The focused-view's 292px stats card (Task F3): generalises the old
 * serve-only `ZoneCard` to every cut. Driven entirely by a `VizStats` —
 * this file makes no attribution decision and reads no player id; it only
 * renders whatever rows `computeVizStats` handed it.
 *
 * Groups render in order, each with an optional micro label; rows are a
 * `<ul>`/`<li>` list so the win rate and count are one accessible name per
 * row, not a scatter of unlabeled spans. `total === 0` swaps the rows for
 * the design system's honest-empty copy rather than six dashes (task spec).
 */

function rowAccessibleName(label: string, row: StatRow): string {
  if (row.winPct === null) return `${label}: no points recorded`;
  return `${label}: ${row.winPct}% of ${row.count} points won`;
}

export function StatsCard({ stats }: { stats: VizStats }) {
  return (
    <div
      className="flex w-[292px] shrink-0 flex-col rounded-[var(--radius-card)] border p-4"
      style={{
        borderColor: "var(--border-hairline)",
        backgroundColor: "var(--surface-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--ink-900)" }}
        >
          {stats.title}
        </p>
        <p className="text-micro" style={{ color: "var(--ink-400)" }}>
          {stats.subtitle}
        </p>
      </div>

      {stats.total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-[12px]" style={{ color: "var(--ink-500)" }}>
            No points match these filters
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2.5">
            {stats.groups.map((group, i) => (
              <div key={group.key} className="flex flex-col gap-2.5">
                {i > 0 && (
                  <div
                    className="border-t"
                    style={{ borderColor: "var(--border-hairline)" }}
                  />
                )}
                {group.label && (
                  <p className="text-micro" style={{ color: "var(--ink-500)" }}>
                    {group.label}
                  </p>
                )}
                <ul className="flex flex-col gap-2.5">
                  {group.rows.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-col gap-1"
                      aria-label={rowAccessibleName(row.label, row)}
                    >
                      <div
                        aria-hidden="true"
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--ink-700)" }}
                        >
                          {row.label}
                        </span>
                        <span className="flex items-baseline gap-1.5">
                          <span
                            className="tabular text-[16px] font-light"
                            style={{ color: "var(--ink-900)" }}
                          >
                            {row.winPct === null ? "—" : `${row.winPct}%`}
                          </span>
                          <span
                            className="tabular font-mono text-[10px]"
                            style={{ color: "var(--ink-400)" }}
                          >
                            {row.count}
                          </span>
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="flex h-1 w-full overflow-hidden rounded-[2px]"
                        style={{ backgroundColor: "var(--surface-subtle)" }}
                      >
                        <span
                          className="h-1"
                          style={{
                            width: row.winPct === null ? 0 : `${row.winPct}%`,
                            backgroundColor: "var(--viz-you)",
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {stats.sentence && (
            <p
              className="mt-3 border-t pt-3 text-[11px] leading-[1.5]"
              style={{
                borderColor: "var(--border-hairline)",
                color: "var(--ink-500)",
              }}
            >
              {stats.sentence}
            </p>
          )}
        </>
      )}
    </div>
  );
}
