import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ZoneKey, ZoneStats } from "@/components/dashboard/matches/serve-placement/serve-placement-widget";
import { serveCaptionInput, servePlacementCaption } from "@/lib/ui/serve-placement-caption";

/**
 * Round 3/4's "quiet strip" — T/Body/Wide distribution bars per court, in
 * place of the drawn half-court. The full court stays the match-detail and
 * statistics treatment; this is Home's own, denser presentation.
 *
 * Platform Audit Pa2 draws it claim-led (the Focus grammar): eyebrow · claim
 * · one bar per court · a hairline legend row with the sample on the right ·
 * one sentence reading the two bars. The drawn court lives one click away,
 * behind "Placement view".
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
      {/* The radius sits on the segments, not the container: the first
          drawn segment rounds its outer left corners and the last its outer
          right, as the frame draws it. "Drawn", not "first": a zero-width
          segment has no corners to round, and a court with no T serves would
          otherwise start square. */}
      <div className="flex h-3.5 gap-0.5">
        {(() => {
          const drawn = pcts.map((pct, i) => (pct > 0 ? i : -1)).filter((i) => i >= 0);
          const first = drawn[0];
          const last = drawn[drawn.length - 1];
          return pcts.map((pct, i) => (
            <div
              key={SEGMENT_LABEL[i]}
              className={cn(
                i === first && "rounded-l-[var(--radius-cell)]",
                i === last && "rounded-r-[var(--radius-cell)]"
              )}
              style={{ width: `${pct}%`, background: SEGMENT_COLOR[i] }}
            />
          ));
        })()}
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

/** The bar's shape holding nothing: label and an empty 14px track. */
function EmptyCourtBar({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-[5px]" aria-hidden="true">
      <div className="flex items-baseline gap-2">
        <span className="text-micro" style={{ color: "var(--ink-700)" }}>
          {label}
        </span>
        <div className="flex-1" />
        <span className="text-micro tabular">— serves</span>
      </div>
      <div className="h-3.5 rounded-[var(--radius-cell)] bg-[var(--ink-100)]" />
    </div>
  );
}

function Legend({ muted = false }: { muted?: boolean }) {
  return (
    <span className="flex items-center gap-3" style={muted ? { opacity: 0.6 } : undefined}>
      {SEGMENT_LABEL.map((seg, i) => (
        <span key={seg} className="flex items-center gap-1.5">
          <span
            className="h-2 w-3 rounded-[2px]"
            style={{ background: SEGMENT_COLOR[i] }}
            aria-hidden="true"
          />
          <span className="text-micro" style={{ color: "var(--ink-600)" }}>
            {seg}
          </span>
        </span>
      ))}
    </span>
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

const CLAIM_CLASS = "text-[14px] font-light leading-[1.4] text-[var(--ink-900)]";

export function ServePlacementQuietStrip({
  zoneStats,
  matchCount,
  serveCount,
  awaitingReport = false,
  statisticsHref = "/dashboard/statistics",
}: {
  zoneStats: Record<ZoneKey, ZoneStats> | null;
  /** How many matches the bars were read from — "Last 4 · 89 in". */
  matchCount: number;
  /** How many first serves landed in across those matches. */
  serveCount: number;
  /**
   * A match exists but no serve has been mapped yet — the first report is
   * still in the pipeline. Turns the empty line from an instruction into a
   * promise, because "upload a match" to someone who just did is a page that
   * did not notice.
   */
  awaitingReport?: boolean;
  statisticsHref?: string;
}) {
  const caption = zoneStats ? servePlacementCaption(serveCaptionInput(zoneStats)) : null;

  return (
    <div className="surface-card flex flex-col gap-3" style={{ padding: "18px 20px" }}>
      <div className="flex items-center gap-2.5">
        <span className="eyebrow">Serve placement</span>
        <div className="flex-1" />
        {/* The link names the drawn court a click away. Off over the empty
            bars, where a placement view holds nothing to view. */}
        {zoneStats && (
          <Link
            href={statisticsHref}
            className="whitespace-nowrap text-[11px] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            style={{ color: "var(--blue)" }}
          >
            Placement view
          </Link>
        )}
      </div>

      {zoneStats ? (
        <>
          <span className={CLAIM_CLASS} style={{ maxWidth: "30ch" }}>
            {dominantZoneClaim(zoneStats)}
          </span>
          <div className="flex flex-col gap-4">
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
          <div className="flex items-center gap-3.5 border-t border-[var(--border-hairline)] pt-3">
            <Legend />
            <div className="flex-1" />
            <span className="whitespace-nowrap text-[11px] text-[var(--ink-600)]">
              Last <span className="tabular">{matchCount}</span> ·{" "}
              <span className="tabular">{serveCount}</span> in
            </span>
          </div>
          {caption && (
            <span
              className="text-[12px] leading-[1.6] text-[var(--ink-700)]"
              style={{ textWrap: "pretty" }}
            >
              {caption}
            </span>
          )}
        </>
      ) : (
        // The populated card's own anatomy, holding nothing: a rule where the
        // claim goes, the two labelled tracks with no serves in them, the
        // legend, and the caption slot carrying the one sentence that says
        // what fills this. Labels stay — what each bar will report is real
        // information; only the values are absent.
        <>
          <div className="flex flex-col pt-[5px] pb-[5px]" aria-hidden="true">
            <span className="h-2 w-[60%] rounded-[2px] bg-[var(--ink-200)]" />
          </div>
          <div className="flex flex-col gap-4">
            {COURTS.map((court) => (
              <EmptyCourtBar key={court.label} label={court.label} />
            ))}
          </div>
          <div className="flex items-center gap-3.5 border-t border-[var(--border-hairline)] pt-3">
            <Legend muted />
          </div>
          <span className="text-micro" style={{ textWrap: "pretty" }}>
            {awaitingReport
              ? "Your serve map fills in when the first report lands."
              : "Where your first serves land, after your first match."}
          </span>
        </>
      )}
    </div>
  );
}
