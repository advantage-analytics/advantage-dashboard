import { createClient } from "@/lib/supabase/server";

/**
 * Notification and default-view settings.
 *
 * `user_preferences` has a NOT NULL default on every column and no row until
 * somebody saves, so "never opened the page" and "opened it and kept the
 * defaults" are the same state. That is deliberate: it means the notifier can
 * read a missing row as "email me when analysis is ready" without a backfill.
 * DEFAULTS below has to stay in step with the column defaults in
 * 20260818040318_user_preferences.sql.
 */

export type DefaultWorkspace = "last_used" | "personal" | "team";
export type ReportEntryPoint = "story" | "stats" | "video";

export interface Preferences {
  notifyAnalysisReady: boolean;
  notifyAnalysisFailed: boolean;
  weeklyTeamDigest: boolean;
  defaultWorkspace: DefaultWorkspace;
  matchReportOpensAt: ReportEntryPoint;
  statDefinitionsOnHover: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  notifyAnalysisReady: true,
  notifyAnalysisFailed: true,
  weeklyTeamDigest: false,
  defaultWorkspace: "last_used",
  matchReportOpensAt: "story",
  statDefinitionsOnHover: true,
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
      "notify_analysis_ready, notify_analysis_failed, weekly_team_digest, default_workspace, match_report_opens_at, stat_definitions_on_hover"
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
    defaultWorkspace: data.default_workspace as DefaultWorkspace,
    matchReportOpensAt: data.match_report_opens_at as ReportEntryPoint,
    statDefinitionsOnHover: data.stat_definitions_on_hover,
  };
}
