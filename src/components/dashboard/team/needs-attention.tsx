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
  // Audited and kept. The suspicion was that this card shifts the empty-state
  // layout and styles itself off-system; neither held. Its border, radius and
  // absence of a shadow are `NextEventCard`'s and `RosterCard`'s exactly, its
  // row wash is the `duration-150` + `--surface-muted` one `match-rows`,
  // `dual-sheet` and `roster-table` all use, and returning null costs the page
  // nothing: `showRail` on the team page already tests `attention.length > 0`,
  // so an empty list means this card and its `gap-6` are both absent from the
  // column rather than reserving space in it. What was genuinely off-system is
  // fixed below — the focus half of the wash, and a full-bleed wash squaring
  // off past the card's own corner.
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
                /* Keyboard gets what the mouse gets — `focus-visible:` rather
                   than `has-[:focus-visible]:` because the row IS the anchor,
                   the same spelling and for the same reason as `match-rows`.
                   And the last row rounds its bottom to 13px: this wash runs
                   edge to edge, so against the card's 14px radius less its 1px
                   border it would otherwise square off outside the corner.
                   Rounded here rather than clipped with `overflow-hidden` on
                   the card, which would take the focus ring with it. */
                className={`flex items-start gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] ${
                  index === alerts.length - 1 ? "rounded-b-[13px]" : ""
                }`}
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
