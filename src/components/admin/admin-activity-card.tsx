import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { shortDate } from "@/lib/data/match-utils";
import { activityLabel } from "@/components/admin/admin-activity-labels";
import { AdminActivityShowAll } from "@/components/admin/admin-activity-show-all";
import type { AdminTeamActivityEntry } from "@/lib/data/admin-team-server";

/**
 * The newest entries the team page's Activity log shows before "Show all" —
 * enough to see what changed lately without the log outweighing the page.
 */
export const ACTIVITY_LOG_PREVIEW = 8;

/**
 * Admin › Teams › `#activity` — the Activity log card (T19).
 *
 * The last section of the team page's default view (T21 — "the activity log
 * should be able to be viewed on the same page"), after Latest matches. It
 * replaced the `?view=activity` view, which now lands on that default view
 * (`team-sections.ts`). Shell and row rhythm match the other cards on this
 * page — `SettingsCard` + `SettingsCardTitle`, rows separated by a top
 * hairline — rather than inventing a new one.
 *
 * **Limit.** With `limit`, the card draws the newest `limit` rows and a
 * "Show all" line that expands the rest in place (`AdminActivityShowAll`);
 * the line is left off when there are `limit` rows or fewer. Without it,
 * every row the loader returned is drawn. The title's count is always the
 * whole log's, so a clamped card still says how much is behind the line.
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
  limit,
}: {
  /** The latest 20 audit rows for this program, newest first. */
  activity: readonly AdminTeamActivityEntry[];
  /** Rows drawn before "Show all"; omitted, every row is drawn. */
  limit?: number;
}) {
  const rows = activity.map((entry) => (
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
  ));

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

      {limit != null && rows.length > limit ? (
        <AdminActivityShowAll rows={rows} limit={limit} />
      ) : (
        rows
      )}

      {/* A program with no audit rows yet is a real state — a freshly claimed
          program has nothing recorded — and the card keeps its own title and
          shape rather than rendering nothing, so the page's last section
          never reads as a bare heading. */}
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
