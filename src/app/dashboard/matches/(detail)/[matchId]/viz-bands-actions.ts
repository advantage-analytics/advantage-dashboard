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
 * The write touches ONLY the three columns the table grants `authenticated`
 * UPDATE on (`depth_scheme`, `depth_dividers_ft`, `contact_dividers_ft`) —
 * `account_id` is never reassigned, and `updated_by`/`updated_at` are the
 * trigger's job, never sent from here.
 *
 * The write itself — UPDATE, then INSERT on a first save, never `.upsert()`
 * (which re-assigns the immutable `account_id` and fails 42501) — lives in
 * `@/lib/data/viz-bands-write`, shared with the live RLS spec.
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
import { mapWriteError, updateThenInsert } from "@/lib/data/viz-bands-write";

export type { BandSettings };

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: "forbidden" | "invalid" | "failed" };

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

export async function saveBandSettings(
  input: unknown,
): Promise<ActionResult<BandSettings>> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace } = ctx;

  const validated = validateBandInput(input);
  if (!validated) return { ok: false, error: "invalid" };

  const result = await updateThenInsert(supabase, workspace.id, {
    depth_scheme: validated.depthScheme,
    depth_dividers_ft: validated.depthDividersFt,
    contact_dividers_ft: validated.contactDividersFt,
  });

  if (result.error) return { ok: false, error: mapWriteError(result.error) };
  // Zero rows on both the UPDATE and the INSERT/retry path — RLS filtered
  // every branch without throwing (e.g. a team player, whose UPDATE's
  // `USING` clause admits nothing to update and whose INSERT the policy
  // would refuse with 42501 rather than silently drop, so reaching here
  // with no data and no error is not actually expected in practice, but is
  // treated the same as a refusal rather than as success either way).
  if (!result.data) return { ok: false, error: "forbidden" };

  revalidateMatchReport();
  return {
    ok: true,
    data: rowToBandSettings(result.data as BandSettingsDbRow),
  };
}
