/**
 * Server loader for the Visualizations tab's saved views (P1 Task 8).
 *
 * RLS-scoped: reads through the cookie-authenticated server client, never
 * `admin.ts`. `public.saved_views` RLS already restricts what comes back
 * (private rows to their creator, `shared` rows to the rest of the
 * workspace's members) — the explicit `.eq("account_id", accountId)` here is
 * belt-and-suspenders so the query shape matches `getSavedViews(accountId)`'s
 * own contract rather than leaning on RLS alone to scope it.
 *
 * Each row is re-validated through `rowToSavedViewRow` (`saved-views-logic.ts`,
 * `parseVizState` underneath) before it reaches the client: a stale or
 * hand-edited row can never hand an unknown cut/chart/filter value to the
 * Visualizations tab. Invalid rows are dropped, not defaulted.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  rowToSavedViewRow,
  SAVED_VIEW_COLUMNS,
  type SavedView,
  type SavedViewDbRow,
  type SavedViewRow,
} from "./saved-views-logic";

export type { SavedView, SavedViewRow };

/**
 * Every saved view this viewer may see for `accountId` (the active
 * workspace's `Workspace.id`), ordered `sort_order` asc then `created_at`
 * asc. Wrapped in React `cache()` so the loader and the actions' own reads
 * within one request share the underlying Supabase client's connection
 * without each server component re-fetching.
 */
export const getSavedViews = cache(
  async (accountId: string): Promise<SavedViewRow[]> => {
    const supabase = await createClient();

    const [{ data: rows, error }, { data: auth, error: authError }] =
      await Promise.all([
        supabase
          .from("saved_views")
          .select(SAVED_VIEW_COLUMNS)
          .eq("account_id", accountId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.auth.getUser(),
      ]);

    if (error) {
      // Never fatal: the Visualizations tab still renders the wall/court
      // without saved views rather than failing the whole page.
      console.error("[saved-views] could not load saved views", {
        error: error.message,
      });
      return [];
    }

    // No viewer id means `rowToSavedViewRow` can't answer `mine` for ANY
    // row — every one would silently read as "not mine", including rows
    // this viewer actually created. Rather than risk that, treat a failed or
    // missing user read the same as the query-error path above: no saved
    // views rather than a wrong `mine`.
    if (authError || !auth.user) {
      console.error("[saved-views] could not resolve the viewer", {
        error: authError?.message,
      });
      return [];
    }

    const viewerId = auth.user.id;

    const dbRows = (rows ?? []) as SavedViewDbRow[];
    const creatorNames = await sharedViewCreatorNames(
      supabase,
      accountId,
      dbRows,
      viewerId,
    );

    const result: SavedViewRow[] = [];
    for (const row of dbRows) {
      const mapped = rowToSavedViewRow(row, viewerId);
      if (!mapped) continue;
      const creatorName =
        mapped.shared && !mapped.mine
          ? (creatorNames.get(row.created_by) ?? null)
          : undefined;
      result.push(
        creatorName === undefined ? mapped : { ...mapped, creatorName },
      );
    }
    return result;
  },
);

/**
 * Display names for the creators of shared views the viewer did not make —
 * what "Shared by <name>" says. `users` RLS is own-row only, so the names
 * come through `program_roster`, which answers any member of the program
 * (`user_program_ids()`). Only asked when such a view exists, so a personal
 * workspace (no shared views) never calls it. A failed read leaves every
 * name out: the tag falls back to "a teammate" rather than failing the tab.
 */
async function sharedViewCreatorNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  rows: readonly SavedViewDbRow[],
  viewerId: string,
): Promise<Map<string, string>> {
  const wanted = new Set(
    rows
      .filter((r) => r.shared && r.created_by !== viewerId)
      .map((r) => r.created_by),
  );
  if (wanted.size === 0) return new Map();

  const { data, error } = await supabase.rpc("program_roster", {
    p_program_id: accountId,
  });
  if (error) {
    console.error("[saved-views] could not read creator names", {
      error: error.message,
    });
    return new Map();
  }

  const names = new Map<string, string>();
  for (const row of (data ?? []) as {
    user_id: string;
    display_name: string | null;
  }[]) {
    const name = row.display_name?.trim();
    if (name && wanted.has(row.user_id)) names.set(row.user_id, name);
  }
  return names;
}
