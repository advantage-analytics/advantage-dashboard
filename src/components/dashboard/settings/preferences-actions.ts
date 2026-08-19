"use server";

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
 * one-key call quietly reset the other five to something the caller never
 * chose. The form holds the whole object anyway.
 *
 * RLS restricts this to `auth.uid() = user_id` in all three directions, so the
 * id is taken from the session here and never from the caller.
 *
 * No `revalidatePath`: the form is optimistic and owns the state after an `ok`,
 * so re-rendering the server page on every toggle bought a fresh RSC payload
 * nothing read.
 */
export async function savePreferences(
  next: Preferences
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in. Please log back in." };

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      notify_analysis_ready: next.notifyAnalysisReady,
      notify_analysis_failed: next.notifyAnalysisFailed,
      weekly_team_digest: next.weeklyTeamDigest,
      default_workspace: next.defaultWorkspace,
      match_report_opens_at: next.matchReportOpensAt,
      stat_definitions_on_hover: next.statDefinitionsOnHover,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
