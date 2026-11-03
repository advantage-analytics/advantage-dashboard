"use client";

import { MessagesSquare } from "lucide-react";
import { AdminPersonCell, AgeText } from "@/components/admin/admin-cells";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type { AdminSupportThreadRow } from "@/lib/data/support-admin-server";
import { originLabel } from "@/lib/data/support-view";
import { cn } from "@/lib/utils";

/**
 * The Admin › Messages table (Player Messaging canvas, artboard 5): one row
 * per player's thread, a container row (Data Table law 3) that peeks in the
 * thread drawer — no link, no chevron; click or Enter/Space select, and the
 * selected row keeps its wash.
 *
 * Player (avatar and name over whose move it is) · Started from (the origin's
 * words) · Last (how long ago, over who wrote it: "You" or the player's first
 * name).
 */
const COL = {
  player: "min-w-[260px] flex-[1.6_1_0]",
  origin: "w-[170px] shrink-0",
  last: "w-[110px] shrink-0",
} as const;

const ROW = "flex items-center gap-4";

const COLUMNS: readonly { label: string; col: string }[] = [
  { label: "Player", col: COL.player },
  { label: "Started from", col: COL.origin },
  { label: "Last", col: COL.last },
];

/** The row's DOM id — what ↑/↓ stepping scrolls to and Esc returns focus to. */
export function messagesRowId(threadId: string): string {
  return `admin-messages-${threadId}`;
}

/** "Chang Duan" → "Chang". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function MessagesTable({
  rows,
  emptyTitle,
  selectedId,
  onSelect,
}: {
  rows: readonly AdminSupportThreadRow[];
  /** The cut, named — "Nothing waiting on you". */
  emptyTitle: string;
  selectedId: string | null;
  onSelect: (row: AdminSupportThreadRow, viaKeyboard: boolean) => void;
}) {
  return (
    <div className={CARD}>
      <div className="min-w-[620px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            ROW,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          {COLUMNS.map((column) => (
            <span key={column.label} className={cn(column.col, "eyebrow-sm")}>
              {column.label}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <TableEmptyBody icon={MessagesSquare} title={emptyTitle} />
        ) : (
          rows.map((row) => (
            <MessagesRow
              key={row.threadId}
              row={row}
              selected={row.threadId === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

const CARD =
  "overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";

function MessagesRow({
  row,
  selected,
  onSelect,
}: {
  row: AdminSupportThreadRow;
  selected: boolean;
  onSelect: (row: AdminSupportThreadRow, viaKeyboard: boolean) => void;
}) {
  const waitingOnYou = row.waitingOn === "you";
  const lastWho =
    row.lastAuthorRole === "staff"
      ? "You"
      : row.lastAuthorRole === "player"
        ? firstName(row.playerName)
        : "No messages yet";
  return (
    <div
      id={messagesRowId(row.threadId)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(event) => onSelect(row, event.detail === 0)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row, true);
        }
      }}
      className={cn(
        ROW,
        "-mx-4 h-16 cursor-pointer rounded-[var(--radius-cell)] px-4 transition-[background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      <span className={cn(COL.player, "min-w-0")}>
        <AdminPersonCell
          name={row.playerName}
          photoUrl={row.avatarUrl}
          sub={
            <span
              className={cn(
                "truncate",
                waitingOnYou
                  ? "text-[var(--ink-900)]"
                  : "text-[var(--ink-600)]",
              )}
            >
              {waitingOnYou ? "Waiting on you" : "Waiting on them"}
            </span>
          }
        />
      </span>
      <span
        className={cn(COL.origin, "truncate text-[12px] text-[var(--ink-700)]")}
      >
        {originLabel(row.origin)}
      </span>
      <span className={cn(COL.last, "flex min-w-0 flex-col gap-1")}>
        <AgeText
          at={row.lastAt}
          className={cn(
            "truncate text-[13px] whitespace-nowrap tabular-nums",
            waitingOnYou
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-700)]",
          )}
        />
        <span className="truncate text-[12px] whitespace-nowrap text-[var(--ink-600)]">
          {lastWho}
        </span>
      </span>
    </div>
  );
}
