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
 * ## Fix round 1, blocking #1: why this isn't `.upsert()`
 *
 * `.upsert(cols, { onConflict: "account_id" })` compiles to `INSERT ...
 * ON CONFLICT (account_id) DO UPDATE SET account_id = EXCLUDED.account_id,
 * depth_scheme = ..., ...` — PostgREST's upsert always re-assigns EVERY
 * column in the payload on the conflict branch, `account_id` included, even
 * though the payload's `account_id` value is identical to the row's own.
 * `authenticated` has no UPDATE grant on `account_id` (deliberately — it's
 * immutable), so that `SET account_id = ...` fails column-privilege check
 * with `42501` on every save AFTER THE FIRST (the first save has no
 * existing row, so it takes the plain INSERT branch and never touches the
 * conflict path at all). The action reported every one of those refusals as
 * `"forbidden"`, silently discarding the write.
 *
 * `updateThenInsert` instead: try a plain UPDATE (which never mentions
 * `account_id` in its SET list) against the existing row; if RLS or a
 * missing row leaves zero rows updated, fall back to INSERT (first save, or
 * a row deleted out from under us); if that INSERT loses a race to a
 * concurrent first save (`23505`, unique violation on the primary key),
 * retry the UPDATE once — by then the row the race created exists. Proven
 * against the live database twice in a row (`tests/viz-bands-rls.spec.ts`,
 * "lands on the second save too") for both a personal owner and a team
 * coach.
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

const BAND_COLUMNS = "depth_scheme, depth_dividers_ft, contact_dividers_ft";

/** Postgres' code for a CHECK constraint violation (a descending divider
 *  pair, or `custom` with no dividers) — `validateBandInput` should have
 *  already refused these, so this is belt-and-suspenders, not the primary
 *  guard. */
const CHECK_VIOLATION = "23514";
/** RLS/column-privilege refusal. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** Unique violation on the primary key — a concurrent first save landed
 *  between our UPDATE (0 rows, no existing row yet) and our INSERT. */
const UNIQUE_VIOLATION = "23505";

interface WriteCols {
  depth_scheme: BandSettings["depthScheme"];
  depth_dividers_ft: BandSettings["depthDividersFt"];
  contact_dividers_ft: BandSettings["contactDividersFt"];
}

/**
 * UPDATE the existing row; if none is visible/writable (a first save, or a
 * row this caller cannot reach), fall back to INSERT; if that INSERT loses
 * a race to a concurrent first save, retry the UPDATE once. See the module
 * doc comment for why this replaces `.upsert()`.
 */
async function updateThenInsert(
  supabase: SupabaseClient,
  accountId: string,
  cols: WriteCols,
) {
  const update = await supabase
    .from("viz_band_settings")
    .update(cols)
    .eq("account_id", accountId)
    .select(BAND_COLUMNS)
    .maybeSingle();
  if (update.error || update.data) return update;

  const insert = await supabase
    .from("viz_band_settings")
    .insert({ account_id: accountId, ...cols })
    .select(BAND_COLUMNS)
    .single();
  if (!insert.error || insert.error.code !== UNIQUE_VIOLATION) return insert;

  return supabase
    .from("viz_band_settings")
    .update(cols)
    .eq("account_id", accountId)
    .select(BAND_COLUMNS)
    .maybeSingle();
}

/** `{code}` → the `ActionResult` error it maps to — reuses
 *  `saved-views-actions.ts`'s shape (a CHECK violation is the caller's bad
 *  input, an RLS/privilege refusal is `"forbidden"`, anything else is an
 *  honest `"failed"` rather than a guessed `"forbidden"`). */
function mapWriteError(error: {
  code?: string;
}): "invalid" | "forbidden" | "failed" {
  if (error.code === CHECK_VIOLATION) return "invalid";
  if (error.code === INSUFFICIENT_PRIVILEGE) return "forbidden";
  return "failed";
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
