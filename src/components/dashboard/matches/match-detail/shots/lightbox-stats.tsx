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

/** Won of every row together — the group's average, the bar's tick. */
function groupAverage(group: StatGroup): number | null {
  if (group.rows.some((r) => r.share)) return null;
  const count = group.rows.reduce((n, r) => n + r.count, 0);
  const won = group.rows.reduce((n, r) => n + r.won, 0);
  return count === 0 ? null : Math.round((won / count) * 100);
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
 * · %, over a 4px bar with the average's tick — as drawn in round 3's
 * decisions (option 03 A): every row 12px ink-900, the count 11px ink-500,
 * no row singled out; the bar's tick 8px tall at 50%. The groups share the column's height evenly — 24px apart at
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
      {groups.map((group, i) => {
        const average = groupAverage(group);
        return (
          <Fragment key={group.key}>
            {i > 0 && <GroupSpacer edge="between" />}
            <section className="flex flex-col">
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
  average,
  pressed,
  onClick,
  onHover,
}: {
  row: StatRow;
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
        "-mx-2 flex w-[calc(100%+16px)] cursor-pointer flex-col items-stretch gap-[5px] rounded-[8px] px-2 pt-1.5 pb-2 text-left transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default",
        pressed
          ? "bg-[var(--surface-subtle)]"
          : "hover:bg-[var(--surface-page)]",
      )}
    >
      <span
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)_56px_40px] items-baseline gap-2.5 text-[12px] text-[var(--ink-900)]"
      >
        <span className="truncate">{row.label}</span>
        <span className="text-micro text-right tabular-nums">
          {row.share ? row.count : `${row.won} of ${row.count}`}
        </span>
        <span className="text-right tabular-nums">
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
            className="absolute -top-0.5 h-2 w-px bg-[var(--ink-900)] opacity-50"
            style={{ left: `${average}%` }}
          />
        )}
      </span>
    </button>
  );
}
