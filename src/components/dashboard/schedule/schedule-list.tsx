"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { EventDetailPane } from "@/components/dashboard/schedule/event-detail-pane";
import { formatEventSpan, siteLabel } from "@/lib/schedule/format";
import type { ScheduleRow, EventDetail } from "@/lib/schedule/types";
import type { ResultsScope } from "@/lib/data/results-visibility";

/**
 * 4c's master-detail schedule.
 *
 * The left pane is a grouped event list (Upcoming / Completed); clicking a row
 * selects it and the right pane renders T2's `EventDetailPane` for that event.
 * Selection is client-side only — no fetch — so the page can be served with a
 * single read.
 *
 * ── a11y note ────────────────────────────────────────────────────────────────
 * The filter pills that lived here carried deliberate accessibility work:
 * `role="group"` with `aria-pressed` on each toggle, and invisible 44px touch
 * targets. The pills are removed, but their intent — that the user's position
 * in a list is conveyed to assistive tech — carries forward: the list uses
 * `role="listbox"` with `aria-selected` on each row, so a screen reader
 * announces which event is active rather than reading identical links.
 */
export function ScheduleList({
  rows,
  details,
  scope,
  eyebrow,
  canCreate,
}: {
  rows: ScheduleRow[];
  details: Record<string, EventDetail>;
  scope: ResultsScope;
  eyebrow: string;
  canCreate: boolean;
}) {
  const today = useMemo(() => {
    const d = new Date();
    // Match the same local-date convention as `format.ts`'s `localDate`.
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const upcoming = useMemo(
    () => rows.filter((row) => row.startsOn >= today).reverse(),
    [rows, today]
  );
  const completed = useMemo(
    () => rows.filter((row) => row.startsOn < today),
    [rows, today]
  );

  const upcomingCount = upcoming.length;
  const totalCount = rows.length;

  // Default selection: most recent completed event, else the next upcoming one.
  const defaultId = useMemo(() => {
    if (completed.length > 0) return completed[0].id;
    if (upcoming.length > 0) return upcoming[0].id;
    return null;
  }, [completed, upcoming]);

  const [selectedId, setSelectedId] = useState<string | null>(defaultId);

  const selectedDetail = selectedId ? details[selectedId] ?? null : null;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col">
        <Header
          eyebrow={eyebrow}
          totalCount={totalCount}
          upcomingCount={upcomingCount}
          canCreate={canCreate}
        />
        <EmptySchedule />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Left pane — event list */}
      <div className="flex w-full shrink-0 flex-col lg:w-[340px]">
        <Header
          eyebrow={eyebrow}
          totalCount={totalCount}
          upcomingCount={upcomingCount}
          canCreate={canCreate}
        />

        <div
          role="listbox"
          aria-label="Schedule events"
          className="mt-4 flex flex-col"
        >
          {upcoming.length > 0 && (
            <EventGroup
              label="Upcoming"
              rows={upcoming}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {completed.length > 0 && (
            <EventGroup
              label="Completed"
              rows={completed}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      {/* Right pane — event detail */}
      {selectedDetail && (
        <div className="min-w-0 flex-1 pt-1 lg:pt-0">
          <div className="rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-5 lg:sticky lg:top-6">
            <EventDetailPane detail={selectedDetail} scope={scope} />
          </div>
        </div>
      )}
    </div>
  );
}

function Header({
  eyebrow,
  totalCount,
  upcomingCount,
  canCreate,
}: {
  eyebrow: string;
  totalCount: number;
  upcomingCount: number;
  canCreate: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="eyebrow-sm">{eyebrow}</span>
          <h1
            className="mt-1"
            style={{
              fontWeight: 300,
              fontSize: "26px",
              lineHeight: 1,
              letterSpacing: "-0.5px",
              color: "var(--ink-900)",
            }}
          >
            Schedule
          </h1>
          <p className="text-body-sm tabular mt-1.5">
            <span className="tabular">{totalCount}</span>{" "}
            {totalCount === 1 ? "event" : "events"} ·{" "}
            <span className="tabular">{upcomingCount}</span> upcoming
          </p>
        </div>
        {canCreate && (
          <Link
            href="/dashboard/team/schedule/new"
            className={advButton("primary", "sm")}
          >
            New event
          </Link>
        )}
      </div>
    </div>
  );
}

function EventGroup({
  label,
  rows,
  selectedId,
  onSelect,
}: {
  label: string;
  rows: ScheduleRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <span className="eyebrow-sm mt-2 block pb-1.5">{label}</span>
      {rows.map((row) => (
        <ScheduleRowLine
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          onSelect={() => onSelect(row.id)}
        />
      ))}
    </div>
  );
}

function ScheduleRowLine({
  row,
  selected,
  onSelect,
}: {
  row: ScheduleRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex cursor-pointer items-baseline justify-between gap-3 rounded-[var(--radius-element)] px-2.5 py-2.5 transition-colors duration-[var(--duration-hover)]",
        "outline-none focus-visible:shadow-[var(--focus-ring)]",
        selected
          ? "bg-[var(--blue-soft)]"
          : "hover:bg-[var(--surface-subtle)]"
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-[var(--ink-900)]">
          {row.kind === "dual" ? `vs ${row.name}` : row.name}
        </span>
        <span
          className="mono mt-0.5 block text-[11px]"
          style={{ color: "var(--ink-600)" }}
        >
          {formatEventSpan(row.startsOn, row.endsOn)} · {siteLabel(row.site)}
        </span>
      </div>

      {row.teamScore && (
        <span
          className="tabular shrink-0 text-[13px]"
          style={{ color: "var(--ink-900)" }}
        >
          {row.teamScore.us}–{row.teamScore.them}
        </span>
      )}
    </div>
  );
}

function EmptySchedule() {
  return (
    <div className="mt-8 flex flex-col gap-1.5">
      <p
        className="text-[24px] font-light leading-[1.2] tracking-[-0.4px]"
        style={{ color: "var(--ink-900)" }}
      >
        Nothing scheduled yet
      </p>
      <p
        className="max-w-[56ch] text-[13px] leading-[1.6]"
        style={{ color: "var(--ink-700)" }}
      >
        Start with the next dual. Naming the lineup creates a line for every
        court, and video goes against those lines later.
      </p>
    </div>
  );
}
