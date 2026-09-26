import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { shortDate } from "@/lib/data/match-utils";
import { activityLabel } from "@/components/admin/admin-activity-labels";
import type { AdminTeamActivityEntry } from "@/lib/data/admin-team-server";

/**
 * Admin › Teams › `#activity` — the Activity log card (T19).
 *
 * Not on the canvas: `TeamPage.dc.html` never drew this card, it exists so
 * the `Activity log` pill (`team-sections.ts`) lands somewhere real instead
 * of the `TeamSectionPlaceholder`. Shell and row rhythm match the other main
 * -column cards on this page — `SettingsCard` + `SettingsCardTitle`, rows
 * separated by a top hairline — rather than inventing a new one.
 *
 * **Order.** `data.activity` is `readActivity()`'s own result
 * (`admin-team-server.ts`), already newest first (`created_at desc, id
 * desc`). This card does not re-sort — a second ordering here is a second
 * thing that could disagree with the loader.
 *
 * **Labels.** `activityLabel()` (`admin-activity-labels.ts`) maps every one
 * of the 26 `program_audit_log_action_check` values and falls back to the raw
 * action string for anything it does not know yet, so a row is never hidden
 * or thrown over an unmapped action.
 *
 * **Actor.** An em dash for a system write (`actorUserId === null`) or an
 * account whose name could not be resolved — the loader's own `actorName:
 * null` reading, not a second guess about why it is null.
 *
 * **Date.** `shortDate()` — "Aug 8" — the same formatter the People and
 * Requests cards use for their meta lines, in the browser's local time zone
 * (`Date#toLocaleDateString`, no explicit zone conversion). `created_at` is
 * a timestamptz, so this is a display choice already made elsewhere on this
 * page, not a new one.
 */
export function AdminActivityCard({
  activity,
}: {
  /** The latest 20 audit rows for this program, newest first. */
  activity: readonly AdminTeamActivityEntry[];
}) {
  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          activity.length > 0 ? (
            <span className="text-[11px] text-[var(--ink-500)]">
              {activity.length} {activity.length === 1 ? "entry" : "entries"}
            </span>
          ) : undefined
        }
      >
        Activity log
      </SettingsCardTitle>

      {activity.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] py-[9px]"
        >
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--ink-900)]">
            {activityLabel(entry.action)}
          </span>
          <span className="max-w-[40%] min-w-0 truncate text-[12px] text-[var(--ink-500)]">
            {entry.actorName ?? "—"}
          </span>
          <span className="tabular shrink-0 text-[12px] whitespace-nowrap text-[var(--ink-500)]">
            {shortDate(entry.createdAt)}
          </span>
        </div>
      ))}

      {/* A program with no audit rows yet is a real state — a freshly claimed
          program has nothing recorded — and the card keeps its own title and
          shape rather than rendering nothing, so the `#activity` pill never
          scrolls to a bare heading. */}
      {activity.length === 0 && (
        <div className="border-t border-[var(--border-hairline)] py-3">
          <span className="text-[12px] text-[var(--ink-500)]">
            No activity recorded on this program yet.
          </span>
        </div>
      )}
    </SettingsCard>
  );
}
