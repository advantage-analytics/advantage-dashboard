"use client";

import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  AdminPersonCell,
  TwoLineDate,
  WorkspaceCell,
} from "@/components/admin/admin-cells";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { AdminAskFeedbackRow } from "@/lib/data/ask-admin-view";
import { ASK_FEEDBACK_REASON_LABELS } from "@/lib/services/ask/feedback";
import { cn } from "@/lib/utils";

/**
 * The Admin › Ask table (Ask2 board): one row per thumb, a container row
 * (Data Table law 3) that peeks in the drawer beside it — there is no page
 * for one thumb to travel to — so no link and no chevron, although the board
 * draws one; click or Enter/Space select, and the selected row keeps its wash.
 *
 * Question (the asker's avatar and name over the question, with the New dot
 * and label) · Verdict (the thumb's glyph and its word) · Reasons (over the
 * note) · Workspace (crest or personal mark) · Date (two lines).
 */
const COL = {
  question: "min-w-[300px] flex-[1.6_1_0]",
  verdict: "w-[120px] shrink-0",
  reasons: "min-w-[150px] flex-1",
  workspace: "w-[170px] shrink-0",
  date: "w-[92px] shrink-0",
} as const;

const ROW = "flex items-center gap-4";

const COLUMNS: readonly { label: string; col: string }[] = [
  { label: "Question", col: COL.question },
  { label: "Verdict", col: COL.verdict },
  { label: "Reasons", col: COL.reasons },
  { label: "Workspace", col: COL.workspace },
  { label: "Date", col: COL.date },
];

/** The row's DOM id — what ↑/↓ stepping scrolls to and Esc returns focus to. */
export function askFeedbackRowId(id: string): string {
  return `admin-ask-feedback-${id}`;
}

export function AskFeedbackTable({
  rows,
  emptyTitle,
  selectedId,
  freshIds,
  onSelect,
}: {
  rows: readonly AdminAskFeedbackRow[];
  /** The cut, named — "No thumbs down yet". */
  emptyTitle: string;
  selectedId: string | null;
  /** Rows New since the admin last looked, not opened since. */
  freshIds: ReadonlySet<string>;
  onSelect: (row: AdminAskFeedbackRow, viaKeyboard: boolean) => void;
}) {
  return (
    <div className={CARD}>
      <div className="min-w-[960px] px-6 pt-0.5 pb-1.5">
        <AskFeedbackHeader />

        {rows.length === 0 ? (
          <TableEmptyBody icon={MessageSquare} title={emptyTitle} />
        ) : (
          rows.map((row) => (
            <AskFeedbackRow
              key={row.id}
              row={row}
              fresh={freshIds.has(row.id)}
              selected={row.id === selectedId}
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

function AskFeedbackHeader() {
  return (
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
  );
}

/**
 * The table while the page loads (`app/admin/ask/loading.tsx`): the card and
 * its column labels as themselves — chrome the page already knows — and five
 * 64px rows of bars under the region's one `role="status"`.
 */
export function AskFeedbackTableSkeleton() {
  return (
    <div className={CARD}>
      <div className="min-w-[960px] px-6 pt-0.5 pb-1.5">
        <AskFeedbackHeader />
        <PendingRegion label="Ask feedback">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={cn(ROW, "h-16")}>
              <span className={cn(COL.question, "flex items-center gap-3")}>
                <PendingBar className="size-8 rounded-full" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <PendingBar className="h-3 w-28" />
                  <PendingBar className="h-3 w-3/4" />
                </span>
              </span>
              <span className={COL.verdict}>
                <PendingBar className="h-3 w-20" />
              </span>
              <span className={COL.reasons}>
                <PendingBar className="h-3 w-28" />
              </span>
              <span className={COL.workspace}>
                <PendingBar className="h-3 w-24" />
              </span>
              <span className={cn(COL.date, "flex flex-col gap-1.5")}>
                <PendingBar className="h-3 w-12" />
                <PendingBar className="h-3 w-14" />
              </span>
            </div>
          ))}
        </PendingRegion>
      </div>
    </div>
  );
}

function AskFeedbackRow({
  row,
  fresh,
  selected,
  onSelect,
}: {
  row: AdminAskFeedbackRow;
  fresh: boolean;
  selected: boolean;
  onSelect: (row: AdminAskFeedbackRow, viaKeyboard: boolean) => void;
}) {
  const down = row.rating === "down";
  const Verdict = down ? ThumbsDown : ThumbsUp;
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
        "-mx-4 h-16 cursor-pointer rounded-[var(--radius-cell)] px-4 transition-[background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      <span className={cn(COL.question, "min-w-0")}>
        <AdminPersonCell
          name={row.asker.name}
          photoUrl={row.askerPhotoUrl}
          fresh={fresh}
          sub={
            row.question.text ? (
              <span className="truncate text-[var(--ink-700)]">
                “{row.question.text}”
              </span>
            ) : (
              <EmptyMark label="No question text" />
            )
          }
        />
      </span>
      <span className={cn(COL.verdict, "flex items-center gap-1.5")}>
        <Verdict
          className={cn(
            "size-3.5 shrink-0",
            down ? "text-[var(--ink-900)]" : "text-[var(--ink-500)]",
          )}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span
          className={cn(
            "text-[12px] whitespace-nowrap",
            down
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        >
          {down ? "Thumbs down" : "Thumbs up"}
        </span>
      </span>
      <span className={cn(COL.reasons, "flex min-w-0 flex-col gap-1")}>
        {row.reasons.length > 0 ? (
          <span className="truncate text-[12px] text-[var(--ink-700)]">
            {row.reasons
              .map((reason) => ASK_FEEDBACK_REASON_LABELS[reason])
              .join(", ")}
          </span>
        ) : (
          <EmptyMark label="No reasons given" />
        )}
        {row.note ? (
          <span className="truncate text-[12px] text-[var(--ink-600)] italic">
            “{row.note}”
          </span>
        ) : null}
      </span>
      <span className={cn(COL.workspace, "min-w-0")}>
        <WorkspaceCell
          workspace={
            row.program
              ? {
                  kind: "team",
                  name: row.program.shortName,
                  crestUrl: row.crestUrl ?? null,
                }
              : { kind: "personal" }
          }
        />
      </span>
      <span className={cn(COL.date, "min-w-0")}>
        <TwoLineDate at={row.updatedAt} fresh={fresh} />
      </span>
    </div>
  );
}
