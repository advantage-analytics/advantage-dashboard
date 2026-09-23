"use client";

import { Fragment, useState } from "react";
import { Chip } from "@/components/dashboard/schedule/static/chip";
import {
  MatchesFilterPanel,
  type FilterPanelSection,
} from "@/components/dashboard/matches/matches-filter-panel";
import { SortTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { eventRowId } from "@/components/dashboard/schedule/use-row-selection";
import { cn } from "@/lib/utils";

/**
 * The event-page table kit — a dual's lines and a tournament's matches drawn
 * in the Matches page's grammar, with its peek drawer beside them.
 *
 * Frames: `docs/superpowers/specs/2026-09-23-event-pages-match-table/`
 * (`Main.dc.html` for spacing and copy). Presentational only: every row,
 * pill, sort option and filter section arrives as a prop, so the dual page
 * and the tournament page compose the same pieces. Selection lives in
 * `useRowSelection` beside this file.
 */

export { eventRowId };

/**
 * "vs Ridgemont Tech" — the `vs` in `--ink-600` so the opponent's name carries
 * the line on its own. Handed to `EventHeader` as its `title`.
 *
 * A helper rather than a rule inside the header: a tournament's title is its
 * own name with no prefix, and a header that prefixed everything would print
 * "vs Fall Invitational".
 */
export function EventTitle({ vs, name }: { vs?: boolean; name: string }) {
  if (!vs) return <>{name}</>;
  return (
    <>
      <span style={{ color: "var(--ink-600)" }}>vs </span>
      {name}
    </>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

/**
 * The page: a column of two groups — header + strip (24px apart), then
 * toolbar + table + footer (12px apart, the footer 16px under the card) —
 * with 32px between the groups, and the peek drawer as the column's flex
 * sibling, so the table reflows to the width the drawer leaves.
 */
export function EventPageLayout({
  header,
  strip,
  toolbar,
  table,
  footer,
  drawer,
}: {
  header: React.ReactNode;
  strip?: React.ReactNode;
  toolbar?: React.ReactNode;
  table: React.ReactNode;
  footer?: React.ReactNode;
  /** A `PeekDrawerFrame`, or null while nothing is selected. */
  drawer?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-8 px-14 pt-6 pb-7">
        <div className="flex flex-col gap-6">
          {header}
          {strip}
        </div>
        <div className="flex flex-col gap-3">
          {toolbar}
          <div className="flex flex-col gap-4">
            {table}
            {footer}
          </div>
        </div>
      </div>
      {drawer}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────────── */

/**
 * One fact in the event header's subline, in the match-metadata register
 * (`MatchMetadataRow`, the Glyph Registry's "Fixture/event metadata" row): a
 * 13px glyph at --ink-400 and a `text-micro` label (11px, --ink-500), 5px
 * apart. `tabular` holds a date's digits in their columns. The icon is passed
 * in already sized — a lucide glyph with `size-[13px] text-[var(--ink-400)]`
 * and stroke 1.5, or the 13px court SVG.
 */
export function EventFact({
  icon,
  tabular = false,
  children,
}: {
  icon: React.ReactNode;
  tabular?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap">
      {icon}
      <span className={cn("text-micro", tabular && "tabular")}>{children}</span>
    </span>
  );
}

/**
 * Title row: optional mark, the display title, one subline of icon facts
 * (`EventFact`s, 14px between them, no separators), and the actions on the
 * right.
 */
export function EventHeader({
  title,
  mark,
  subline = [],
  actions,
  titleId,
}: {
  title: React.ReactNode;
  mark?: React.ReactNode;
  /** `EventFact`s — date, site, surface… — in reading order; empty parts
   *  (null, false, "") are dropped. */
  subline?: React.ReactNode[];
  actions?: React.ReactNode;
  titleId?: string;
}) {
  const parts = subline.filter(
    (part) =>
      part !== null && part !== undefined && part !== false && part !== "",
  );
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex min-w-0 items-center gap-3.5">
        {mark}
        <div className="flex min-w-0 flex-col gap-2">
          <h1
            id={titleId}
            tabIndex={titleId ? -1 : undefined}
            className="text-display outline-none"
          >
            {title}
          </h1>
          {parts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-[14px]">
              {parts.map((part, i) => (
                <Fragment key={i}>{part}</Fragment>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* ── Summary strip ──────────────────────────────────────────────────────── */

/** The row of facts under the title. No top or bottom rule — cells split by hairlines. */
export function SummaryStrip({ children }: { children: React.ReactNode }) {
  return <div className="flex items-stretch">{children}</div>;
}

/**
 * One fact: a 9px eyebrow over a 16px tabular value and an optional 12px
 * ink-500 word after it. The frame draws the value at 15px, which is off the
 * type scale; 16px is the step the Matches drawer's snapshot figures use
 * (`drawer-sections.tsx`), so the two surfaces print figures at one size. Every cell after the first carries the hairline
 * left rule and 28px either side; the first sits flush left.
 */
export function SummaryCell({
  label,
  value,
  trailing,
}: {
  label: string;
  value: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-[var(--border-hairline)] pr-7 not-first:border-l not-first:pl-7">
      <span className="eyebrow-sm">{label}</span>
      <span
        className="tabular flex h-5 items-center gap-2 text-[16px] leading-none whitespace-nowrap"
        style={{ color: "var(--ink-900)" }}
      >
        {value}
        {trailing ? (
          <span className="text-[12px]" style={{ color: "var(--ink-500)" }}>
            {trailing}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */

export interface ToolbarOption<V extends string> {
  value: V;
  label: string;
}

/**
 * The filter row: view pills on the left (`Chip`), Filters and the sort on
 * the right. Filters is the Matches page's panel, driven through its
 * segmented sections exactly as the Schedule drives it; both right-hand
 * controls are optional.
 */
export function EventToolbar<
  P extends string,
  K extends string,
  S extends string,
>({
  pills,
  pill,
  onPillChange,
  filter,
  sort,
}: {
  pills: readonly ToolbarOption<P>[];
  pill: P;
  onPillChange: (next: P) => void;
  filter?: {
    sections: FilterPanelSection<K>[];
    value: (key: K) => string | null;
    onSelect: (key: K, value: string | null) => void;
    onClear: () => void;
    hasActive: boolean;
    resultCount: number;
    totalCount: number;
    /** "Filter lines" — the trigger's title and the panel's accessible name. */
    label: string;
    noun: { singular: string; plural: string };
  };
  sort?: {
    options: readonly ToolbarOption<S>[];
    value: S;
    onChange: (next: S) => void;
  };
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {pills.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={option.value === pill}
            onClick={() => onPillChange(option.value)}
          />
        ))}
      </div>
      {filter || sort ? (
        <div className="flex shrink-0 items-center gap-1">
          {filter ? (
            <MatchesFilterPanel<K>
              sections={filter.sections}
              hasActive={filter.hasActive}
              isChecklistActive={() => false}
              onToggleChecklist={() => {}}
              segmentedValue={filter.value}
              onSelectSegment={filter.onSelect}
              onClear={filter.onClear}
              resultCount={filter.resultCount}
              totalCount={filter.totalCount}
              label={filter.label}
              noun={filter.noun}
            />
          ) : null}
          {sort ? <SortMenu {...sort} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function SortMenu<S extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly ToolbarOption<S>[];
  value: S;
  onChange: (next: S) => void;
}) {
  const [open, setOpen] = useState(false);
  const current =
    options.find((option) => option.value === value) ?? options[0];

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={172}
      sideOffset={6}
      label="Sort order"
      trigger={
        <SortTrigger
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Sort: ${current?.label ?? ""}`}
          engaged={open}
          className="cursor-pointer"
        >
          {current?.label}
        </SortTrigger>
      }
    >
      {options.map((option) => (
        <FloatMenuItem
          key={option.value}
          label={option.label}
          chosen={option.value === value}
          onSelect={() => {
            onChange(option.value);
            setOpen(false);
          }}
        />
      ))}
    </FloatMenu>
  );
}

/* ── Table ──────────────────────────────────────────────────────────────── */

/**
 * The one inset table card: eyebrow headers over a hairline, then group
 * heads and 48px rows with no dividers. `grid` is the Tailwind
 * `grid-cols-[…]` class the header and every `EventRow` share. With no rows,
 * `empty` (a `TableEmptyBody`) is drawn under the headers — the card stays.
 */
export function EventTable({
  grid,
  columns,
  rowCount,
  empty,
  children,
}: {
  grid: string;
  columns: readonly string[];
  rowCount: number;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card min-w-0 px-6 pt-0.5 pb-2.5">
      <div
        role="row"
        className={cn(
          "grid items-center gap-x-4 border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          grid,
        )}
      >
        {columns.map((label, i) => (
          <span
            key={label || `col-${i}`}
            role="columnheader"
            className="eyebrow-sm min-w-0 truncate"
          >
            {label}
          </span>
        ))}
      </div>
      {rowCount === 0 ? empty : children}
    </div>
  );
}

/**
 * A section inside the table — "SINGLES 4–2", "DOUBLES 2–1 point ours". The
 * first group sits 12px under the header rule, later ones 22px under the row
 * above.
 */
export function EventGroupHead({
  label,
  value,
  trailing,
  first = false,
}: {
  label: string;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-2.5 pb-1",
        first ? "pt-3" : "pt-[22px]",
      )}
    >
      <span className="eyebrow">{label}</span>
      {value !== undefined && value !== null ? (
        <span
          className="tabular text-[12px] leading-none"
          style={{ color: "var(--ink-900)" }}
        >
          {value}
        </span>
      ) : null}
      {trailing ? (
        <span
          className="text-[11px] leading-none"
          style={{ color: "var(--ink-500)" }}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One 48px row. Peeks, never navigates: a click (or Enter/Space) calls
 * `onToggle`, and the selected row keeps the Matches row's wash with
 * `aria-current="true"`. No dividers between rows; the hover wash is inset
 * by the row's `-mx-4 px-4`, so cells still land on the header's x.
 */
export function EventRow({
  id,
  grid,
  selected,
  onToggle,
  label,
  children,
}: {
  id: string;
  grid: string;
  selected: boolean;
  onToggle: (id: string, viaKeyboard: boolean) => void;
  /** The row's accessible name, when its cells alone would read poorly. */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={eventRowId(id)}
      role="row"
      tabIndex={0}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      onClick={() => onToggle(id, false)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(id, true);
        }
      }}
      className={cn(
        "-mx-4 grid h-12 cursor-pointer items-center gap-x-4 rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
        grid,
      )}
    >
      {children}
    </div>
  );
}

/** The line under the card, flush with its edges: format on the left, an optional note on the right. */
export function EventTableFooter({
  start,
  end,
}: {
  start?: React.ReactNode;
  end?: React.ReactNode;
}) {
  return (
    <div className="text-micro flex items-center justify-between gap-4">
      <span>{start}</span>
      {end ? <span className="flex items-center gap-1.5">{end}</span> : null}
    </div>
  );
}
