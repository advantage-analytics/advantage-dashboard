"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { GalleryHorizontalEnd } from "lucide-react";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PilotPill, ApproveChip } from "@/components/admin/plan-pills";
import {
  TableEmptyBody,
  type TableEmptyAction,
} from "@/components/dashboard/shared/table-empty-body";
import { teamLabel } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";
import type { AdminTeamRow } from "@/lib/data/admin-teams-server";
import { COL, ROW, TEAMS_COLUMNS } from "@/components/admin/teams-table-layout";

/**
 * The Admin › Teams directory table — every program on one page, T11.
 *
 * Follows the same Data Table laws as `team/roster-table.tsx`: 52px fixed
 * rows, a hairline under the header only, and no rule between rows — a
 * `surface-muted` wash on hover is the boundary instead. Unlike the roster,
 * this table's rows are **record rows** (Data Table law 3): clicking one is a
 * full navigation to `/admin/teams/[id]`, not a peek, so every row carries a
 * trailing chevron and none of the drawer machinery the roster needs.
 *
 * `ApproveChip`, when a row's plan is `'approve'`, is a real `<button>`
 * nested inside the row's `Link` — the one place this table needs a click
 * that does NOT navigate. Its `onClick` calls `preventDefault()` (blocking
 * the anchor's own navigation) and `stopPropagation()` (blocking the bubble
 * to the anchor's handler) before calling the optional `onApprove`, so a
 * click on the chip never fires the row's own navigation. The handler itself
 * is not this component's job: T12 wires the actual approve popover, and
 * `onApprove` defaults to doing nothing so this table renders correctly
 * before that lands.
 *
 * A client component: `ApproveChip`'s `onClick` needs a real event handler,
 * which a Server Component page (T12) cannot pass across the boundary.
 */
export function TeamsTable({
  rows,
  emptyTitle = "No teams match this view",
  emptyAction,
  onApprove,
}: {
  rows: readonly AdminTeamRow[];
  /** Named cut for the empty state — see `TableEmptyBody`. */
  emptyTitle?: string;
  emptyAction?: TableEmptyAction;
  /** Called with the row after its `ApproveChip` is clicked. No-op if omitted. */
  onApprove?: (row: AdminTeamRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[820px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            ROW,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          {TEAMS_COLUMNS.map((column) => (
            <span
              key={column.label}
              className={cn(
                column.col,
                "eyebrow-sm",
                column.align === "right" && "text-right",
              )}
            >
              {column.label}
            </span>
          ))}
          {/* The chevron's column. No label — it names nothing, it is the
              row's own affordance (Data Table law 3). */}
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>

        {rows.length === 0 ? (
          <TableEmptyBody
            icon={GalleryHorizontalEnd}
            title={emptyTitle}
            action={emptyAction}
          />
        ) : (
          rows.map((row) => (
            <TeamRow key={row.id} row={row} onApprove={onApprove} />
          ))
        )}
      </div>
    </div>
  );
}

function TeamRow({
  row,
  onApprove,
}: {
  row: AdminTeamRow;
  onApprove?: (row: AdminTeamRow) => void;
}) {
  const squad = teamLabel(row.team);

  return (
    <Link
      href={`/admin/teams/${row.id}`}
      className={cn(
        ROW,
        "group -mx-4 h-[52px] rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
      )}
    >
      {/* Team — crest, name, squad. */}
      <span className={cn(COL.team, "flex min-w-0 items-center gap-2.5")}>
        <ProgramCrest name={row.name} crestUrl={row.crestUrl} size={26} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
            {row.name}
          </span>
          {squad ? (
            <span className="text-micro truncate text-[var(--ink-500)]">
              {squad}
            </span>
          ) : null}
        </span>
      </span>

      {/* Division */}
      <span
        className={cn(
          COL.division,
          "truncate text-[12px] text-[var(--ink-700)]",
        )}
      >
        {row.division ?? <EmptyMark label="No division set" />}
      </span>

      {/* Conference */}
      <span
        className={cn(
          COL.conference,
          "truncate text-[12px] text-[var(--ink-700)]",
        )}
      >
        {row.conference ?? <EmptyMark label="No conference set" />}
      </span>

      {/* State */}
      <span className={cn(COL.state, "text-[12px] text-[var(--ink-700)]")}>
        {row.state ?? <EmptyMark label="No state set" />}
      </span>

      {/* Members — the one measure compared down its column, flush right. */}
      <span
        className={cn(
          COL.members,
          "tabular text-right text-[13px] text-[var(--ink-900)]",
        )}
      >
        {row.memberCount}
      </span>

      {/* Plan — fixed-width cell so Owner starts at the same x on every row. */}
      <span className={cn(COL.plan, "flex items-center")}>
        {row.plan === "pilot" ? (
          <PilotPill />
        ) : row.plan === "approve" ? (
          // The one control in this row that must NOT navigate. A wrapping
          // `<span onClick={stopPropagation}>` does not work here: React
          // dispatches the click button → span → outer anchor, so
          // `stopPropagation()` on the span only halts further bubbling —
          // it runs *after* the anchor's own `onClick` (where `next/link`
          // calls `preventDefault()`) would have needed to run. Without that
          // `preventDefault()`, the browser still performs the anchor's
          // default navigation. So the guard has to live in `ApproveChip`'s
          // own `onClick`, called directly on its `<button>`.
          <ApproveChip
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onApprove?.(row);
            }}
          />
        ) : (
          <EmptyMark label="No plan yet" />
        )}
      </span>

      {/* Owner — the fluid cell. */}
      <span
        className={cn(COL.owner, "truncate text-[12px] text-[var(--ink-600)]")}
      >
        {row.ownerName ?? <EmptyMark label="No owner" />}
      </span>

      <ChevronRight
        className="size-[13px] shrink-0 text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-900)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </Link>
  );
}
