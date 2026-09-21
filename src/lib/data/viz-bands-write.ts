/**
 * The one write path for `public.viz_band_settings`, shared by the server
 * action (`viz-bands-actions.ts`) and the live RLS spec
 * (`tests/viz-bands-rls.spec.ts`), so the shape the database is proven
 * against is the shape the action actually issues.
 *
 * A plain module, deliberately NOT `"use server"`: exported from the action
 * file, `updateThenInsert` would become a client-callable action taking a
 * client-chosen `accountId`. The action is the only production caller, and it
 * takes `accountId` from `getWorkspaceContext()`.
 *
 * ## Why this isn't `.upsert()`
 *
 * PostgREST's upsert re-assigns EVERY payload column on the conflict branch,
 * `account_id` included, and `authenticated` has no UPDATE grant on
 * `account_id` (it is immutable) — so every save after the first failed with
 * 42501. Instead: UPDATE the existing row (its SET list never names
 * `account_id`); if that touches no row, INSERT (a first save); if the INSERT
 * loses a race to a concurrent first save (23505), retry the UPDATE once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BandSettings } from "./viz-bands";

export const BAND_COLUMNS =
  "depth_scheme, depth_dividers_ft, contact_dividers_ft";

/** Postgres' CHECK violation — `validateBandInput` should already have
 *  refused the input; belt-and-suspenders. */
const CHECK_VIOLATION = "23514";
/** RLS/column-privilege refusal. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** Unique violation on the primary key — a concurrent first save. */
const UNIQUE_VIOLATION = "23505";

/** The three columns `authenticated` may write — never `account_id`, never
 *  `updated_by`/`updated_at` (the trigger's). */
export interface BandWriteCols {
  depth_scheme: BandSettings["depthScheme"];
  depth_dividers_ft: BandSettings["depthDividersFt"];
  contact_dividers_ft: BandSettings["contactDividersFt"];
}

export async function updateThenInsert(
  supabase: SupabaseClient,
  accountId: string,
  cols: BandWriteCols,
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

/** A write error's code → the action's typed error: a CHECK violation is bad
 *  input, a privilege refusal is `"forbidden"`, anything else an honest
 *  `"failed"` rather than a guessed `"forbidden"`. */
export function mapWriteError(error: {
  code?: string;
}): "invalid" | "forbidden" | "failed" {
  if (error.code === CHECK_VIOLATION) return "invalid";
  if (error.code === INSUFFICIENT_PRIVILEGE) return "forbidden";
  return "failed";
}
