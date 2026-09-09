"use client";

/**
 * PinnedEventBar — the 36px bar the create flows pin an already-chosen event
 * under, in `PinnedLineBar`'s register (`new-match-wizard/PinnedLineBar.tsx`):
 * same height, same `border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)]
 * px-[18px]` surface, the same 11px glyph-led facts and the same quiet blue
 * `Change`.
 *
 * It is not a replacement for `PinnedLineBar` — that bar pins a LINE inside an
 * event (name, opponent, the lineup float menu to switch lines). This one pins
 * the EVENT itself: a dual or tournament already decided before the step that
 * uses this bar runs. There is no lineup here and nothing floats open — a
 * click on `Change` is the caller's problem, not a `Popover` this component
 * owns.
 *
 * `onChange` is optional on purpose: the edit flow (T19) pins an opponent that
 * cannot change once a dual exists, and passes no handler at all rather than
 * a disabled button — an control that can never do anything is not a control.
 */

import { Calendar, MapPin, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatEventDay,
  formatEventSpanWithYear,
  siteLabel,
  formatLabel,
} from "@/lib/schedule/format";
import type { EventFormat, EventSite } from "@/lib/schedule/types";

/**
 * The bracket mark for a tournament, drawn the same way `BracketMark` in
 * `static-event-chooser.tsx` is — the design's own 15×15 path, because Lucide
 * has no draw/bracket glyph. Inlined a second time rather than exported from
 * that file: it is a static-event-chooser private the way `CourtGlyph` in
 * `event-page.tsx` is, and it inherits `currentColor` the same way.
 */
function BracketMark({ className }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 15 15"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M1.875 1.875H5V5.625H1.875M5 3.75H9.375V11.25H5M9.375 7.5H13.75M1.875 9.375H5V13.125H1.875"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A hairline pipe between two facts, matching `PinnedLineBar`'s separator. */
function FactDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]"
    />
  );
}

export function PinnedEventBar({
  kind,
  name,
  subline,
  date,
  endDate,
  site,
  format,
  onChange,
}: {
  kind: "dual" | "tournament";
  name: string;
  subline?: string | null;
  /** YYYY-MM-DD. */
  date?: string | null;
  /** YYYY-MM-DD. When given alongside `date`, prints as a span. */
  endDate?: string | null;
  site?: EventSite | null;
  format?: EventFormat | null;
  /** Omit to pin the event with no way to change it (the edit flow). */
  onChange?: () => void;
}) {
  const dateLabel = date
    ? endDate && endDate !== date
      ? formatEventSpanWithYear(date, endDate)
      : formatEventDay(date)
    : null;

  const facts: React.ReactNode[] = [];
  if (dateLabel) {
    facts.push(
      <span
        key="date"
        className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-600)]"
      >
        <Calendar
          className="size-[13px] text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {dateLabel}
      </span>,
    );
  }
  if (site) {
    facts.push(
      <span
        key="site"
        className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-600)]"
      >
        <MapPin
          className="size-[13px] text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {siteLabel(site)}
      </span>,
    );
  }
  if (format) {
    facts.push(
      <span
        key="format"
        className="inline-flex shrink-0 items-center text-[11px] text-[var(--ink-600)]"
      >
        {formatLabel(format)}
      </span>,
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]">
      {kind === "dual" ? (
        <Swords
          className="size-[13px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ) : (
        <BracketMark className="size-[13px] shrink-0 text-[var(--ink-400)]" />
      )}
      <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
        {name}
      </span>
      {subline ? (
        <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
          {subline}
        </span>
      ) : null}

      {facts.length > 0 && (
        <>
          <span
            className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]"
            aria-hidden="true"
          />
          {facts.map((fact, index) => (
            <span key={index} className="inline-flex shrink-0 items-center">
              {index > 0 && <FactDivider />}
              {fact}
            </span>
          ))}
        </>
      )}

      <span className="flex-1" />

      {onChange && (
        <button
          type="button"
          onClick={onChange}
          className={cn(
            "inline-flex h-[22px] shrink-0 cursor-pointer items-center rounded-[var(--radius-button)] px-2 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:bg-white hover:text-[var(--blue-hover)]",
            "focus-visible:outline-none",
          )}
        >
          Change
        </button>
      )}
    </div>
  );
}
