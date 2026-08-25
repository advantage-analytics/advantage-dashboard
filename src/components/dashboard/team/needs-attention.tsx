import Link from "next/link";
import { Clock, Mail, TriangleAlert, type LucideIcon } from "lucide-react";
import type { TeamAlert } from "@/lib/data/team-home-server";

/**
 * 44a — the bottom of the right column: what is waiting for somebody.
 *
 * **This is an alert list, and round 44 exempts alert lists from 8a.** The
 * rounded-inset hover with no rules between rows is for a *result* list — the
 * matches card, the dual sheet, the roster table — where a coach scans down a
 * column of like things and the hover rect is what says which row they are on.
 * A list of unlike problems is read line by line, and a hairline between two
 * lines is what says they are two problems rather than one wrapped sentence. So
 * the rules stay, and they are the one exception on this page. Do not
 * "consistency-fix" them away.
 *
 * **It renders or it does not.** An empty list mounts nothing at all: no card,
 * no "all clear", no green tick. A program with nothing wrong should see the
 * column end above this, not be told at length that it is fine — the same rule
 * the dual sheet and the KPI strip already follow.
 *
 * Every row's words come from the loader, which builds them out of what it
 * already knows — a job's own `ANALYSIS_LABEL`, and the invite clock
 * `rosterProgress()` reads. Nothing here is a second vocabulary for a state,
 * and nothing here is an alert the data cannot support; `TeamAlert` says what
 * is deliberately absent and why.
 */

/** One glyph per kind, and the tone that goes with it. */
const MARK: Record<TeamAlert["kind"], { icon: LucideIcon; color: string }> = {
  "match-failed": { icon: TriangleAlert, color: "var(--danger)" },
  "match-slow": { icon: Clock, color: "var(--ink-400)" },
  "invite-expiring": { icon: Mail, color: "var(--ink-400)" },
};

export function NeedsAttention({ alerts }: { alerts: TeamAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)]">
      <h2 className="eyebrow px-5 pt-4 pb-2.5">Needs attention</h2>

      <ul>
        {alerts.map((alert, index) => {
          const { icon: Icon, color } = MARK[alert.kind];

          return (
            <li
              key={alert.id}
              /* Between rows only — nothing rules the eyebrow off from the
                 first row, which is the part of round 44 that does apply
                 here. */
              className={
                index > 0 ? "border-t border-[var(--border-hairline)]" : ""
              }
            >
              <Link
                href={alert.href}
                className="flex items-start gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-[var(--surface-muted)]"
              >
                <Icon
                  className="mt-px size-[15px] shrink-0"
                  strokeWidth={1.5}
                  style={{ color }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[12px] leading-[1.5] text-[var(--ink-900)]">
                    {alert.subject}
                  </span>
                  <span className="truncate text-[11px] text-[var(--ink-500)]">
                    {alert.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
