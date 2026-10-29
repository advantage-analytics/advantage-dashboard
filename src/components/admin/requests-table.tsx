"use client";

import { Inbox } from "lucide-react";
import {
  AdminPersonCell,
  TwoLineDate,
  WorkspaceMark,
} from "@/components/admin/admin-cells";
import {
  TableEmptyBody,
  type TableEmptyAction,
} from "@/components/dashboard/shared/table-empty-body";
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
 * That means no `<Link>` and no trailing chevron, unlike `TeamsTable` (the
 * Requests2 board draws one; the table law that a chevron means "this row
 * navigates" outranks it, since the row opens a drawer here). The
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
/**
 * The DOM id of one row — not in T14's original shape, added for T15.
 *
 * The drawer's selection machine has to return focus to the row it closed
 * from and scroll the next one into view as `↑`/`↓` walk the list, and both
 * are `document.getElementById`. Mirrors `rosterRowId` in
 * `team/roster-table.tsx`, which exists for exactly the same two jobs.
 */
export function requestRowId(id: string): string {
  return `admin-request-${id}`;
}

export function RequestsTable({
  rows,
  emptyTitle = "No requests match this view",
  emptyAction,
  selectedId = null,
  freshIds,
  onSelect,
}: {
  rows: readonly AdminRequestRow[];
  /** Named cut for the empty state — see `TableEmptyBody`. */
  emptyTitle?: string;
  emptyAction?: TableEmptyAction;
  /** The row currently open in the peek drawer, if any (T15). */
  selectedId?: string | null;
  /** Rows to mark New since the admin last looked (`lookAtSurface`). */
  freshIds?: ReadonlySet<string>;
  /** Called with the row after it's clicked or activated by keyboard. No-op if omitted. */
  onSelect?: (row: AdminRequestRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[640px] px-6 pt-0.5 pb-1.5">
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
              fresh={freshIds?.has(row.id) ?? false}
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
  fresh,
  onSelect,
}: {
  row: AdminRequestRow;
  selected: boolean;
  fresh: boolean;
  onSelect?: (row: AdminRequestRow) => void;
}) {
  return (
    <div
      id={requestRowId(row.id)}
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
        "-mx-4 h-[64px] cursor-pointer rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        // The peek drawer's selection wash persists on the open row — see
        // tables.md rule 3 ("the wash persists on the selected row").
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      {/* Request — who asked, in what role, and the program under them. */}
      <span className={cn(COL.request, "flex min-w-0")}>
        <AdminPersonCell
          name={row.from.name}
          rest={requestRole(row)}
          sub={<RequestSubject row={row} />}
          fresh={fresh}
        />
      </span>

      <span className={cn(COL.emailCheck, "flex min-w-0 items-center")}>
        <EmailCheckText row={row} />
      </span>

      <span className={cn(COL.received, "flex min-w-0 items-center")}>
        <TwoLineDate at={row.date} fresh={fresh} />
      </span>
    </div>
  );
}

/** "head coach", "assistant coach", "match issue" — after the name, in ink-600. */
export function requestRole(row: AdminRequestRow): string {
  const label =
    row.detail.source === "request"
      ? (row.detail.roleLabel ?? row.for)
      : row.for;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Line 2: the program's 16px crest and name, "· new program" when nothing in
 * the directory matches it, or — for a match report on a personal match —
 * the personal mark and the match.
 */
export function RequestSubject({ row }: { row: AdminRequestRow }) {
  const detail = row.detail;
  const inDirectory =
    detail.source === "claim" ? true : detail.programId !== null;
  const personalMatch =
    detail.source === "request" && detail.match !== null && !inDirectory;
  return (
    <>
      {inDirectory ? (
        <WorkspaceMark
          workspace={{ kind: "team", name: row.team, crestUrl: row.crestUrl }}
        />
      ) : personalMatch ? (
        <WorkspaceMark workspace={{ kind: "personal" }} />
      ) : null}
      <span className="truncate text-[var(--ink-700)]">{row.team}</span>
      {!inDirectory && !personalMatch ? (
        <span className="shrink-0">· new program</span>
      ) : null}
    </>
  );
}

/**
 * The Email check cell: what the claim's verification and pre-checks say
 * about the address, as one word or two. Verification (sent → opened →
 * verified) wins over the pre-checks, as `claimEmailCheck` orders them. A
 * claim with no signal at all is the one warm state — nobody has vouched for
 * an address off the school's domain. A request carries no email check, so
 * it reads as the unmeasured dash rather than a judgement.
 */
function EmailCheckText({ row }: { row: AdminRequestRow }) {
  if (row.source === "request") {
    return (
      <span
        aria-label="No email check"
        className="text-[12px] text-[var(--ink-400)]"
      >
        —
      </span>
    );
  }
  const words: Record<AdminRequestEmailCheck, string> = {
    verified: "Verified",
    opened: "Link opened",
    sent: "Link sent",
    contact: "Staff contact",
    domain: "School domain",
    none: "Not school domain",
  };
  const warn = row.emailCheck === "none";
  return (
    <span
      className={cn(
        "truncate text-[12px] whitespace-nowrap",
        warn
          ? "font-medium text-[var(--warning-text)]"
          : "text-[var(--ink-600)]",
      )}
    >
      {words[row.emailCheck]}
    </span>
  );
}
