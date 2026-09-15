"use client";

import { CheckCircle2, Inbox, Mail, MailOpen } from "lucide-react";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  TableEmptyBody,
  type TableEmptyAction,
} from "@/components/dashboard/shared/table-empty-body";
import { shortDate } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import type {
  AdminRequestEmailCheck,
  AdminRequestRow,
} from "@/lib/data/admin-requests-server";
import {
  COL,
  REQUESTS_COLUMNS,
  ROW,
} from "@/components/admin/requests-table-layout";

/**
 * The Admin › Requests table — the merged claim/request feed, T14.
 *
 * Follows the same Data Table laws as `teams-table.tsx`, but this table's
 * rows are **container rows** (Data Table law 3), not record rows: there is
 * no `/admin/requests/[id]` report to navigate to — a request or claim opens
 * a peek drawer (T15) with the selection wash persisting on the open row.
 * That means no `<Link>` and no trailing chevron, unlike `TeamsTable`. The
 * click affordance instead lives on a `role="button"` row: click or
 * Enter/Space call `onSelect`, mirroring `team/roster-table.tsx`'s
 * `MemberRow` (the other container-row table in the product) rather than
 * inventing a new interaction for the same noun.
 *
 * `onSelect` and `selectedId` exist for T15 to wire up — the drawer and its
 * selection state machine are not this task's file. Until T15 lands,
 * `onSelect` defaults to a no-op and `selectedId` to nothing selected, so
 * this table renders correctly (rows highlight on hover/focus only) before
 * that lands, the same forward-compatible shape `TeamsTable.onApprove` used
 * for T12.
 *
 * A client component: the row's `onClick`/`onKeyDown` need real event
 * handlers, which a Server Component page cannot pass across the boundary.
 */
export function RequestsTable({
  rows,
  emptyTitle = "No requests match this view",
  emptyAction,
  selectedId = null,
  onSelect,
}: {
  rows: readonly AdminRequestRow[];
  /** Named cut for the empty state — see `TableEmptyBody`. */
  emptyTitle?: string;
  emptyAction?: TableEmptyAction;
  /** The row currently open in the peek drawer, if any (T15). */
  selectedId?: string | null;
  /** Called with the row after it's clicked or activated by keyboard. No-op if omitted. */
  onSelect?: (row: AdminRequestRow) => void;
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
          {REQUESTS_COLUMNS.map((column) => (
            <span key={column.label} className={cn(column.col, "eyebrow-sm")}>
              {column.label}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <TableEmptyBody
            icon={Inbox}
            title={emptyTitle}
            action={emptyAction}
          />
        ) : (
          rows.map((row) => (
            <RequestRow
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

function RequestRow({
  row,
  selected,
  onSelect,
}: {
  row: AdminRequestRow;
  selected: boolean;
  onSelect?: (row: AdminRequestRow) => void;
}) {
  return (
    <div
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
      {/* Date — leads the row (Data Table law 1: newest-first lists lead
          with the date). */}
      <span
        className={cn(COL.date, "tabular text-[12px] text-[var(--ink-700)]")}
      >
        {shortDate(row.date)}
      </span>

      {/* Team — crest + name. */}
      <span className={cn(COL.team, "flex min-w-0 items-center gap-2.5")}>
        <ProgramCrest name={row.team} crestUrl={row.crestUrl} size={26} />
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {row.team}
        </span>
      </span>

      {/* For — the role/kind label. */}
      <span
        className={cn(COL.for, "truncate text-[12px] text-[var(--ink-700)]")}
      >
        {row.for}
      </span>

      {/* From — the fluid cell. Name leads at 13/500, email trails at 12px
          ink-600; both truncate rather than wrap, since the row is fixed at
          52px. */}
      <span className={cn(COL.from, "flex min-w-0 flex-col justify-center")}>
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {row.from.name}
        </span>
        <span className="truncate text-[12px] text-[var(--ink-600)]">
          {row.from.email}
        </span>
      </span>

      {/* Email check. */}
      <span className={cn(COL.emailCheck, "flex items-center")}>
        <EmailCheckMark value={row.emailCheck} />
      </span>
    </div>
  );
}

/**
 * The Email check cell — a signal about the *email*, not an outcome on the
 * request, so it never reaches for the green fill an approved/verified state
 * would otherwise suggest.
 *
 * `verified` is the one state that means "an admin can act now" — a claim
 * whose verification link has actually been clicked — so it earns the same
 * filled-chip treatment `ApproveChip` uses (warm/amber warning register, not
 * green: see `plan-pills.tsx`). `sent` and `opened` are still in flight and
 * read as plain grey text with a mail glyph. Everything else — a bare
 * `contact`/`domain` pre-check match, or `none` — has no verification signal
 * to report at all, so it falls to the table's one shared not-yet mark
 * (`EmptyMark`, Data Table law 1) rather than inventing a fourth voice.
 */
function EmailCheckMark({ value }: { value: AdminRequestEmailCheck }) {
  if (value === "verified") {
    return (
      <span
        className="inline-flex h-[22px] items-center gap-1 rounded-[var(--radius-pill)] px-[9px] text-[12px] font-medium whitespace-nowrap"
        style={{
          background: "var(--warning-bg)",
          color: "var(--warning-text)",
          boxShadow: "inset 0 0 0 1px var(--warning-border)",
        }}
      >
        <CheckCircle2
          className="size-[13px]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Verified · Approve
      </span>
    );
  }

  if (value === "opened") {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-[var(--ink-600)]">
        <MailOpen
          className="size-[13px]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        Opened · not verified
      </span>
    );
  }

  if (value === "sent") {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-[var(--ink-600)]">
        <Mail className="size-[13px]" strokeWidth={1.5} aria-hidden="true" />
        Sent · not opened
      </span>
    );
  }

  return <EmptyMark label="No verification email sent" />;
}
