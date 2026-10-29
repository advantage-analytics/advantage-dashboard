"use client";

import { Network } from "lucide-react";
import { ConferenceMark } from "@/components/admin/conference-mark";
import { RowChevron } from "@/components/admin/admin-cells";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  TableEmptyBody,
  type TableEmptyAction,
} from "@/components/dashboard/shared/table-empty-body";
// `programs-server.ts` is client-safe despite its name — a type import and a
// pure name helper, nothing more — and client components already import
// `divisionLabel` from it (`schedule/static/new-dual-flow.tsx`).
import { divisionLabel } from "@/lib/data/programs-server";
import { cn } from "@/lib/utils";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";
import {
  COL,
  CONFERENCES_COLUMNS,
  ROW,
  conferenceRowId,
} from "@/components/admin/conferences-table-layout";

/**
 * The Admin › Conferences table.
 *
 * Built on `requests-table.tsx`'s shape: a conference opens a peek drawer
 * rather than a report of its own, so the row is a `role="button"` with no
 * `<Link>`; click or Enter/Space calls `onSelect`, and the wash persists on
 * the open row. Conferences2 draws a trailing chevron on every row, so it
 * carries one (`RowChevron`) — the redesign's board over the older
 * container-row rule.
 *
 * `onSelect` defaults to a no-op and `selectedId` to nothing selected, so the
 * table renders correctly before the drawer is wired to it.
 *
 * A client component: the row's `onClick`/`onKeyDown` need real handlers. It
 * imports `AdminConferenceRow` from the client-safe `admin-conferences-view.ts`
 * — the loader module is server-only and must not reach this bundle.
 */
export function ConferencesTable({
  rows,
  emptyTitle = "No conferences match this view",
  emptyAction,
  selectedId = null,
  onSelect,
}: {
  rows: readonly AdminConferenceRow[];
  /** Named cut for the empty state — see `TableEmptyBody`. */
  emptyTitle?: string;
  emptyAction?: TableEmptyAction;
  /** The row currently open in the peek drawer, if any. */
  selectedId?: string | null;
  /** Called with the row after it's clicked or activated by keyboard. No-op if omitted. */
  onSelect?: (row: AdminConferenceRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[760px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            ROW,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          {CONFERENCES_COLUMNS.map((column) => (
            <span
              key={column.label || "chevron"}
              aria-hidden={column.label ? undefined : true}
              className={cn(column.col, "eyebrow-sm")}
            >
              {column.label}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <TableEmptyBody
            icon={Network}
            title={emptyTitle}
            action={emptyAction}
          />
        ) : (
          rows.map((row) => (
            <ConferenceRow
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConferenceRow({
  row,
  selected,
  onSelect,
}: {
  row: AdminConferenceRow;
  selected: boolean;
  onSelect?: (row: AdminConferenceRow) => void;
}) {
  const division = divisionLabel(row.division);
  const share =
    row.teams > 0 ? Math.round((row.onAdvantage / row.teams) * 100) : 0;

  return (
    <div
      id={conferenceRowId(row.id)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect?.(row)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(row);
        }
      }}
      className={cn(
        ROW,
        "-mx-4 h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        // The peek drawer's selection wash persists on the open row — see
        // tables.md rule 3 ("the wash persists on the selected row").
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      {/* Conference — 32px mark, then name over website. */}
      <span className={cn(COL.conference, "flex min-w-0 items-center gap-3")}>
        <ConferenceMark
          name={row.name}
          shortName={row.shortName}
          crestUrl={row.crestUrl}
          size={32}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[13px] leading-none font-medium text-[var(--ink-900)]">
            {row.name}
          </span>
          <span
            className={cn(
              "truncate text-[12px] leading-none",
              row.website ? "text-[var(--ink-600)]" : "text-[var(--ink-500)]",
            )}
          >
            {row.website ?? "No website yet"}
          </span>
        </span>
      </span>

      {/* Division — "D-I", or the shared not-yet mark. */}
      <span
        className={cn(
          COL.division,
          "truncate text-[12px] text-[var(--ink-700)]",
        )}
      >
        {division ?? <EmptyMark label="No division set" />}
      </span>

      <span
        className={cn(
          COL.teams,
          "text-[13px] text-[var(--ink-900)] tabular-nums",
        )}
      >
        {row.teams}
      </span>

      {/* On Advantage — "5 of 18" over a 3px bar. */}
      <span className={cn(COL.onAdvantage, "flex flex-col gap-1.5")}>
        <span
          className={cn(
            "truncate text-[12px] leading-none tabular-nums",
            row.onAdvantage > 0
              ? "text-[var(--ink-700)]"
              : "text-[var(--ink-500)]",
          )}
        >
          {row.onAdvantage > 0
            ? `${row.onAdvantage} of ${row.teams}`
            : "None yet"}
        </span>
        <span
          aria-hidden="true"
          className="block h-[3px] overflow-hidden rounded-full bg-[var(--ink-100)]"
        >
          <span
            className="block h-full bg-[var(--viz-you-mid)]"
            style={{ width: `${share}%` }}
          />
        </span>
      </span>

      <span className={cn(COL.pilot, "text-[13px] tabular-nums")}>
        {row.pilot > 0 ? (
          <span className="text-[var(--ink-900)]">{row.pilot}</span>
        ) : (
          <EmptyMark label="No pilots" />
        )}
      </span>

      <span className={cn(COL.chevron, "flex items-center")}>
        <RowChevron />
      </span>
    </div>
  );
}
