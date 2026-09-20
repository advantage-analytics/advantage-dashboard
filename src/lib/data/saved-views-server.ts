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
  type SavedView,
  type SavedViewDbRow,
  type SavedViewRow,
} from "./saved-views-logic";

export type { SavedView, SavedViewRow };

const SAVED_VIEW_COLUMNS =
  "id, name, cut, chart, filters, sort_order, shared, created_by, created_at";

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

    const [{ data: rows, error }, { data: auth }] = await Promise.all([
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

    const viewerId = auth.user?.id ?? "";

    const result: SavedViewRow[] = [];
    for (const row of (rows ?? []) as SavedViewDbRow[]) {
      const mapped = rowToSavedViewRow(row, viewerId);
      if (mapped) result.push(mapped);
    }
    return result;
  },
);
