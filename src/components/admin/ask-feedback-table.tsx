"use client";

import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { AdminAskFeedbackRow } from "@/lib/data/ask-admin-view";
import { shortDate } from "@/lib/data/match-utils";
import { ASK_FEEDBACK_REASON_LABELS } from "@/lib/services/ask/feedback";
import { cn } from "@/lib/utils";

/**
 * The Admin › Ask table: one row per thumb, a container row (Data Table law
 * 3) that peeks in the drawer beside it — there is no page for one thumb to
 * travel to — so no link and no chevron; click or Enter/Space select, and
 * the selected row keeps its wash.
 *
 * Date · Verdict · Question (the fluid cell) · Asker · Scope · Reasons.
 * The verdict is the thumb's own glyph with its word for a screen reader,
 * never a word drawn in the cell and never a tint behind it; a thumbs up has
 * no reasons, which is the one `EmptyMark`.
 */
const COL = {
  date: "w-[72px] shrink-0",
  verdict: "w-[56px] shrink-0",
  question: "min-w-0 flex-1",
  asker: "w-[150px] shrink-0",
  scope: "w-[140px] shrink-0",
  reasons: "w-[200px] shrink-0",
} as const;

const ROW = "flex items-center gap-4";

const COLUMNS: readonly { label: string; col: string }[] = [
  { label: "Date", col: COL.date },
  { label: "Verdict", col: COL.verdict },
  { label: "Question", col: COL.question },
  { label: "Asker", col: COL.asker },
  { label: "Scope", col: COL.scope },
  { label: "Reasons", col: COL.reasons },
];

/** The row's DOM id — what ↑/↓ stepping scrolls to and Esc returns focus to. */
export function askFeedbackRowId(id: string): string {
  return `admin-ask-feedback-${id}`;
}

export function AskFeedbackTable({
  rows,
  emptyTitle,
  selectedId,
  onSelect,
}: {
  rows: readonly AdminAskFeedbackRow[];
  /** The cut, named — "No thumbs down yet". */
  emptyTitle: string;
  selectedId: string | null;
  onSelect: (row: AdminAskFeedbackRow, viaKeyboard: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[860px] px-6 pt-0.5 pb-1.5">
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
          <TableEmptyBody icon={MessageSquare} title={emptyTitle} />
        ) : (
          rows.map((row) => (
            <AskFeedbackRow
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

function AskFeedbackRow({
  row,
  selected,
  onSelect,
}: {
  row: AdminAskFeedbackRow;
  selected: boolean;
  onSelect: (row: AdminAskFeedbackRow, viaKeyboard: boolean) => void;
}) {
  const Verdict = row.rating === "down" ? ThumbsDown : ThumbsUp;
  return (
    <div
      id={askFeedbackRowId(row.id)}
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
        "h-[52px] cursor-pointer rounded-[var(--radius-cell)] transition-[background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      <span
        className={cn(
          COL.date,
          "text-[12px] whitespace-nowrap text-[var(--ink-700)] tabular-nums",
        )}
      >
        {shortDate(row.updatedAt)}
      </span>
      <span className={cn(COL.verdict, "flex items-center")}>
        <Verdict
          className="size-3.5 text-[var(--ink-700)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="sr-only">
          {row.rating === "down" ? "Thumbs down" : "Thumbs up"}
        </span>
      </span>
      <span
        className={cn(
          COL.question,
          "truncate text-[13px] font-medium text-[var(--ink-900)]",
        )}
      >
        {row.question.text || <EmptyMark label="No question text" />}
      </span>
      <span
        className={cn(COL.asker, "truncate text-[12px] text-[var(--ink-600)]")}
      >
        {row.asker.name}
      </span>
      <span
        className={cn(COL.scope, "truncate text-[12px] text-[var(--ink-600)]")}
      >
        {row.program?.name ?? "Personal"}
      </span>
      <span
        className={cn(
          COL.reasons,
          "truncate text-[12px] text-[var(--ink-600)]",
        )}
      >
        {row.reasons.length > 0 ? (
          row.reasons
            .map((reason) => ASK_FEEDBACK_REASON_LABELS[reason])
            .join(" · ")
        ) : (
          <EmptyMark label="No reasons given" />
        )}
      </span>
    </div>
  );
}
