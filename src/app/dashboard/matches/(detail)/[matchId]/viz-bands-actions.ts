"use server";

/**
 * Server action for the Visualizations tab's depth/contact bands (P2B Task
 * 1). Mirrors `saved-views-actions.ts`'s shape: `accountId` always comes
 * from `getWorkspaceContext()`, never the client; the write goes through the
 * cookie-authenticated server client (never `admin.ts`); RLS is the real
 * authorization boundary — `public.viz_band_settings`'s UPDATE/INSERT
 * policies already implement "personal owner, or team owner/coach/staff"
 * (`is_program_staff`), so this action translates what the database refuses
 * into `ActionResult`'s typed errors rather than re-deriving that rule here.
 *
 * The upsert writes ONLY the three columns the table grants `authenticated`
 * UPDATE on (`depth_scheme`, `depth_dividers_ft`, `contact_dividers_ft`) —
 * `account_id` is the upsert's conflict key (immutable, never reassigned),
 * and `updated_by`/`updated_at` are the trigger's job, never sent from here.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { Workspace } from "@/lib/workspace/types";
import {
  rowToBandSettings,
  validateBandInput,
  type BandSettings,
  type BandSettingsDbRow,
} from "@/lib/data/viz-bands";

export type { BandSettings };

export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: "forbidden" | "invalid" };

// Route group `(detail)` doesn't change the URL, but `revalidatePath` keys
// on the route FILE structure — same pattern `saved-views-actions.ts` uses.
const MATCH_REPORT_PATH_PATTERN = "/dashboard/matches/(detail)/[matchId]";

function revalidateMatchReport() {
  revalidatePath(MATCH_REPORT_PATH_PATTERN, "page");
}

interface ActionContext {
  supabase: SupabaseClient;
  workspace: Workspace;
}

async function requireContext(): Promise<ActionContext | null> {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  return { supabase, workspace: ctx.active };
}

/** RLS refusal (insert/update blocked) surfaces as `42501`; an upsert whose
 *  UPDATE branch touches zero visible rows surfaces as no error and no data
 *  instead — both map to `"forbidden"`, never a thrown error. */
const INSUFFICIENT_PRIVILEGE = "42501";

export async function saveBandSettings(
  input: unknown,
): Promise<ActionResult<BandSettings>> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace } = ctx;

  const validated = validateBandInput(input);
  if (!validated) return { ok: false, error: "invalid" };

  const { data, error } = await supabase
    .from("viz_band_settings")
    .upsert(
      {
        account_id: workspace.id,
        depth_scheme: validated.depthScheme,
        depth_dividers_ft: validated.depthDividersFt,
        contact_dividers_ft: validated.contactDividersFt,
      },
      { onConflict: "account_id" },
    )
    .select("depth_scheme, depth_dividers_ft, contact_dividers_ft")
    .maybeSingle();

  if (error) {
    if (error.code === INSUFFICIENT_PRIVILEGE) {
      return { ok: false, error: "forbidden" };
    }
    return { ok: false, error: "forbidden" };
  }
  if (!data) return { ok: false, error: "forbidden" };

  revalidateMatchReport();
  return { ok: true, data: rowToBandSettings(data as BandSettingsDbRow) };
}
