import type { ZoneKey, ZoneStats } from "@/lib/data/serve-zones";

/**
 * The focused-view's 292px zone card (Task 5): six rows of the serve's
 * service-box zones, in the court's own left-to-right order, each with a
 * win-rate figure, a raw count and a share-of-serves bar. Mounted only for
 * the serve cut — `viz-focused.tsx` gates that, this component trusts its
 * `zoneStats` prop is present and meaningful.
 *
 * Attribution: `zoneStats` and `count` arrive already computed for the
 * subject in play (`computeViz`'s `zoneStats`/`count`) — this file reads no
 * player id and makes no won/lost judgement of its own.
 */

const ZONE_ROWS: { key: ZoneKey; label: string }[] = [
  { key: "deuce-wide", label: "Deuce wide" },
  { key: "deuce-body", label: "Deuce body" },
  { key: "deuce-t", label: "Deuce T" },
  { key: "ad-t", label: "Ad T" },
  { key: "ad-body", label: "Ad body" },
  { key: "ad-wide", label: "Ad wide" },
];

export function ZoneCard({
  zoneStats,
  count,
  noun,
}: {
  zoneStats: Record<ZoneKey, ZoneStats>;
  count: number;
  noun: string;
}) {
  // The zone with the most serves — the claim→evidence sentence's subject.
  // `ZONES` order gives ties a stable winner (the earliest deuce-side zone).
  const topKey = ZONE_ROWS.reduce<ZoneKey | null>((best, row) => {
    if (best === null) return row.key;
    return zoneStats[row.key].count > zoneStats[best].count ? row.key : best;
  }, null);
  const top = topKey ? zoneStats[topKey] : null;
  const topLabel = ZONE_ROWS.find((r) => r.key === topKey)?.label ?? "";

  return (
    <div
      className="flex shrink-0 flex-col rounded-[var(--radius-card)] border p-4"
      style={{
        width: 292,
        borderColor: "var(--border-hairline)",
        backgroundColor: "var(--surface-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--ink-900)" }}
        >
          Where the serve went
        </p>
        <span
          className="tabular shrink-0 text-[11px]"
          style={{ color: "var(--ink-500)" }}
        >
          {count} {noun}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {ZONE_ROWS.map(({ key, label }) => {
          const zs = zoneStats[key];
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-[12px]"
                  style={{ color: "var(--ink-700)" }}
                >
                  {label}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span
                    className="tabular text-[16px] font-light"
                    style={{ color: "var(--ink-900)" }}
                  >
                    {zs.count === 0 ? "—" : `${zs.winPct}%`}
                  </span>
                  <span
                    className="tabular font-mono text-[10px]"
                    style={{ color: "var(--ink-500)" }}
                  >
                    {zs.count}
                  </span>
                </span>
              </div>
              <span
                className="flex h-1 overflow-hidden rounded-[2px]"
                style={{ backgroundColor: "var(--surface-subtle)" }}
                role="img"
                aria-label={`${zs.pct}% of serves went ${label.toLowerCase()}`}
              >
                <span
                  className="h-1"
                  style={{
                    width: `${zs.pct}%`,
                    backgroundColor: "var(--viz-you)",
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>

      {top && top.count > 0 && (
        <p
          className="mt-3 border-t pt-3 text-[11px] leading-[1.5]"
          style={{
            borderColor: "var(--border-hairline)",
            color: "var(--ink-500)",
          }}
        >
          Most serves went {topLabel} — {top.count} of {count}, {top.winPct}%
          won.
        </p>
      )}
    </div>
  );
}
