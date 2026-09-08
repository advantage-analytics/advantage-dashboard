"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ScoreLine } from "@/components/dashboard/score-line";
import {
  DARK_READOUT_CLASS,
  DARK_READOUT_STYLE,
} from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { COURT_RECORD_COLS, EmptyCell } from "@/components/dashboard/team/court-record-shell";
import {
  COURT_RECORD_WINDOW,
  type CourtCell,
  type CourtCellResult,
  type CourtRecord,
} from "@/lib/data/team-court-record";

/**
 * The court record's grid, with the hover box — the client half of
 * `court-record.tsx`.
 *
 * **One tooltip, not seventy-two.** A Radix root per cell would mount a
 * portal, a provider and a timer for every square; the Activity heatmap made
 * the same call at 364 cells. One `hover` state names the cell under the
 * cursor and one absolutely-positioned box follows it, clamped to the grid's
 * width so a cell at either edge does not push the box out of the card.
 *
 * **The dark chart readout — match detail's, by decision (CJ, 2026-09-07).**
 * The box a hovered chart mark opens on the report page, drawn from
 * `chart-tooltip.tsx`'s exported skin. `ChartTooltip` itself hangs from a
 * segment's bottom edge and this box follows a cell, so the anchoring is
 * this file's and the surface is shared. Not the white Data Tooltip the
 * design system describes: CJ named the report page's dark box as the one
 * the product's charts should share.
 *
 * **A played cell is a link.** To the report when one is back, else to the
 * event page where the line lives — the same rule the dual sheet's rows
 * follow — which is also what puts the box within reach of a keyboard: focus
 * opens it as hover does. A court that sat out is a plain span.
 */
const CELL_FILL: Record<CourtCellResult, string> = {
  w: "var(--viz-heatmap-3)",
  l: "var(--viz-heatmap-1)",
  "-": "var(--viz-heatmap-0)",
};

const CELL_WORD: Record<CourtCellResult, string> = {
  w: "won",
  l: "lost",
  "-": "did not play",
};

interface HoverState {
  row: number;
  col: number;
  /** Cell centre x and top y, relative to the grid. */
  cx: number;
  top: number;
}

export function CourtRecordMosaic({ record }: { record: CourtRecord }) {
  const { columns, rows } = record;
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);

  // The columns to the right of the season so far: no header, no result, and
  // out of the accessibility tree — a screen reader should hear four duals,
  // not four duals and eight blanks.
  const padding = Math.max(0, COURT_RECORD_WINDOW - columns.length);

  // Clamp the box's centre to [half, width − half] before paint, so it lands
  // where it will stay rather than jumping in from centred.
  useLayoutEffect(() => {
    if (!hover || !tipRef.current || !wrapRef.current) return;
    const half = tipRef.current.offsetWidth / 2;
    const width = wrapRef.current.clientWidth;
    setTipLeft(Math.min(Math.max(hover.cx, half), width - half));
  }, [hover]);

  const show = (row: number, col: number) => (el: HTMLElement) => {
    // Offsets relative to the wrapper, which is the positioned ancestor.
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cell = el.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    setHover({
      row,
      col,
      cx: cell.left - box.left + cell.width / 2,
      top: cell.top - box.top,
    });
  };
  // Guard on the cell so a stale leave from the one just left cannot clear a
  // hover the next one has already set.
  const hide = (row: number, col: number) =>
    setHover((h) => (h && h.row === row && h.col === col ? null : h));

  const active = hover ? rows[hover.row].cells[hover.col] : null;
  const activeColumn = hover ? columns[hover.col] : null;

  return (
    <div ref={wrapRef} className="relative mt-3.5">
      <div role="table" aria-label="Singles results by court and dual">
        {/* The two text-less headers are real grid items with the name
            inside them — `sr-only` on the item itself is `position:absolute`,
            which drops it out of the grid and shifts every date one track
            left. */}
        <div
          role="row"
          className="mb-1.5 grid items-center gap-1"
          style={{ gridTemplateColumns: COURT_RECORD_COLS }}
        >
          <span role="columnheader">
            <span className="sr-only">Court</span>
          </span>
          {columns.map((column) => (
            <span
              key={column.eventId}
              role="columnheader"
              className="tabular whitespace-nowrap text-center text-[9px] text-[var(--ink-400)]"
              aria-label={`${column.opponent}, ${column.date}`}
            >
              {column.date}
            </span>
          ))}
          {Array.from({ length: padding }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden="true" />
          ))}
          <span role="columnheader">
            <span className="sr-only">Record</span>
          </span>
        </div>

        <div className="flex flex-col gap-[5px]">
          {rows.map((row, r) => (
            <div
              key={row.slot}
              role="row"
              className="grid items-center gap-1"
              style={{ gridTemplateColumns: COURT_RECORD_COLS }}
            >
              <span role="rowheader" className="text-[11px] text-[var(--ink-500)]">
                {row.slot}
              </span>
              {row.cells.map((cell, c) => (
                <Cell
                  key={columns[c].eventId}
                  cell={cell}
                  eventId={columns[c].eventId}
                  label={`${CELL_WORD[cell.result]}${cell.ours ? ` — ${cell.ours} vs ${cell.theirs}` : ""}`}
                  onShow={show(r, c)}
                  onHide={() => hide(r, c)}
                />
              ))}
              {Array.from({ length: padding }, (_, i) => (
                <EmptyCell key={`pad-${i}`} />
              ))}
              <span
                role="cell"
                className="tabular text-right text-[11px] text-[var(--ink-600)]"
              >
                {row.wins}–{row.losses}
              </span>
            </div>
          ))}
        </div>
      </div>

      {active && activeColumn && active.result !== "-" && (
        <div
          ref={tipRef}
          role="tooltip"
          className={`pointer-events-none absolute z-20 flex w-max max-w-[220px] flex-col gap-1 whitespace-nowrap px-3 py-2.5 ${DARK_READOUT_CLASS}`}
          style={{
            ...DARK_READOUT_STYLE,
            left: tipLeft ?? hover!.cx,
            // Above the cell, except on the top row, where "above" is the
            // card's header and the card's edge: there it hangs below.
            ...(hover!.top < 40
              ? { top: hover!.top + 20 + 8, transform: "translateX(-50%)" }
              : { top: hover!.top, transform: "translate(-50%, calc(-100% - 8px))" }),
          }}
        >
          <span className="text-[12px] font-medium text-white">
            {active.ours}
            <span className="text-white/[0.64]"> vs {active.theirs}</span>
          </span>
          <span className="tabular text-[11px] text-white/[0.64]">
            {activeColumn.opponent} · {activeColumn.date}
          </span>
          <span className="flex items-baseline gap-2 pt-0.5">
            {active.forfeit ? (
              <span className="text-[11px] text-white">
                {active.forfeit === "ours" ? "Forfeited" : "Won by forfeit"}
              </span>
            ) : (
              <ScoreLine sets={active.sets} className="tabular text-[11px] text-white" />
            )}
            <span
              className="text-[11px] font-medium"
              style={{ color: active.result === "w" ? "var(--viz-good)" : "var(--viz-bad)" }}
            >
              {active.result === "w" ? "Won" : "Lost"}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function Cell({
  cell,
  eventId,
  label,
  onShow,
  onHide,
}: {
  cell: CourtCell;
  eventId: string;
  label: string;
  onShow: (el: HTMLElement) => void;
  onHide: () => void;
}) {
  const square = "block size-5 rounded-[var(--radius-cell)]";
  const fill = { background: CELL_FILL[cell.result] };

  if (cell.result === "-") {
    return <span role="cell" aria-label={label} className={square} style={fill} />;
  }

  const href = cell.reportId
    ? `/dashboard/matches/${cell.reportId}`
    : `/dashboard/team/schedule/${eventId}`;

  return (
    <span role="cell">
      <Link
        href={href}
        aria-label={label}
        className={`${square} transition-[box-shadow] duration-[var(--duration-fast)] hover:shadow-[0_0_0_2px_var(--blue-ring-30)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--blue-ring-40)]`}
        style={fill}
        onMouseEnter={(e) => onShow(e.currentTarget)}
        onMouseLeave={onHide}
        onFocus={(e) => onShow(e.currentTarget)}
        onBlur={onHide}
      />
    </span>
  );
}
