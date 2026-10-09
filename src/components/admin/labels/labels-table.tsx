import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { StartLabellingButton } from "@/components/admin/labels/start-labelling-button";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { LabelJobRow } from "@/lib/data/labels-server";
import {
  COL,
  LABELS_COLUMNS,
  ROW,
} from "@/components/admin/labels/labels-table-layout";

/**
 * A job's completion instant as date + time, e.g. "Oct 3, 2026, 2:14 PM UTC".
 * UTC with the zone named: `toLocaleString` reads the runtime's own zone, so
 * the server render and the browser would disagree and trip hydration. Null or
 * unparseable returns null.
 */
function formatCompletedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

/**
 * The Admin › Labels list: every completed Advantage Intelligence job an admin
 * could hand-label. The Data Table shell of `requests-table.tsx`, but a row has
 * nowhere to navigate to: `/admin/labels/[sessionId]` only exists once a
 * session has been seeded, which is the click itself. So no `onClick` and no
 * chevron; the only control is `StartLabellingButton` — or, on a complete
 * session, a "View" link to it: "Continue" would seed a NEW session for a job
 * whose only one is complete.
 */
export function LabelsTable({ rows }: { rows: readonly LabelJobRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[808px] px-6 pt-0.5 pb-1.5">
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
  const completedAt = formatCompletedAt(row.completedAt);
  return (
    <div className={cn(ROW, "-mx-4 min-h-[52px] px-4 py-2")}>
      {/* Match — both players, no crest: a job has no program to draw one
          from, and the pair of names is the whole identifying fact. */}
      <span className={cn(COL.players, "flex min-w-0 flex-col justify-center")}>
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {row.player1Name} vs {row.player2Name}
        </span>
      </span>

      {/* Job — two jobs can cover the same players, so the completion time
          and the first 8 characters of the job id are what tell them apart. */}
      <span className={cn(COL.job, "flex min-w-0 flex-col justify-center")}>
        {completedAt ? (
          <time
            dateTime={row.completedAt ?? undefined}
            className="tabular truncate text-[12px] text-[var(--ink-700)]"
          >
            {completedAt}
          </time>
        ) : (
          <EmptyMark label="No completion time" />
        )}
        <span className="font-mono text-[11px] text-[var(--ink-500)]">
          {row.jobId.slice(0, 8)}
        </span>
      </span>

      <span
        className={cn(COL.points, "tabular text-[13px] text-[var(--ink-900)]")}
      >
        {row.pointCount}
      </span>

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
        {row.session?.status === "complete" ? (
          <Link
            href={`/admin/labels/${row.session.id}`}
            data-view-session=""
            className={cn(advButton("outline", "sm"), "whitespace-nowrap")}
          >
            View
          </Link>
        ) : (
          <StartLabellingButton
            jobId={row.jobId}
            hasSession={row.session !== null}
          />
        )}
      </span>
    </div>
  );
}
