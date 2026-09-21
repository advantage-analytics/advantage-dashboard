import { createClient } from "@/lib/supabase/server";
import type { DistanceUnit } from "@/lib/format/distance";

/**
 * Notification and default-view settings.
 *
 * `user_preferences` has a NOT NULL default on every column and no row until
 * somebody saves, so "never opened the page" and "opened it and kept the
 * defaults" are the same state. That is deliberate: it means the notifier can
 * read a missing row as "email me when analysis is ready" without a backfill.
 * DEFAULTS below has to stay in step with the column defaults in
 * 20260818040318_user_preferences.sql, 20260913230000_notification_prefs_team.sql
 * and 20260921120000_user_preferences_unit.sql.
 */

export type DefaultWorkspace = "last_used" | "personal" | "team";
export type ReportEntryPoint = "story" | "stats" | "video";

export interface Preferences {
  notifyAnalysisReady: boolean;
  notifyAnalysisFailed: boolean;
  weeklyTeamDigest: boolean;
  /** Owner/coach: join requests, new members, members leaving. */
  notifyTeamActivity: boolean;
  /** Owner/coach: the program's allowance at 80% and when spent. */
  notifyUsageAlerts: boolean;
  defaultWorkspace: DefaultWorkspace;
  matchReportOpensAt: ReportEntryPoint;
  statDefinitionsOnHover: boolean;
  /** Court distances, ball speed and contact depth across every chart. */
  unit: DistanceUnit;
}

/** `savePreferences` takes a complete object, so the form never merges against
 *  these; the notifier (`services/notifications/should-notify.ts`) does, for a
 *  user who never saved a row. Must stay in step with the column defaults in
 *  the migrations named above. */
export const DEFAULT_PREFERENCES: Preferences = {
  notifyAnalysisReady: true,
  notifyAnalysisFailed: true,
  weeklyTeamDigest: false,
  notifyTeamActivity: true,
  notifyUsageAlerts: true,
  defaultWorkspace: "last_used",
  matchReportOpensAt: "story",
  statDefinitionsOnHover: true,
  unit: "ft",
};

export async function getPreferences(): Promise<Preferences> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PREFERENCES;

  const { data, error } = await supabase
    .from("user_preferences")
    .select(
      "notify_analysis_ready, notify_analysis_failed, weekly_team_digest, notify_team_activity, notify_usage_alerts, default_workspace, match_report_opens_at, stat_definitions_on_hover, unit",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[preferences] could not read preferences", {
      error: error.message,
    });
    return DEFAULT_PREFERENCES;
  }
  if (!data) return DEFAULT_PREFERENCES;

  return {
    notifyAnalysisReady: data.notify_analysis_ready,
    notifyAnalysisFailed: data.notify_analysis_failed,
    weeklyTeamDigest: data.weekly_team_digest,
    notifyTeamActivity: data.notify_team_activity,
    notifyUsageAlerts: data.notify_usage_alerts,
    defaultWorkspace: data.default_workspace as DefaultWorkspace,
    matchReportOpensAt: data.match_report_opens_at as ReportEntryPoint,
    statDefinitionsOnHover: data.stat_definitions_on_hover,
    unit: data.unit as DistanceUnit,
  };
}
