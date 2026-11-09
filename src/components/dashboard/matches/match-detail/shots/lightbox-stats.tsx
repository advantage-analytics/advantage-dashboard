import { cn } from "@/lib/utils";
import type { StatPick } from "./stat-cut";
import {
  statRowAnnouncement,
  statsAreEmpty,
  type Cut,
  type StatGroup,
  type StatRow,
  type VizStats,
} from "./viz-model";

const SERVE_ZONE_ORDER = ["t", "body", "wide"] as const;

/**
 * Serve's six zone rows read as two groups, Deuce court and Ad court, each
 * T · Body · Wide (as the shipped stats card drew them); every other cut's
 * groups are `computeVizStats`' own.
 */
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

/** Won of every row together — the group's average, the bar's tick. */
function groupAverage(group: StatGroup): number | null {
  if (group.rows.some((r) => r.share)) return null;
  const count = group.rows.reduce((n, r) => n + r.count, 0);
  const won = group.rows.reduce((n, r) => n + r.won, 0);
  return count === 0 ? null : Math.round((won / count) * 100);
}

/**
 * The lightbox's Statistics column (canvas "Statistics bar variations" A2,
 * S09/S16/S17): each group under its eyebrow with the average on the right
 * ("Average 63%" beside a sample of the tick); each row label · won of count
 * · %, over a 4px bar with the average's tick. The best row's % is 13/500
 * ink-900. Groups sit 24px apart.
 *
 * Every figure is the row's own (`computeVizStats`); the tick is this
 * match's average for the group — the "This match" benchmark, until a
 * cross-match one exists (plan phase 7). Hovering a row outlines its zone
 * on the court; clicking keeps only its marks there and in Points
 * (`stat-cut.ts`), and clicking it again lets go.
 */
export function LightboxStats({
  stats,
  cut,
  pick,
  onPick,
  onHover,
}: {
  stats: VizStats;
  cut: Cut;
  pick: StatPick | null;
  onPick: (pick: StatPick | null) => void;
  onHover: (pick: StatPick | null) => void;
}) {
  if (statsAreEmpty(stats)) {
    return (
      <p className="py-5 text-[12px] leading-[1.6] text-[var(--ink-600)]">
        No points match these filters
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6 pt-5">
      {displayGroups(stats, cut).map((group) => {
        const average = groupAverage(group);
        const counted = group.rows.filter(
          (r) => r.count > 0 && r.winPct !== null,
        );
        const best = counted.length
          ? counted.reduce((a, b) =>
              (b.winPct ?? 0) > (a.winPct ?? 0) ? b : a,
            )
          : null;
        return (
          <section key={group.key} className="flex flex-col">
            <div className="flex items-baseline gap-2 pb-1.5">
              {group.label && (
                <h3 className="m-0 text-[9px] font-normal tracking-[1.5px] text-[var(--ink-400)] uppercase">
                  {group.label}
                </h3>
              )}
              <span className="flex-1" />
              {average !== null && (
                <span className="text-micro inline-flex items-center gap-1.5 tabular-nums">
                  <span
                    aria-hidden="true"
                    className="inline-block h-[9px] w-px bg-[var(--ink-900)] opacity-50"
                  />
                  Average {average}%
                </span>
              )}
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.rows.map((row) => (
                <li key={row.key}>
                  <StatRowButton
                    row={row}
                    best={best?.key === row.key && !row.share}
                    average={average}
                    pressed={pick?.group === group.key && pick.row === row.key}
                    onClick={() => {
                      const next = {
                        group: group.key,
                        row: row.key,
                        label: row.label,
                      };
                      onPick(
                        pick?.group === group.key && pick.row === row.key
                          ? null
                          : next,
                      );
                    }}
                    onHover={(on) =>
                      onHover(
                        on
                          ? { group: group.key, row: row.key, label: row.label }
                          : null,
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function StatRowButton({
  row,
  best,
  average,
  pressed,
  onClick,
  onHover,
}: {
  row: StatRow;
  best: boolean;
  average: number | null;
  pressed: boolean;
  onClick: () => void;
  onHover: (on: boolean) => void;
}) {
  const pct = row.winPct;
  const empty = row.count === 0;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={statRowAnnouncement(row)}
      disabled={empty}
      onClick={onClick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={cn(
        "-mx-2 flex w-[calc(100%+16px)] cursor-pointer flex-col items-stretch gap-[5px] rounded-[8px] px-2 pt-1.5 pb-2 text-left transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default",
        pressed
          ? "bg-[var(--surface-subtle)]"
          : "hover:bg-[var(--surface-page)]",
      )}
    >
      <span
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)_56px_40px] items-baseline gap-2.5"
      >
        <span
          className={cn(
            "truncate text-[12px]",
            best || pressed ? "text-[var(--ink-900)]" : "text-[var(--ink-700)]",
          )}
        >
          {row.label}
        </span>
        <span className="text-micro text-right tabular-nums">
          {row.share ? row.count : `${row.won} of ${row.count}`}
        </span>
        <span
          className={cn(
            "text-right tabular-nums",
            best
              ? "text-[13px] font-medium text-[var(--ink-900)]"
              : "text-[13px] text-[var(--ink-700)]",
          )}
        >
          {pct === null ? "—" : `${pct}%`}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="relative block h-1 rounded-[2px] bg-[var(--ink-100)]"
      >
        {pct !== null && (
          <i
            className="absolute inset-y-0 left-0 rounded-[2px] bg-[var(--blue)]"
            style={{ width: `${pct}%` }}
          />
        )}
        {average !== null && (
          <b
            className="absolute -inset-y-[3px] w-px bg-[var(--ink-900)] opacity-35"
            style={{ left: `${average}%` }}
          />
        )}
      </span>
    </button>
  );
}
