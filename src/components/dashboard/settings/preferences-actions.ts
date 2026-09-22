"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Preferences } from "@/lib/data/preferences-server";
import type { ActionResult } from "@/components/dashboard/settings/actions";

/**
 * Save the preferences row.
 *
 * An upsert of the whole row rather than an update of one column, because the
 * row may not exist yet — the table has no trigger creating it, so the first
 * toggle a person ever flips is an insert.
 *
 * It takes a complete `Preferences` for that reason, not a patch. With a
 * `Partial` the missing keys had to be filled from the TS defaults, so a
 * one-key call quietly reset the other seven to something the caller never
 * chose. The form holds the whole object anyway.
 *
 * RLS restricts this to `auth.uid() = user_id` in all three directions, so the
 * id is taken from the session here and never from the caller.
 *
 * The form is optimistic and owns its own state after an `ok`, so the
 * settings page itself needs no revalidation. The MATCH REPORT does: its
 * page reads `unit` on the server, and without invalidating it a Back
 * navigation to a match page served the cached payload in the old unit until
 * a reload. Keyed on the route FILE (the `(detail)` group is part of it), the
 * same pattern `viz-bands-actions.ts` uses; `"layout"` covers the page and
 * everything under it.
 */
const MATCH_REPORT_PATH_PATTERN = "/dashboard/matches/(detail)/[matchId]";

export async function savePreferences(
  next: Preferences,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in. Please log back in." };

  if (next.unit !== "ft" && next.unit !== "m") {
    return { ok: false, error: "Invalid unit preference." };
  }

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      notify_analysis_ready: next.notifyAnalysisReady,
      notify_analysis_failed: next.notifyAnalysisFailed,
      weekly_team_digest: next.weeklyTeamDigest,
      notify_team_activity: next.notifyTeamActivity,
      notify_usage_alerts: next.notifyUsageAlerts,
      default_workspace: next.defaultWorkspace,
      match_report_opens_at: next.matchReportOpensAt,
      stat_definitions_on_hover: next.statDefinitionsOnHover,
      unit: next.unit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(MATCH_REPORT_PATH_PATTERN, "layout");
  return { ok: true };
}
