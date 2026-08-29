import type { ZoneKey, ZoneStats } from "@/components/dashboard/matches/serve-placement/serve-placement-widget";

/**
 * Round 3/4's "quiet strip" — T/Body/Wide distribution bars per court, in
 * place of the drawn half-court. The full court stays the match-detail and
 * statistics treatment; this is Home's own, denser presentation.
 */

const COURTS: { label: string; keys: [ZoneKey, ZoneKey, ZoneKey] }[] = [
  { label: "Deuce court", keys: ["deuce-t", "deuce-body", "deuce-wide"] },
  { label: "Ad court", keys: ["ad-t", "ad-body", "ad-wide"] },
];

const SEGMENT_COLOR = [
  "var(--viz-you)",
  "var(--viz-you-mid)",
  "var(--viz-you-light)",
] as const;
const SEGMENT_LABEL = ["T", "Body", "Wide"] as const;

function CourtBar({
  label,
  counts,
}: {
  label: string;
  counts: [number, number, number];
}) {
  const total = counts[0] + counts[1] + counts[2];
  const pcts = counts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0));

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-baseline gap-2">
        <span className="text-micro" style={{ color: "var(--ink-700)" }}>
          {label}
        </span>
        <div className="flex-1" />
        <span className="text-micro tabular">{total} serves</span>
      </div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-[var(--radius-cell)]">
        {pcts.map((pct, i) => (
          <div
            key={SEGMENT_LABEL[i]}
            style={{ width: `${pct}%`, background: SEGMENT_COLOR[i] }}
          />
        ))}
      </div>
      <div className="flex items-baseline gap-3">
        {SEGMENT_LABEL.map((seg, i) => (
          <span key={seg} className="text-micro tabular">
            {seg} {pcts[i]}%
          </span>
        ))}
      </div>
    </div>
  );
}

/** Which zone dominates, so the claim above the bars is a real reading of the data. */
function dominantZoneClaim(zoneStats: Record<ZoneKey, ZoneStats>): string {
  const totals = { T: 0, Body: 0, Wide: 0 };
  for (const key of Object.keys(zoneStats) as ZoneKey[]) {
    const count = zoneStats[key].count;
    if (key.endsWith("-t")) totals.T += count;
    else if (key.endsWith("-body")) totals.Body += count;
    else totals.Wide += count;
  }
  const max = Math.max(totals.T, totals.Body, totals.Wide);
  if (max === 0) return "First serves, by placement.";
  if (totals.T === max) return "First serves go to the T.";
  if (totals.Wide === max) return "First serves go wide.";
  return "First serves stay to the body.";
}

export function ServePlacementQuietStrip({
  zoneStats,
  contextLabel,
  statisticsHref = "/dashboard/statistics",
}: {
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  contextLabel: string;
  statisticsHref?: string;
}) {
  return (
    <div className="surface-card flex flex-col gap-3" style={{ padding: "18px 20px" }}>
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Serve placement</span>
        <div className="flex-1" />
        <span className="text-micro">{contextLabel}</span>
      </div>

      {zoneStats ? (
        <>
          <span className="text-title" style={{ maxWidth: "30ch" }}>
            {dominantZoneClaim(zoneStats)}
          </span>
          <div className="flex flex-col gap-2.5">
            {COURTS.map((court) => (
              <CourtBar
                key={court.label}
                label={court.label}
                counts={[
                  zoneStats[court.keys[0]].count,
                  zoneStats[court.keys[1]].count,
                  zoneStats[court.keys[2]].count,
                ]}
              />
            ))}
          </div>
          <a
            href={statisticsHref}
            className="text-[11px] font-medium"
            style={{ color: "var(--blue)" }}
          >
            Open placement view
          </a>
        </>
      ) : (
        <p className="text-body-sm">Upload a match to see where your serves land.</p>
      )}
    </div>
  );
}
