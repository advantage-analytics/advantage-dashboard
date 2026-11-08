"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import type { H2HValue } from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import { cn } from "@/lib/utils";

/**
 * The Head to head table, as a presentational surface (artboard 47f): the
 * card, its eyebrow and right micro, the two name columns under their legend
 * marks, then the groups and their rows — the statistic on the left, both
 * sides' figures on the right, the leader at 500 ink-900 and the other at 400
 * ink-500, an italic em dash where a side has no figure.
 *
 * It draws exactly two things, from two callers:
 *
 * - the match report's `HeadToHeadCard`, which hands it the match's rows
 *   (`head-to-head-rows.ts`) and, per row, the hover/tap readouts and the
 *   click-throughs into Video (`interaction`);
 * - the team player profile's `SeasonHeadToHeadCard`, which hands it a
 *   season's rows (`lib/data/player-season.ts`) and nothing else — no cuts,
 *   no readouts.
 *
 * Which side is "you" is the caller's to decide (guardrails §4): the table
 * takes `youName`/`oppName` and rows already written as `you`/`opp`, and
 * nothing here reads `player1`/`player2` to pick a column.
 *
 * A `"use client"` module because the em-dash tooltip is Radix; a Server
 * Component may render it with plain data (the season card does) but cannot
 * pass `interaction`, which is a function.
 */

/* ── Geometry ───────────────────────────────────────────────────────────── */

/**
 * Both value columns and both name cells; the artboard's 64 px, right-aligned.
 * The width is `--h2h-col`, set on the section by `columnWidth()` so a long
 * surname widens the columns together and every row stays aligned under it.
 */
const COLUMN =
  "flex w-[var(--h2h-col,64px)] shrink-0 items-center justify-end gap-1.5";

/**
 * The header's name cells sit right-aligned side by side, so a short surname
 * beside a long one ran its last letter into the next column's marker
 * ("Quan■ Goodm…"). Each name cell keeps this much clear space on its left.
 */
const NAME_GUTTER = 10;

/**
 * 64 px fits a surname of about five characters at 12px beside the legend
 * marker. A longer one gets 8.2px a character (Inter 12px medium sets
 * "Goodman" at 55.6px; 7 a character clipped it), plus 14px for the marker
 * and its gap and the gutter,
 * capped so the statistic label keeps its space; `truncate` backstops anything
 * beyond.
 */
export function columnWidth(youName: string, oppName: string): number {
  const longest = Math.max(youName.length, oppName.length);
  return Math.min(
    140,
    Math.max(64, Math.ceil(longest * 8.2) + 14 + NAME_GUTTER),
  );
}

export const EASE = "duration-200 ease-[var(--ease-primary)]";

/**
 * The figure's box, and its wash. On a target it is the button itself, so the
 * hit area is exactly the grey wash — no wider than the number. The -mr
 * cancels the pr so the digits stay on the column's right edge, aligned with
 * every figure that has no box.
 */
const FIGURE = `tabular -mr-1.5 rounded-[var(--radius-cell)] px-1.5 py-0.5 text-[13px] transition-colors ${EASE}`;

/**
 * The label target's stretched box: its `::after` covers the whole row, so the
 * hit area is exactly the row's wash. The ring moves onto it (with
 * `data-focus-ring="none"` on the element) so focus draws the same box.
 */
export const STRETCHED =
  "after:absolute after:inset-0 after:rounded-[var(--radius-element)] after:content-[''] focus-visible:after:[box-shadow:var(--focus-ring)]";

/** The label slot's box: the row's left, stretching to the first column. */
export const LABEL_SLOT =
  "flex min-w-0 flex-1 items-center self-stretch pr-3 text-[12px] text-[var(--ink-600)]";

/**
 * The label's text, with room beside it for what a caller adds — the report's
 * play glyph and its readout. Positioned so a readout anchors to the text,
 * not to the stretched slot around it.
 */
export function RowLabel({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <span className="relative flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 truncate">{label}</span>
      {children}
    </span>
  );
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

/**
 * What the table needs of a row: the match report's `H2HRow` and the season
 * fold's `SeasonRow` both carry it. A value's `display` of `""` is the shared
 * contract for "no data", drawn as the em dash.
 */
export interface HeadToHeadTableRow {
  label: string;
  /** Why both figures are a dash, for the dash's tooltip. */
  note?: string;
  you: H2HValue;
  opp: H2HValue;
  leader: "you" | "opp" | null;
}

export interface HeadToHeadTableGroup<Row extends HeadToHeadTableRow> {
  title: string;
  rows: readonly Row[];
}

/**
 * Hover, focus and tap wiring for one target — keyboard and finger get what
 * the mouse gets. `onClick` carries the target's click-through, so a finger's
 * first tap can select instead of opening Video.
 */
export interface TargetHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
}

/**
 * One figure's target: its click (absent when there is nothing to open), its
 * screen-reader sentence and its hover wiring.
 */
export interface FigureTarget {
  onClick?: () => void;
  label: string;
  handlers: TargetHandlers;
}

/** One figure's interactive state, from a caller that has readouts. */
export interface CellInteraction {
  /** The cursor or focus is on this figure. */
  washed: boolean;
  /**
   * The figure as a hover target. Every figure with a readout is one, video
   * or not; it clicks through only when its cut has points to open in Video.
   * The em-dash cell ignores it — it keeps its own "No data" tooltip.
   */
  target?: FigureTarget;
  readout?: ReactNode;
}

/**
 * One row's interactive state. Absent (the season card), the row is a plain
 * label and two figures with nothing to hover.
 */
export interface RowInteraction {
  /**
   * The label slot's element — the report's stretched button or focusable
   * note, built with `LABEL_SLOT` / `STRETCHED` / `RowLabel` so it draws as
   * the plain label does.
   */
  label: ReactNode;
  /** The cursor or focus is on the label: the whole row washes. */
  lit: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  you: CellInteraction;
  opp: CellInteraction;
}

function ValueCell({
  value,
  emphasised,
  note,
  washed,
  target,
  readout,
}: {
  value: H2HValue;
  emphasised: boolean;
  note?: string;
  /** The cursor or focus is on this figure. */
  washed: boolean;
  target?: FigureTarget;
  readout?: ReactNode;
}) {
  if (value.display) {
    const style: CSSProperties = {
      fontWeight: emphasised ? 500 : 400,
      color: emphasised ? "var(--ink-900)" : "var(--ink-500)",
      backgroundColor: washed ? "var(--surface-subtle)" : "transparent",
    };
    if (target) {
      // One element for every figure, so a figure with nothing to open is
      // the same hit area, wash and focus ring as one that plays. With no
      // click it is a button with nothing to do — `aria-disabled` says so and
      // keeps it reachable by Tab, which `disabled` would not. `relative z-[1]`
      // lifts it over the row's stretched target. Focus is `focus.css`'s
      // ring — nothing written here.
      return (
        <span className={COLUMN}>
          <button
            type="button"
            aria-disabled={target.onClick ? undefined : true}
            aria-label={target.label}
            {...target.handlers}
            className={cn(
              FIGURE,
              "relative z-[1] border-0",
              target.onClick ? "cursor-pointer" : "cursor-default",
            )}
            style={style}
          >
            {value.display}
            {readout}
          </button>
        </span>
      );
    }
    return (
      <span className={COLUMN}>
        <span className={FIGURE} style={style}>
          {value.display}
        </span>
      </span>
    );
  }

  // The card's missing-data convention (match-statistics-card.tsx): an italic
  // em dash that says why on hover, never a zero. Lifted over the row's
  // stretched target so its tooltip still gets the hover.
  return (
    <span className={COLUMN}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="No data recorded for this stat"
            className="tabular relative z-[1] cursor-help text-[13px] font-light text-[var(--color-text-muted)] italic"
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="px-2.5 py-1.5 text-[11px] leading-[14px]"
        >
          {note ?? "No data"}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

const STATIC_CELL: CellInteraction = { washed: false };

/* ── The table ──────────────────────────────────────────────────────────── */

export interface HeadToHeadTableProps<Row extends HeadToHeadTableRow> {
  groups: readonly HeadToHeadTableGroup<Row>[];
  /** The first column's name — the viewer's side, or the player profiled. */
  youName: string;
  /** The second column's — the opponent, or "Opponents" over a season. */
  oppName: string;
  /** The right micro: what the figures cover — "Whole match · 148 points". */
  caption: ReactNode;
  eyebrow?: string;
  /** The heading's id, for the section's `aria-labelledby`. */
  headingId?: string;
  /** The section element, for a caller that listens on it (touch readouts). */
  sectionRef?: Ref<HTMLElement>;
  /** The report's onboarding-tour anchor (`data-tour`); absent elsewhere. */
  tour?: string;
  /** Per-row readouts and click-throughs; absent, every row is static. */
  interaction?: (row: Row) => RowInteraction;
}

export function HeadToHeadTable<Row extends HeadToHeadTableRow>({
  groups,
  youName,
  oppName,
  caption,
  eyebrow = "Head to head",
  headingId = "head-to-head-heading",
  sectionRef,
  tour,
  interaction,
}: HeadToHeadTableProps<Row>) {
  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-tour={tour}
      className="surface-card flex flex-col"
      style={
        {
          padding: "18px 20px 14px",
          "--h2h-col": `${columnWidth(youName, oppName)}px`,
        } as CSSProperties
      }
    >
      <div className="flex items-baseline gap-3 pb-[14px]">
        <span id={headingId} className="eyebrow">
          {eyebrow}
        </span>
        <div className="flex-1" />
        <span
          className="text-micro tabular whitespace-nowrap"
          style={{ color: "var(--ink-400)" }}
        >
          {caption}
        </span>
      </div>

      {/* Column header — you first, always; the caller decides who that is,
          never player order (guardrails §4). Names are surnames: at 64px a
          full `shortName` overruns the column the way `surnameLabels()` does
          not; `truncate` on top is the backstop for a longer one-word
          surname. */}
      <div className="flex items-center border-b border-[var(--border-hairline)] pb-[11px]">
        <span aria-hidden="true" className="min-w-0 flex-1" />
        <span className={COLUMN} style={{ paddingLeft: NAME_GUTTER }}>
          {/* The player's chart colour on the report's one legend marker,
              so a column reads with every chart key on the page. */}
          <LegendMark color="var(--viz-you)" />
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
            {youName}
          </span>
        </span>
        <span className={COLUMN} style={{ paddingLeft: NAME_GUTTER }}>
          <LegendMark color="var(--viz-opp)" />
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-600)]">
            {oppName}
          </span>
        </span>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="flex flex-col">
          <div className="flex items-baseline pt-3 pb-0.5">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              {group.title}
            </span>
          </div>

          {group.rows.map((row) => {
            const live = interaction?.(row);
            const you = live?.you ?? STATIC_CELL;
            const opp = live?.opp ?? STATIC_CELL;
            return (
              <div
                key={row.label}
                className={cn(
                  "relative -mx-2 flex min-h-[30px] items-center rounded-[var(--radius-element)] px-2 transition-colors",
                  EASE,
                  live?.lit && "bg-[var(--surface-muted)]",
                )}
                onMouseEnter={live?.onMouseEnter}
                onMouseLeave={live?.onMouseLeave}
              >
                {live ? (
                  live.label
                ) : (
                  <span className={LABEL_SLOT}>
                    <RowLabel label={row.label} />
                  </span>
                )}
                <ValueCell
                  value={row.you}
                  emphasised={row.leader === "you"}
                  note={row.note}
                  washed={you.washed && Boolean(you.target)}
                  target={you.target}
                  readout={you.readout}
                />
                <ValueCell
                  value={row.opp}
                  emphasised={row.leader === "opp"}
                  note={row.note}
                  washed={opp.washed && Boolean(opp.target)}
                  target={opp.target}
                  readout={opp.readout}
                />
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
