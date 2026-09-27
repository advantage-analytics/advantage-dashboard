import {
  statRowAnnouncement,
  statsAreEmpty,
  type Cut,
  type StatGroup,
  type VizStats,
} from "./viz-model";
import { cn } from "@/lib/utils";
import { HOME_CLAIM_CLASS } from "@/lib/ui/home-claim";
import { CUT_LABEL } from "./viz-labels";

const SERVE_ZONE_ORDER = ["t", "body", "wide"] as const;
const SERVE_SEGMENT_LABEL = ["T", "Body", "Wide"] as const;
const SERVE_SEGMENT_COLOR = [
  "var(--viz-you)",
  "var(--viz-you-mid)",
  "var(--viz-you-light)",
] as const;

function displayGroups(stats: VizStats, cut: Cut): StatGroup[] {
  if (cut !== "serve") return stats.groups;
  const rows = stats.groups.flatMap((group) => group.rows);
  return (["deuce", "ad"] as const).map((side) => ({
    key: side,
    label: `${side === "deuce" ? "Deuce" : "Ad"} court`,
    rows: SERVE_ZONE_ORDER.flatMap((zone) =>
      rows.filter((row) => row.key === `${side}-${zone}`),
    ),
  }));
}

function ServeCourtBar({ group }: { group: StatGroup }) {
  const total = group.rows.reduce((sum, row) => sum + row.count, 0);
  const firstDrawn = group.rows.findIndex((row) => row.count > 0);
  const lastDrawn = group.rows.findLastIndex((row) => row.count > 0);

  return (
    <div className="flex shrink-0 flex-col gap-[5px]">
      <div className="flex items-baseline gap-2">
        <p className="text-micro" style={{ color: "var(--ink-700)" }}>
          {group.label}
        </p>
        <div className="flex-1" />
        <span
          className="text-micro tabular-nums"
          style={{ color: "var(--ink-600)" }}
        >
          {total} serves
        </span>
      </div>
      <div
        className="flex h-3.5 gap-0.5 rounded-[var(--radius-cell)] bg-[var(--ink-100)]"
        aria-hidden="true"
      >
        {group.rows.map((row, index) => (
          <span
            key={row.key}
            className={cn(
              "min-w-0",
              index === firstDrawn && "rounded-l-[var(--radius-cell)]",
              index === lastDrawn && "rounded-r-[var(--radius-cell)]",
            )}
            style={{
              width: total === 0 ? 0 : `${(row.count / total) * 100}%`,
              backgroundColor: SERVE_SEGMENT_COLOR[index],
            }}
          />
        ))}
      </div>
      <ul className="flex items-baseline justify-between gap-2">
        {group.rows.map((row, index) => (
          <li key={row.key} className="min-w-0">
            <span className="sr-only">{statRowAnnouncement(row)}</span>
            <span
              className="text-micro whitespace-nowrap tabular-nums"
              aria-hidden="true"
            >
              {SERVE_SEGMENT_LABEL[index]}{" "}
              {row.winPct === null ? "—" : `${row.winPct}%`} · {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  cut,
  className,
}: {
  stats: VizStats;
  cut: Cut;
  /** F5: `viz-focused.tsx` adds `viz-vt-stats-card` — see
   * `VizToolbar`'s identical `className` prop for why. */
  className?: string;
}) {
  const groups = displayGroups(stats, cut);
  const compactGroup = groups.length === 1 && groups[0].rows.length <= 4;

  return (
    <div
      className={cn(
        "surface-card flex min-h-0 w-full min-w-0 flex-col overflow-hidden",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 px-[var(--pad-card)] pt-[var(--pad-card)] pb-4">
        <p className="eyebrow">{CUT_LABEL[cut]}</p>
        <h2 className={HOME_CLAIM_CLASS}>{stats.title}</h2>
        <p
          className="text-micro"
          style={{ color: "var(--ink-600)", textWrap: "pretty" }}
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
          {cut === "serve" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[var(--pad-card)] pb-[var(--pad-card)]">
              {groups.map((group) => (
                <ServeCourtBar key={group.key} group={group} />
              ))}
              <div className="mt-auto shrink-0 border-t border-[var(--border-hairline)] pt-3">
                <p className="text-micro text-[var(--ink-600)]">
                  Width shows serve share · % shows points won
                </p>
                {stats.sentence && (
                  <p
                    className="mt-2 text-[12px] leading-[1.6] text-[var(--ink-700)]"
                    style={{ textWrap: "pretty" }}
                  >
                    {stats.sentence}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-[var(--pad-card)] pb-4">
              {groups.map((group, i) => (
                <div
                  key={group.key}
                  className={cn(
                    i > 0 && "mt-5",
                    compactGroup &&
                      "@min-[720px]:flex @min-[720px]:h-full @min-[720px]:flex-col",
                  )}
                >
                  {group.label && (
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <p
                        className="text-micro"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {group.label}
                      </p>
                    </div>
                  )}
                  <ul
                    className={cn(
                      "flex flex-col gap-3",
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
                            className="text-micro min-w-0"
                            style={{ color: "var(--ink-700)" }}
                          >
                            {row.label}
                          </span>
                          <span
                            aria-hidden="true"
                            className="flex shrink-0 items-baseline gap-1.5"
                          >
                            <span
                              className="text-micro leading-none tabular-nums"
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
                          className="flex h-2 w-full overflow-hidden rounded-[var(--radius-cell)]"
                          style={{ backgroundColor: "var(--surface-subtle)" }}
                        >
                          <span
                            className="h-2"
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
          )}
          {stats.sentence && cut !== "serve" && (
            <div className="mx-[var(--pad-card)] shrink-0 border-t border-[var(--border-hairline)] pt-3 pb-[var(--pad-card)]">
              <p
                className="text-[12px] leading-[1.6] text-[var(--ink-700)]"
                style={{ textWrap: "pretty" }}
              >
                {stats.sentence}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
