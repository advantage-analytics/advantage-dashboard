"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";
import { NewEventMenu } from "@/components/dashboard/schedule/new-event-menu";
import { formatEventSpan, siteLabel } from "@/lib/schedule/format";
import type { ScheduleRow } from "@/lib/schedule/types";

type Filter = "all" | "dual" | "tournament";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dual", label: "Duals" },
  { id: "tournament", label: "Tournaments" },
];

/**
 * 25a's list.
 *
 * The state column is computed on every render and stored nowhere. A dual's
 * team score in particular has to be derived — a stored one stops agreeing with
 * the lines above it the first time somebody corrects a result, and the number
 * on the schedule would be the stale one.
 */
export function ScheduleList({
  rows,
  canCreate,
}: {
  rows: ScheduleRow[];
  canCreate: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.kind === filter)),
    [rows, filter]
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4">
        <h1
          className="text-[30px] font-light leading-[34px] tracking-[-0.6px]"
          style={{ color: "var(--ink-900)" }}
        >
          Schedule
        </h1>
        <div className="flex-1" />
        {canCreate ? <NewEventMenu /> : null}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={cn(
              "cursor-pointer rounded-full px-[13px] py-[5px] text-[11px] transition-colors duration-[var(--duration-hover)]",
              filter === entry.id
                ? "bg-[var(--blue-soft)] font-medium text-[var(--blue)]"
                : "border border-[var(--border-hairline)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptySchedule filtered={filter !== "all" && rows.length > 0} />
      ) : (
        <div className="mt-2.5 flex flex-col">
          {shown.map((row, index) => (
            <ScheduleRowLine
              key={row.id}
              row={row}
              last={index === shown.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRowLine({ row, last }: { row: ScheduleRow; last: boolean }) {
  return (
    <Link
      href={`/dashboard/team/schedule/${row.id}`}
      className={cn(
        "grid grid-cols-[92px_1fr_152px_100px] items-baseline gap-4 py-3.5 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
        !last && "border-b border-[var(--border-hairline)]"
      )}
    >
      <span className="mono text-[11px]" style={{ color: "var(--ink-600)" }}>
        {formatEventSpan(row.startsOn, row.endsOn)}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[13px] text-[var(--ink-900)]">
          {row.kind === "dual" ? `vs ${row.name}` : row.name}
        </span>
        <span
          className="text-micro mt-[3px] block"
          style={{ color: "var(--ink-600)" }}
        >
          {row.kind === "dual" ? "Dual" : "Tournament"} · {siteLabel(row.site)}
        </span>
      </span>

      <StateCell row={row} />

      <span className="text-right">
        {row.teamScore ? (
          <span
            className="tabular text-[15px]"
            style={{ color: "var(--ink-900)" }}
          >
            {row.teamScore.us}–{row.teamScore.them}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function StateCell({ row }: { row: ScheduleRow }) {
  if (row.workingCount > 0) {
    return (
      <StatusChip tone="blue" live>
        <span className="tabular">{row.workingCount}</span>&nbsp;analyzing
      </StatusChip>
    );
  }

  if (row.playedCount === 0) {
    // A tournament with no results has nothing to show yet and everything to
    // add, so its cell is the invitation. A dual already has its nine names.
    return row.kind === "tournament" ? (
      <span className="text-[11px] font-medium text-[var(--blue-text)]">
        Add entries
      </span>
    ) : (
      <span className="text-micro" style={{ color: "var(--ink-600)" }}>
        lineup set
      </span>
    );
  }

  if (row.playedCount < row.entryCount) {
    return (
      <span className="text-micro" style={{ color: "var(--ink-600)" }}>
        <span className="tabular">{row.playedCount}</span> of{" "}
        <span className="tabular">{row.entryCount}</span> in
      </span>
    );
  }

  return (
    <span className="text-micro" style={{ color: "var(--ink-600)" }}>
      final
    </span>
  );
}

function EmptySchedule({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-8 flex flex-col gap-1.5">
      <p
        className="text-[24px] font-light leading-[1.2] tracking-[-0.4px]"
        style={{ color: "var(--ink-900)" }}
      >
        {filtered ? "Nothing of that kind yet" : "Nothing scheduled yet"}
      </p>
      <p
        className="max-w-[56ch] text-[13px] leading-[1.6]"
        style={{ color: "var(--ink-700)" }}
      >
        {filtered
          ? "Clear the filter to see the rest of the schedule."
          : "Start with the next dual. Naming the lineup creates a line for every court, and video goes against those lines later."}
      </p>
    </div>
  );
}
