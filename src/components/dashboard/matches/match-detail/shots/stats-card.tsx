import { statRowAnnouncement, statsAreEmpty, type VizStats } from "./viz-model";
import { cn } from "@/lib/utils";
import { HOME_CLAIM_CLASS } from "@/lib/ui/home-claim";

/**
 * The focused-view's statistics card (Task F3): generalises the old
 * serve-only `ZoneCard` to every cut. Driven entirely by a `VizStats` —
 * this file makes no attribution decision and reads no player id; it only
 * renders whatever rows `computeVizStats` handed it.
 *
 * Groups render in order, each with an optional micro label; rows are a
 * `<ul>`/`<li>` list. Each row's ONLY accessible text is a `.sr-only` node
 * carrying `statRowAnnouncement(row)` (`viz-model.ts`) — "Crosscourt: 100%
 * of 4 points won" / "Ad T: no points" — and every visible piece (the
 * label, the win%/count numbers, the bar) is `aria-hidden`, so a screen
 * reader announces exactly one sentence per row, never the bare label and
 * never a duplicate. `statsAreEmpty(stats)` (M4) swaps the rows for the
 * design system's honest-empty copy rather than six dashes (task spec) —
 * checking every row's own `count`, not just `stats.total`, since
 * `returnPlacement` can have a nonzero total (drawable returns) while every
 * row is out/net and reads 0.
 */

export function StatsCard({
  stats,
  className,
}: {
  stats: VizStats;
  /** F5: `viz-focused.tsx` adds `viz-vt-stats-card` — see
   * `VizToolbar`'s identical `className` prop for why. */
  className?: string;
}) {
  const compactGroup =
    stats.groups.length === 1 && stats.groups[0].rows.length <= 4;

  return (
    <div
      className={cn(
        "surface-card flex min-h-0 w-full min-w-0 flex-col overflow-hidden",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 px-[var(--pad-card)] pt-[var(--pad-card)] pb-4">
        <h2
          className="eyebrow tracking-[1.5px]"
          style={{ color: "var(--ink-600)" }}
        >
          {stats.title}
        </h2>
        <p
          className={HOME_CLAIM_CLASS}
          style={{ maxWidth: "30ch", textWrap: "pretty" }}
        >
          {stats.subtitle}
        </p>
      </div>

      {statsAreEmpty(stats) ? (
        <div className="flex min-h-32 flex-1 flex-col items-center justify-center px-5 py-8 text-center">
          <p
            className="text-[12px] leading-[1.6]"
            style={{ color: "var(--ink-600)" }}
          >
            No points match these filters
          </p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--pad-card)] pb-4">
            {stats.groups.map((group, i) => (
              <div
                key={group.key}
                className={cn(
                  i > 0 && "mt-5",
                  compactGroup &&
                    "@min-[720px]:flex @min-[720px]:h-full @min-[720px]:flex-col",
                )}
              >
                {group.label && (
                  <p
                    className="text-micro mb-3 font-medium"
                    style={{ color: "var(--ink-600)" }}
                  >
                    {group.label}
                  </p>
                )}
                <ul
                  className={cn(
                    "flex flex-col gap-3.5",
                    compactGroup &&
                      "@min-[720px]:flex-1 @min-[720px]:justify-evenly",
                  )}
                >
                  {group.rows.map((row) => (
                    <li key={row.key} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        {/* M8/fix: the sr-only node is the row's ONLY
                            accessible text — it carries the full sentence
                            (`statRowAnnouncement`, built from `computeVizStats`
                            rows so it can never regress to an empty label
                            again). The visible label and numbers below are
                            both `aria-hidden` so nothing is announced twice. */}
                        <span className="sr-only">
                          {statRowAnnouncement(row)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="min-w-0 text-[12px] leading-[1.4]"
                          style={{ color: "var(--ink-700)" }}
                        >
                          {row.label}
                        </span>
                        <span
                          aria-hidden="true"
                          className="flex shrink-0 items-baseline gap-1.5"
                        >
                          <span
                            className="text-[13px] leading-none font-normal tabular-nums"
                            style={{ color: "var(--ink-900)" }}
                          >
                            {row.winPct === null ? "—" : `${row.winPct}%`}
                          </span>
                          <span
                            className="text-[11px] tabular-nums"
                            style={{ color: "var(--ink-600)" }}
                          >
                            {row.count}
                          </span>
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="flex h-1.5 w-full overflow-hidden rounded-[var(--radius-cell)]"
                        style={{ backgroundColor: "var(--surface-subtle)" }}
                      >
                        <span
                          className="h-1.5"
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
              className="mx-[var(--pad-card)] shrink-0 border-t border-[var(--border-hairline)] pt-3 pb-[var(--pad-card)] text-[12px] leading-[1.6] text-[var(--ink-700)]"
              style={{ textWrap: "pretty" }}
            >
              {stats.sentence}
            </p>
          )}
        </>
      )}
    </div>
  );
}
