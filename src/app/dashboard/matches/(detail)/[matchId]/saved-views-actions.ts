"use server";

/**
 * Server actions for the Visualizations tab's saved views (P1 Task 8).
 *
 * Every action resolves `accountId` from `getWorkspaceContext()` — never
 * from the client — and writes through the cookie-authenticated server
 * client, never `admin.ts`. `public.saved_views` RLS is the real
 * authorization boundary (creator may update/delete own rows; staff —
 * owner/coach/staff — may rename or delete `shared` rows); these actions
 * translate what the database refuses into `ActionResult`'s typed errors
 * rather than re-deriving the policy in TypeScript. Every mutating query also
 * carries an explicit `.eq("account_id", workspace.id)` alongside RLS —
 * belt-and-suspenders so a stray id from another workspace can't even reach
 * the policy check with a row that happens to satisfy it.
 *
 * One exception: `setSavedViewShared(id, false)` un-sharing someone else's
 * view. Postgres's UPDATE `WITH CHECK` for a staff caller only re-checks
 * `is_program_staff(account_id)` — it does not look at who is un-sharing —
 * so a staff member's update to flip `shared` off on a row they don't own
 * would otherwise succeed at the database. That one case checks `mine`
 * itself before issuing the write; see the comment on that function.
 *
 * Column privileges also cap every write to `name, cut, chart, filters,
 * sort_order, shared` — `id`, `account_id`, `created_by`, `created_at` are
 * never sent in an update payload, and `created_by` is omitted from inserts
 * so its `auth.uid()` default applies.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { Workspace } from "@/lib/workspace/types";
import type {
  Cut,
  Chart,
  VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  clampSortOrder,
  normalizeOrderedIds,
  normalizeSavedViewName,
  resolveCopyName,
  resolveSharedFlag,
  rowToSavedView,
  rowToSavedViewRow,
  validateVizInput,
  SAVED_VIEW_COLUMNS,
  type SavedView,
  type SavedViewDbRow,
  type SavedViewRow,
} from "@/lib/data/saved-views-logic";

export type { SavedView, SavedViewRow };

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error:
        "duplicate_name" | "forbidden" | "invalid" | "unsupported_cut_chart";
    };

// Route group `(detail)` doesn't change the URL, but `revalidatePath` keys
// on the route FILE structure, and the docs' own route-group example
// (`/(main)/blog/[slug]`) keeps the group in the pattern — so it stays here
// too.
const MATCH_REPORT_PATH_PATTERN = "/dashboard/matches/(detail)/[matchId]";

function revalidateMatchReport() {
  revalidatePath(MATCH_REPORT_PATH_PATTERN, "page");
}

interface ActionContext {
  supabase: SupabaseClient;
  workspace: Workspace;
  viewerId: string;
}

async function requireContext(): Promise<ActionContext | null> {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  return { supabase, workspace: ctx.active, viewerId: ctx.viewer.id };
}

/** `sort_order` one past the account's current max — 0 for its first row. */
async function nextSortOrder(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { data } = await supabase
    .from("saved_views")
    .select("sort_order")
    .eq("account_id", accountId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? -1) + 1;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** The `saved_views_cut_check`/`saved_views_chart_check` constraints reject a
 * `cut`/`chart` value the live database doesn't accept yet (I3: the Phase 1.2
 * migration widening them to `rallyPosition`/`heat` is committed but not yet
 * applied) — distinct from every other write failure, which really is
 * "forbidden" (RLS/column-privilege). */
function isCheckViolation(error: { code?: string } | null): boolean {
  return error?.code === "23514";
}

/** `{code}` → the `ActionResult` error it maps to — every write shares this. */
function writeErrorResult(error: { code?: string }): ActionResult<never> {
  if (isUniqueViolation(error)) return { ok: false, error: "duplicate_name" };
  if (isCheckViolation(error)) {
    return { ok: false, error: "unsupported_cut_chart" };
  }
  return { ok: false, error: "forbidden" };
}

export async function createSavedView(input: {
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  shared?: boolean;
}): Promise<ActionResult<SavedView>> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace } = ctx;

  const name = normalizeSavedViewName(input.name);
  if (!name) return { ok: false, error: "invalid" };

  const validated = validateVizInput(input);
  if (!validated) return { ok: false, error: "invalid" };

  const shared = resolveSharedFlag(workspace.kind, input.shared);
  const sortOrder = await nextSortOrder(supabase, workspace.id);

  const { data, error } = await supabase
    .from("saved_views")
    .insert({
      account_id: workspace.id,
      name,
      cut: validated.cut,
      chart: validated.chart,
      filters: validated.filters,
      sort_order: sortOrder,
      shared,
    })
    .select(SAVED_VIEW_COLUMNS)
    .single();

  if (error) return writeErrorResult(error);

  const view = rowToSavedView(data as SavedViewDbRow);
  if (!view) return { ok: false, error: "invalid" };

  revalidateMatchReport();
  return { ok: true, data: view };
}

export async function renameSavedView(
  id: string,
  name: string,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace } = ctx;

  const normalized = normalizeSavedViewName(name);
  if (!normalized) return { ok: false, error: "invalid" };

  // RLS's UPDATE policy already implements "mine, or shared + staff" — a
  // rename this account may not perform touches zero rows rather than
  // throwing, which `.select().maybeSingle()` turns into `forbidden` below.
  const { data, error } = await supabase
    .from("saved_views")
    .update({ name: normalized })
    .eq("id", id)
    .eq("account_id", workspace.id)
    .select("id")
    .maybeSingle();

  if (error) return writeErrorResult(error);
  if (!data) return { ok: false, error: "forbidden" };

  revalidateMatchReport();
  return { ok: true, data: undefined };
}

export async function duplicateSavedView(
  id: string,
): Promise<ActionResult<SavedView>> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace, viewerId } = ctx;

  // RLS's SELECT policy gates this to what the caller may already see —
  // their own rows and the workspace's shared ones. Scoped to the ACTIVE
  // workspace too: without it, a member of two workspaces could duplicate a
  // shared view they can see in workspace A while sitting in workspace B,
  // and the copy would land in B — content crossing workspaces even though
  // nothing unauthorized was read.
  const { data: source, error: sourceError } = await supabase
    .from("saved_views")
    .select(SAVED_VIEW_COLUMNS)
    .eq("id", id)
    .eq("account_id", workspace.id)
    .maybeSingle();
  if (sourceError || !source) return { ok: false, error: "forbidden" };

  const validated = validateVizInput({
    cut: source.cut,
    chart: source.chart,
    filters: source.filters,
  });
  if (!validated) return { ok: false, error: "invalid" };

  // Collisions resolve against the CALLER's own private names — a copy is
  // always private and owned by the caller, so the duplicate never needs to
  // avoid another member's names, only its own. Run alongside `nextSortOrder`
  // below — neither read depends on the other's result.
  const [{ data: mineRows, error: mineError }, sortOrder] = await Promise.all([
    supabase
      .from("saved_views")
      .select("name")
      .eq("account_id", workspace.id)
      .eq("created_by", viewerId)
      .eq("shared", false),
    nextSortOrder(supabase, workspace.id),
  ]);
  if (mineError) return { ok: false, error: "forbidden" };

  const existingNames = new Set(
    (mineRows ?? []).map((row) => row.name.trim().toLowerCase()),
  );
  const name = resolveCopyName(source.name, existingNames);

  const { data, error } = await supabase
    .from("saved_views")
    .insert({
      account_id: workspace.id,
      name,
      cut: validated.cut,
      chart: validated.chart,
      filters: validated.filters,
      sort_order: sortOrder,
      shared: false,
    })
    .select(SAVED_VIEW_COLUMNS)
    .single();

  if (error) return writeErrorResult(error);

  const view = rowToSavedView(data as SavedViewDbRow);
  if (!view) return { ok: false, error: "invalid" };

  revalidateMatchReport();
  return { ok: true, data: view };
}

export async function deleteSavedView(
  id: string,
): Promise<ActionResult<SavedViewRow>> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace, viewerId } = ctx;

  // Same RLS-implements-canManage shape as rename: DELETE's USING clause is
  // "mine, or shared + staff", so an unauthorized delete touches zero rows.
  const { data, error } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", id)
    .eq("account_id", workspace.id)
    .select(SAVED_VIEW_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, error: "forbidden" };
  if (!data) return { ok: false, error: "forbidden" };

  // `SavedViewRow`, not `SavedView`: the caller needs `mine` so Undo
  // (`restoreSavedView`) can refuse to resurrect a shared view that belonged
  // to someone else.
  const view = rowToSavedViewRow(data as SavedViewDbRow, viewerId);
  if (!view) return { ok: false, error: "invalid" };

  revalidateMatchReport();
  return { ok: true, data: view };
}

/**
 * Re-insert a deleted view under the CALLER, for Undo.
 *
 * Review M8: there is no ownership check to make here, and the previous
 * `view.mine` gate was never a real one — `view` is client-supplied, so a
 * caller could always have sent `mine: true` regardless of who actually
 * created the row. What actually keeps this safe is that a restore is just
 * another `createSavedView`-shaped insert: it always writes `created_by` as
 * the CALLER (the column's `auth.uid()` default, same as `createSavedView`),
 * so there is nothing here for a forged `mine` to escalate INTO — the worst
 * a caller can do is create a new view under their own account with
 * somebody else's old name/cut/filters, which they could do anyway by just
 * building that view themselves. The parameter is narrowed to exactly the
 * fields a restore needs (no `id`, no `mine`) so this reads as what it is: a
 * create, not a resurrection of the deleted row.
 *
 * The UI-level restriction — Undo is only ever offered for the caller's OWN
 * just-deleted view — lives entirely in `saved-views-band.tsx` (`deleted.mine`
 * gates whether the Undo action is even shown), not here.
 */
export async function restoreSavedView(view: {
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  shared: boolean;
  order: number;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace } = ctx;

  const name = normalizeSavedViewName(view.name);
  if (!name) return { ok: false, error: "invalid" };

  const validated = validateVizInput(view);
  if (!validated) return { ok: false, error: "invalid" };

  const shared = resolveSharedFlag(workspace.kind, view.shared);

  // A fresh id and `created_by` (the caller, via the column's `auth.uid()`
  // default) — Undo re-creates the row rather than resurrecting the old one,
  // which by now RLS may no longer let this account touch by its old id.
  const { error } = await supabase.from("saved_views").insert({
    account_id: workspace.id,
    name,
    cut: validated.cut,
    chart: validated.chart,
    filters: validated.filters,
    sort_order: clampSortOrder(view.order),
    shared,
  });

  if (error) return writeErrorResult(error);

  revalidateMatchReport();
  return { ok: true, data: undefined };
}

export async function reorderSavedViews(
  orderedIds: string[],
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace } = ctx;

  const normalized = normalizeOrderedIds(orderedIds);
  if (!normalized) return { ok: false, error: "invalid" };

  // One UPDATE per row — there is no reorder RPC, and `normalizeOrderedIds`
  // has already capped this at 200. `.eq("account_id", …)` plus RLS means an
  // id this account may not manage (not mine, not a shared row it may
  // rename) simply updates zero rows — skipped silently, per the same
  // RLS-implements-canManage shape every other action here uses. A REAL
  // error (not just zero rows) fails the whole reorder immediately, rather
  // than silently discarding it the way a bare fire-and-forget update would.
  for (let index = 0; index < normalized.length; index++) {
    const { error } = await supabase
      .from("saved_views")
      .update({ sort_order: index })
      .eq("id", normalized[index])
      .eq("account_id", workspace.id);

    if (error) return writeErrorResult(error);
  }

  revalidateMatchReport();
  return { ok: true, data: undefined };
}

/**
 * Share or un-share a view. Sharing (`shared: true`) is left to RLS: the
 * UPDATE policy's `USING` clause only admits a private row to a non-staff
 * caller when they are its creator, so a caller may only ever share their
 * OWN private view.
 *
 * Un-sharing (`shared: false`) is checked here first: the same policy's
 * `WITH CHECK` for a staff caller passes on `is_program_staff(account_id)`
 * alone — it never re-examines the new row's `shared` value — so a staff
 * member's update to flip `shared` off on a view they don't own would
 * otherwise succeed at the database. "Staff may rename or delete shared
 * rows" does not extend to un-sharing someone else's, so that case is
 * refused before the write is even attempted rather than trusted to the
 * database's error text.
 */
export async function setSavedViewShared(
  id: string,
  shared: boolean,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { supabase, workspace, viewerId } = ctx;

  if (shared && workspace.kind === "personal") {
    return { ok: false, error: "invalid" };
  }

  if (!shared) {
    const { data: existing, error } = await supabase
      .from("saved_views")
      .select("created_by")
      .eq("id", id)
      .eq("account_id", workspace.id)
      .maybeSingle();
    if (error || !existing || existing.created_by !== viewerId) {
      return { ok: false, error: "forbidden" };
    }
  }

  const { data, error } = await supabase
    .from("saved_views")
    .update({ shared })
    .eq("id", id)
    .eq("account_id", workspace.id)
    .select("id")
    .maybeSingle();

  if (error) return writeErrorResult(error);
  if (!data) return { ok: false, error: "forbidden" };

  revalidateMatchReport();
  return { ok: true, data: undefined };
}
