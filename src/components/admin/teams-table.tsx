"use client";

import Link from "next/link";
import { GalleryHorizontalEnd } from "lucide-react";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PilotPill } from "@/components/admin/plan-pills";
import { ApproveChip } from "@/components/admin/approve-chip";
import {
  AdminAvatar,
  NewDot,
  NewLabel,
  RowChevron,
} from "@/components/admin/admin-cells";
import {
  TableEmptyBody,
  type TableEmptyAction,
} from "@/components/dashboard/shared/table-empty-body";
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
  freshIds,
  onOpenRow,
}: {
  rows: readonly AdminTeamRow[];
  /** Named cut for the empty state — see `TableEmptyBody`. */
  emptyTitle?: string;
  emptyAction?: TableEmptyAction;
  /** Called with the row after its `ApproveChip` is clicked. No-op if omitted. */
  onApprove?: (row: AdminTeamRow) => void;
  /** Rows New since this admin last looked — the 7px dot and "New". */
  freshIds?: ReadonlySet<string>;
  /** The row's link was followed (not the Approve chip). */
  onOpenRow?: (row: AdminTeamRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[960px] px-6 pt-0.5 pb-1.5">
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
          <span className={COL.chevron} aria-hidden="true" />
        </div>

        {rows.length === 0 ? (
          <TableEmptyBody
            icon={GalleryHorizontalEnd}
            title={emptyTitle}
            action={emptyAction}
          />
        ) : (
          rows.map((row) => (
            <TeamRow
              key={row.id}
              row={row}
              fresh={freshIds?.has(row.id) ?? false}
              onApprove={onApprove}
              onOpen={onOpenRow}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * "Oct 21" / "Oct 21, 2025" outside this year, in UTC so the server and the
 * browser print the same day. `claimed_at` is a moment; a day is all the line
 * needs, and a UTC day keeps hydration stable.
 */
function sinceLabel(at: string): string {
  const date = new Date(at);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/** Line 2 of the Team cell. */
function teamStatusLine(row: AdminTeamRow): string {
  if (row.status === "active") {
    return row.claimedAt
      ? `On Advantage since ${sinceLabel(row.claimedAt)}`
      : "On Advantage";
  }
  if (row.status === "claim_pending") return "Claim pending";
  if (row.status === "suspended") return "Suspended";
  return "In the directory, not on Advantage";
}

function TeamRow({
  row,
  fresh,
  onApprove,
  onOpen,
}: {
  row: AdminTeamRow;
  fresh: boolean;
  onApprove?: (row: AdminTeamRow) => void;
  onOpen?: (row: AdminTeamRow) => void;
}) {
  return (
    <Link
      href={`/admin/teams/${row.id}`}
      onClick={(event) => {
        // The Approve chip prevents default; that click opens nothing.
        if (!event.defaultPrevented) onOpen?.(row);
      }}
      className={cn(
        ROW,
        "group -mx-4 h-[52px] rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
      )}
    >
      {/* Team — 32px crest (New dot on its corner), name over status. */}
      <span className={cn(COL.team, "flex min-w-0 items-center gap-3")}>
        <span className="relative inline-flex shrink-0">
          <ProgramCrest name={row.name} crestUrl={row.crestUrl} size={32} />
          {fresh ? <NewDot /> : null}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[13px] leading-none font-medium text-[var(--ink-900)]">
              {row.name}
            </span>
            {fresh ? <NewLabel /> : null}
          </span>
          <span className="truncate text-[12px] leading-none text-[var(--ink-600)]">
            {teamStatusLine(row)}
          </span>
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
        {row.memberCount > 0 ? (
          row.memberCount
        ) : (
          <EmptyMark label="No members" />
        )}
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

      {/* Owner — avatar and name, the second fluid cell. */}
      <span className={cn(COL.owner, "flex min-w-0 items-center gap-2")}>
        {row.ownerName ? (
          <>
            <AdminAvatar
              name={row.ownerName}
              photoUrl={row.ownerPhotoUrl}
              size={26}
            />
            <span className="truncate text-[13px] text-[var(--ink-900)]">
              {row.ownerName}
            </span>
          </>
        ) : (
          <EmptyMark label="No owner" />
        )}
      </span>

      <span className={cn(COL.chevron, "flex items-center")}>
        <RowChevron />
      </span>
    </Link>
  );
}
