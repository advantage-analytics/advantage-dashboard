import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "../chart-tooltip";
import { statRowTooltip } from "./viz-readout";
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

/** Points counted and won over every row of a group together. */
function groupTotals(group: StatGroup): { count: number; won: number } {
  return {
    count: group.rows.reduce((n, r) => n + r.count, 0),
    won: group.rows.reduce((n, r) => n + r.won, 0),
  };
}

/** Won of every row together — the group's average, the bar's tick. */
function groupAverage(group: StatGroup): number | null {
  if (group.rows.some((r) => r.share)) return null;
  const { count, won } = groupTotals(group);
  return count === 0 ? null : Math.round((won / count) * 100);
}

interface Figure {
  key: string;
  label: string;
  count: number;
  of: number;
}

/**
 * The two figures over the groups (overhaul canvas, `N1-Opened`): points
 * won of the points the rows count, and how many landed in of all drawn.
 * Points won reads off the model's first group (`computeVizStats`) — each
 * of its groups splits the same pool, so any one sums to it; NOT the
 * displayed groups, since the serve's Deuce / Ad split halves the pool — and
 * is left out for the errors cut, where every row is a lost point
 * (`share`). Landed in only for a cut that lands (`VizStats.landed`).
 */
function summaryFigures(stats: VizStats): Figure[] {
  const figures: Figure[] = [];
  const first = stats.groups.find((g) => g.rows.length > 0);
  if (first && !first.rows.some((r) => r.share)) {
    const { count: of, won } = groupTotals(first);
    figures.push({ key: "won", label: "Points won", count: won, of });
  }
  if (stats.landed) {
    figures.push({
      key: "landed",
      label: "Landed in",
      count: stats.landed.count,
      of: stats.landed.of,
    });
  }
  return figures;
}

/** Where the row tooltip hangs: the row's box inside the dialog that
 *  hosts it — the column scrolls and clips, the dialog does not. */
interface TipAnchor {
  host: HTMLElement;
  left: number;
  top: number;
  height: number;
}

/**
 * The lightbox's Statistics column (canvas "Statistics bar variations" A2,
 * S09/S16/S17): each group under its eyebrow with the average on the right
 * ("Average 63%" beside a sample of the tick); each row label · won of count
 * · %, over a 4px bar with the average's tick — as drawn on the overhaul
 * canvas (`N1-Opened`, statistics variation A2): the label 12px ink-600,
 * ink-900 while the row is hovered, focused or kept; the group's best % 13px
 * 500 ink-900 and the rest 13px ink-500; the tick 3px past the bar at 35%;
 * the hover wash rounded 8px with 8px of room each side. Over the groups,
 * the canvas's two figures (`summaryFigures`): "Points won · 14 of 44" and
 * "Landed in · 44 of 44", each a 16px % over its label and a 4px bar,
 * spread with the groups as the stack's first item. The groups share the column's height evenly — 24px apart at
 * least, 56px at most, so on a tall screen they settle in the middle rather
 * than drifting apart — and a list taller than the column scrolls as one
 * stacked at 24px (`GroupSpacer`).
 *
 * Every figure is the row's own (`computeVizStats`); the tick is this
 * match's average for the group — the "This match" benchmark, until a
 * cross-match one exists (plan phase 7). Hovering a row outlines its zone
 * on the court; clicking keeps only its marks there and in Points
 * (`stat-cut.ts`), and clicking it again lets go. Hovering or focusing a
 * row also hangs the dark readout beside it (`statRowTooltip`), to its left
 * over the court column's edge — a label, never a control
 * (`pointer-events-none`), portalled into the dialog so the column's scroll
 * does not clip it.
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
  // The readout's content outlives the hover by its fade: `open` goes, the
  // last row's words stay until the next row replaces them.
  const [tip, setTip] = useState<{
    group: string;
    row: string;
    anchor: TipAnchor;
  } | null>(null);
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  if (statsAreEmpty(stats)) {
    return (
      <p className="py-5 text-[12px] leading-[1.6] text-[var(--ink-600)]">
        No points match these filters
      </p>
    );
  }
  const groups = displayGroups(stats, cut);
  const figures = summaryFigures(stats);
  // The tooltip's words, read off the rows as they are now — a click that
  // keeps the row turns its hint to "Click to show all again" in place.
  const tipGroup =
    tip === null ? undefined : groups.find((g) => g.key === tip.group);
  const tipRow = tipGroup?.rows.find((r) => r.key === tip?.row);
  const tipContent =
    tipGroup && tipRow
      ? statRowTooltip(
          tipRow,
          cut,
          {
            average: groupAverage(tipGroup),
            total: tipGroup.rows.reduce((n, r) => n + r.count, 0),
          },
          pick?.group === tipGroup.key && pick.row === tipRow.key,
        )
      : null;
  return (
    <div className="flex min-h-full flex-col">
      {tip !== null &&
        tipContent !== null &&
        createPortal(
          <span
            aria-hidden="true"
            data-stat-tooltip-anchor=""
            className="pointer-events-none absolute w-0"
            style={{
              left: tip.anchor.left,
              top: tip.anchor.top,
              height: tip.anchor.height,
            }}
          >
            <ChartTooltip
              open={tipOpen === `${tip.group}/${tip.row}`}
              side="left"
              offset={12}
              className="z-[5] px-3 pt-2.5 pb-[11px]"
            >
              <span
                data-stat-tooltip=""
                className="flex flex-col gap-0.5 whitespace-nowrap"
              >
                <span className="mb-0.5 flex items-center">
                  <span className="text-[12px] leading-[1.35] font-medium text-white">
                    {tipContent.title}
                  </span>
                  {tipContent.value !== null && (
                    <span className="ml-auto pl-3.5 text-[11px] leading-[1.35] text-white/[0.64] tabular-nums">
                      {tipContent.value}
                    </span>
                  )}
                </span>
                {tipContent.lines.map((line) => (
                  <span
                    key={line}
                    className="text-[11px] leading-[1.45] text-white/[0.64] tabular-nums"
                  >
                    {line}
                  </span>
                ))}
                <span className="mt-1 border-t border-[rgba(255,255,255,0.12)] pt-1.5 text-[11px] leading-[1.45] text-white/[0.64]">
                  {tipContent.hint}
                </span>
              </span>
            </ChartTooltip>
          </span>,
          tip.anchor.host,
        )}
      <GroupSpacer edge="top" />
      {figures.length > 0 && (
        <>
          <div
            data-stat-summary=""
            className="grid grid-cols-2 gap-x-3 gap-y-4"
          >
            {figures.map((f) => {
              const pct =
                f.of === 0 ? null : Math.round((f.count / f.of) * 100);
              return (
                <p key={f.key} className="m-0 flex min-w-0 flex-col gap-0.5">
                  <span className="sr-only">
                    {f.label}: {pct === null ? "none yet" : `${pct}%`},{" "}
                    {f.count} of {f.of}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[16px] leading-[1.35] text-[var(--ink-900)] tabular-nums"
                  >
                    {pct === null ? "—" : `${pct}%`}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-micro text-[var(--ink-600)] tabular-nums"
                  >
                    {f.label} · {f.count} of {f.of}
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative mt-1.5 block h-1 rounded-[2px] bg-[var(--ink-100)]"
                  >
                    {pct !== null && (
                      <i
                        className="absolute inset-y-0 left-0 rounded-[2px] bg-[var(--blue)]"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </span>
                </p>
              );
            })}
          </div>
          <GroupSpacer edge="between" />
        </>
      )}
      {groups.map((group, i) => {
        const average = groupAverage(group);
        // Every row at the group's top rate: tied rows read alike, so none
        // looks better than its equal.
        const rates = group.rows
          .filter((r) => r.count > 0 && r.winPct !== null)
          .map((r) => r.winPct!);
        const bestPct = rates.length ? Math.max(...rates) : null;
        return (
          <Fragment key={group.key}>
            {i > 0 && <GroupSpacer edge="between" />}
            <section className="flex flex-col">
              <div className="flex items-baseline gap-2 pb-1">
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
                      best={
                        bestPct !== null &&
                        row.count > 0 &&
                        row.winPct === bestPct &&
                        !row.share
                      }
                      average={average}
                      pressed={
                        pick?.group === group.key && pick.row === row.key
                      }
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
                      onHover={(el) => {
                        const key = `${group.key}/${row.key}`;
                        const host =
                          el?.closest<HTMLElement>('[role="dialog"]');
                        if (el && host) {
                          const box = el.getBoundingClientRect();
                          const hostBox = host.getBoundingClientRect();
                          setTip({
                            group: group.key,
                            row: row.key,
                            anchor: {
                              host,
                              left: box.left - hostBox.left,
                              top: box.top - hostBox.top,
                              height: box.height,
                            },
                          });
                          setTipOpen(key);
                        } else {
                          setTipOpen((prev) => (prev === key ? null : prev));
                        }
                        onHover(
                          el
                            ? {
                                group: group.key,
                                row: row.key,
                                label: row.label,
                              }
                            : null,
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </Fragment>
        );
      })}
      <GroupSpacer edge="bottom" />
    </div>
  );
}

/**
 * The room around the groups, all growing alike so the groups spread over
 * the column's height (space-evenly). Between groups it is 24px at least and
 * 56px at most; once those cap, the top and bottom take what is left and the
 * stack sits centred. With no room to spare each holds its minimum — 20px
 * above, 24px between, nothing below — the stack the column always drew,
 * and it scrolls.
 */
function GroupSpacer({ edge }: { edge: "top" | "between" | "bottom" }) {
  return (
    <div
      aria-hidden="true"
      data-stat-spacer={edge}
      className={cn(
        "flex-1 shrink-0",
        edge === "top" && "min-h-5",
        edge === "between" && "max-h-14 min-h-6",
      )}
    />
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
  /** The group's best win rate: its % reads 13/500 ink-900, the rest grey. */
  best: boolean;
  average: number | null;
  pressed: boolean;
  onClick: () => void;
  /** The row's element while hovered or focused, `null` as it lets go. */
  onHover: (el: HTMLElement | null) => void;
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
      onPointerEnter={(e) => onHover(e.currentTarget)}
      onPointerLeave={() => onHover(null)}
      onFocus={(e) => onHover(e.currentTarget)}
      onBlur={() => onHover(null)}
      className={cn(
        "group -mx-2 flex w-[calc(100%+16px)] cursor-pointer flex-col items-stretch gap-[5px] rounded-[8px] px-2 pt-1.5 pb-2 text-left transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default",
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
            "truncate text-[12px] transition-colors duration-200",
            pressed
              ? "text-[var(--ink-900)]"
              : "text-[var(--ink-600)] group-hover:text-[var(--ink-900)] group-focus-visible:text-[var(--ink-900)]",
          )}
        >
          {row.label}
        </span>
        <span className="text-micro text-right tabular-nums">
          {row.share ? row.count : `${row.won} of ${row.count}`}
        </span>
        <span
          className={cn(
            "text-right text-[13px] tabular-nums",
            best
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-500)]",
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
