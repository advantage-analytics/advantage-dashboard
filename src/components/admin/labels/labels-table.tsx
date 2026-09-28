import { ClipboardList } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { StartLabellingButton } from "@/components/admin/labels/start-labelling-button";
import { cn } from "@/lib/utils";
import type { LabelJobRow } from "@/lib/data/labels-server";
import {
  COL,
  LABELS_COLUMNS,
  ROW,
} from "@/components/admin/labels/labels-table-layout";

/**
 * The Admin › Labels list — every completed Advantage Intelligence job an
 * admin could hand-label, T4.
 *
 * Follows the same Data Table shell as `requests-table.tsx`/`teams-table.tsx`
 * (hairlined card, 52px flex rows, no rule between rows), but this table's
 * rows are neither container rows nor record rows (Data Table law 3): a row
 * has nowhere to navigate to by itself — `/admin/labels/[sessionId]` only
 * exists once a session has been seeded, which is the click itself. So the
 * row carries no `onClick` and no chevron; the only control is
 * `StartLabellingButton`, and it is a Server Component throughout except for
 * that one button.
 */
export function LabelsTable({ rows }: { rows: readonly LabelJobRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[640px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            ROW,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          {LABELS_COLUMNS.map((column) => (
            <span key={column.label} className={cn(column.col, "eyebrow-sm")}>
              {column.label}
            </span>
          ))}
          <span className={COL.action} aria-hidden="true" />
        </div>

        {rows.length === 0 ? (
          <TableEmptyBody
            icon={ClipboardList}
            title="No completed Advantage Intelligence jobs yet"
          />
        ) : (
          rows.map((row) => <LabelJobRowView key={row.jobId} row={row} />)
        )}
      </div>
    </div>
  );
}

function LabelJobRowView({ row }: { row: LabelJobRow }) {
  return (
    <div className={cn(ROW, "-mx-4 min-h-[52px] px-4 py-2")}>
      {/* Match — both players, no crest: a job has no program to draw one
          from, and the pair of names is the whole identifying fact. */}
      <span className={cn(COL.players, "flex min-w-0 flex-col justify-center")}>
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {row.player1Name} vs {row.player2Name}
        </span>
      </span>

      {/* Points — the labelling unit, compared down its column. */}
      <span
        className={cn(COL.points, "tabular text-[13px] text-[var(--ink-900)]")}
      >
        {row.pointCount}
      </span>

      {/* Progress — "N of M checked", or the not-yet mark when nobody has
          started. */}
      <span className={cn(COL.progress, "text-[12px] text-[var(--ink-700)]")}>
        {row.session ? (
          <>
            {row.session.checked} of {row.session.total} checked
            {row.session.status === "complete" ? (
              <span className="ml-1.5 text-[var(--ink-500)]">· Complete</span>
            ) : null}
          </>
        ) : (
          <EmptyMark label="Not started" />
        )}
      </span>

      <span className={COL.action}>
        <StartLabellingButton
          jobId={row.jobId}
          hasSession={row.session !== null}
        />
      </span>
    </div>
  );
}
