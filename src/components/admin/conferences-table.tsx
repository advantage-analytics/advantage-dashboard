"use client";

import Link from "next/link";
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
} from "@/components/admin/conferences-table-layout";

/**
 * The Admin › Conferences table.
 *
 * Built on `teams-table.tsx`'s shape: a conference is a **record row** (Data
 * Table law 3, `tables.md`), so clicking one is a full navigation to its page,
 * `/admin/conferences/[id]`, and every row carries a trailing chevron
 * (`RowChevron`). Each row is a `<Link>`, so Enter, ⌘-click and a middle click
 * all behave as links do; the hover wash is transient, with no selection to
 * hold.
 *
 * A client component for the same reason `TeamsTable` is: `next/link` and the
 * shared empty body. It imports `AdminConferenceRow` from the client-safe
 * `admin-conferences-view.ts` — the loader module is server-only and must not
 * reach this bundle.
 */
export function ConferencesTable({
  rows,
  emptyTitle = "No conferences match this view",
  emptyAction,
}: {
  rows: readonly AdminConferenceRow[];
  /** Named cut for the empty state — see `TableEmptyBody`. */
  emptyTitle?: string;
  emptyAction?: TableEmptyAction;
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
          rows.map((row) => <ConferenceRow key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}

function ConferenceRow({ row }: { row: AdminConferenceRow }) {
  const division = divisionLabel(row.division);
  const share =
    row.teams > 0 ? Math.round((row.onAdvantage / row.teams) * 100) : 0;

  return (
    <Link
      href={`/admin/conferences/${encodeURIComponent(row.id)}`}
      className={cn(
        ROW,
        "-mx-4 h-[52px] rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
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
    </Link>
  );
}
