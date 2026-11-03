import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatePill } from "@/components/ui/state-pill";
import type { AssignedLabelSession } from "@/lib/data/label-assignments-server";
import { shortDate } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";

/**
 * The labeller's list on `/label`: one row per assigned session, the whole
 * row the way into `/label/[sessionId]` (a record row, so it carries the
 * chevron). A row names the session by when it was assigned and how far it
 * has got — never by the match's players, program or id, which the row type
 * does not even carry.
 *
 * No hooks, so it renders on the server and in the offline spec alike.
 */

/** The grid the header and every row share. */
const GRID =
  "grid grid-cols-[minmax(180px,1fr)_160px_120px_13px] items-center gap-x-4";

export const ASSIGNED_EMPTY = "No matches are assigned to you yet.";

export function sessionStatusLabel(
  status: AssignedLabelSession["status"],
): string {
  return status === "submitted" ? "Submitted" : "In progress";
}

function assignedLabel(session: AssignedLabelSession): string {
  return session.assignedAt
    ? `Assigned ${shortDate(session.assignedAt)}`
    : "Assigned";
}

export function AssignedSessionsList({
  sessions,
}: {
  sessions: readonly AssignedLabelSession[];
}) {
  if (sessions.length === 0) {
    return (
      <div
        data-label-assigned-empty=""
        className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-6 py-12 text-center shadow-[var(--shadow-card)]"
      >
        <p className="text-[13px] text-[var(--ink-900)]">{ASSIGNED_EMPTY}</p>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          A match appears here when an admin assigns it to you.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[520px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(
            GRID,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          <span className="eyebrow-sm">Assigned</span>
          <span className="eyebrow-sm">Checked</span>
          <span className="eyebrow-sm">Status</span>
          <span aria-hidden="true" />
        </div>
        {sessions.map((session) => {
          const status = sessionStatusLabel(session.status);
          const assigned = assignedLabel(session);
          return (
            <Link
              key={session.id}
              href={`/label/${session.id}`}
              aria-label={`${assigned} · ${status}`}
              data-label-session={session.id}
              data-label-status={session.status}
              className={cn(
                GRID,
                "-mx-4 h-[56px] w-[calc(100%+32px)] rounded-[var(--radius-element)] px-4 text-left transition-colors duration-100 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              )}
            >
              <span className="truncate text-[13px] text-[var(--ink-900)] tabular-nums">
                {assigned}
              </span>
              <span className="text-[13px] text-[var(--ink-700)] tabular-nums">
                {session.total > 0
                  ? `${session.checked} of ${session.total}`
                  : "—"}
              </span>
              <span className="flex min-w-0 items-center">
                <StatePill>{status}</StatePill>
              </span>
              <ChevronRight
                className="size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
