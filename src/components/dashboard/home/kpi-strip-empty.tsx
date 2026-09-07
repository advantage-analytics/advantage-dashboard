import { KpiTileStrip } from "@/components/dashboard/shared/kpi-tile";
import { PlaceholderSparkline } from "@/components/dashboard/shared/placeholder-sparkline";
import { SEASON_KPI_LABELS } from "@/lib/data/player-profile";

/**
 * The KPI strip on day zero: present, shaped, and holding no numbers.
 *
 * The strip stays on the page before a match exists because the page you
 * learn on the first visit should be the page you keep using — the same rule
 * Team Home follows. Emptying it rather than removing it means every region a
 * report will fill is already labelled, so a player reads "break points saved"
 * and knows what is coming back without a single figure being invented.
 *
 * Each tile keeps the shipped anatomy exactly (`KpiTile`): 20px padding, a
 * 12px row gap, a 9px label on a 13.5px line at 2.5px tracking, a 28px value
 * row and a 16.5px trend row. Both fixed rows carry `shrink-0` because they
 * are flex items and would otherwise collapse to their content.
 *
 * Two substitutions, and only two. A short rule sits on the value's baseline
 * where the number goes. And the sparkline keeps its 80×28 box, drawn grey
 * (`PlaceholderSparkline`, shared with a live tile's one-match state) with a
 * different shape per tile so the strip does not read as one graphic repeated
 * five times.
 */

/** Where the number's baseline falls in a 28px row of 28px type. */
const VALUE_RULE = "mb-1.5 h-0.5 w-[34px] shrink-0 rounded-[1px] bg-[var(--ink-200)]";

export function KpiStripEmpty({
  awaitingReport = false,
  labels = SEASON_KPI_LABELS,
}: {
  /**
   * A match is filed but nothing has been analysed yet. "After your first
   * match" to someone who has just sent one is a page that did not notice, so
   * the trend row names what is actually being waited on.
   */
  awaitingReport?: boolean;
  /**
   * What the tiles will be called once they hold numbers. The season strip's
   * five by default — the same five on Home and on a player's profile.
   */
  labels?: readonly string[];
}) {
  const hint = awaitingReport ? "When the report lands" : "After your first match";

  return (
    <KpiTileStrip collapse>
      {labels.map((label, index) => (
        <div
          key={label}
          className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-5"
        >
          {/* One line like the shipped label (see `KpiTile`): the strip drops
              tiles before a default label would need to wrap, so the tile's
              measured height holds at every width. */}
          <p className="max-w-full truncate text-[9px] font-normal uppercase leading-[13.5px] tracking-[2.5px] text-[var(--ink-400)]">
            {label}
          </p>
          <div className="flex h-7 shrink-0 items-end overflow-hidden">
            <span className={VALUE_RULE} aria-hidden="true" />
            <div className="flex-1" />
            <PlaceholderSparkline index={index} />
          </div>
          {/* `min-h`, not `h`: one line is the measured 16.5px; where the hint
              wraps in a narrow tile the row grows instead of spilling out of
              the tile's padding. */}
          <div className="flex min-h-[16.5px] shrink-0 items-center">
            <p className="text-[10px] font-normal leading-[1.4] text-[var(--ink-400)]">{hint}</p>
          </div>
        </div>
      ))}
    </KpiTileStrip>
  );
}
