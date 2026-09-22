/**
 * Server loader for the Visualizations tab's depth/contact bands (P2B Task
 * 1) — one record per workspace, read through the cookie-authenticated
 * server client (never `admin.ts`); `public.viz_band_settings` RLS scopes
 * what a member may see.
 *
 * Mirrors `saved-views-server.ts`'s shape: wrapped in React `cache()`, and
 * never throws — a missing row, a query error, or an auth read failure all
 * fall back to `DEFAULT_BANDS` so the Visualizations tab always has a
 * complete `BandSettings` to render against.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_BANDS,
  rowToBandSettings,
  type BandSettings,
  type BandSettingsDbRow,
} from "./viz-bands";
import { BAND_COLUMNS } from "./viz-bands-write";

export type { BandSettings };

/**
 * The band settings the active workspace (`accountId` = `Workspace.id`)
 * follows. No row (a workspace that has never saved custom bands) resolves
 * to `DEFAULT_BANDS`, not an error.
 */
export const getBandSettings = cache(
  async (accountId: string): Promise<BandSettings> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("viz_band_settings")
        .select(BAND_COLUMNS)
        .eq("account_id", accountId)
        .maybeSingle();

      if (error) {
        console.error("[viz-bands] could not load band settings", {
          error: error.message,
        });
        return DEFAULT_BANDS;
      }

      return rowToBandSettings((data as BandSettingsDbRow | null) ?? null);
    } catch (error) {
      console.error("[viz-bands] unexpected error loading band settings", {
        error,
      });
      return DEFAULT_BANDS;
    }
  },
);
