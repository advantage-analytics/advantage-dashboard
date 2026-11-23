/**
 * Thumbnail URLs for a list of matches, in one pass and with no request per
 * row: signing is local, so six rows cost six HMACs.
 *
 * ── Who may see one ─────────────────────────────────────────────────────────
 * A thumbnail inherits its match's visibility, and there are exactly two ways
 * in, both of which start from a `matches` row the CALLER's own client
 * returned, so RLS has already answered "may you see this match":
 *
 *   {@link signMatchThumbnails}   for a loader that already holds such rows —
 *                                 add `video_thumbnail_key` to its select and
 *                                 pass them through.
 *   {@link getMatchThumbnailUrls} reads the rows itself, through the caller's
 *                                 client. An id the caller cannot see comes
 *                                 back from RLS as no row, so it gets no URL.
 *
 * Never pass rows read with the service role: this module cannot tell, and
 * would sign them.
 *
 * Every key is checked against its own match id first (`isThumbnailKeyFor`):
 * the column is writable by the match's creator, and an unchecked key would
 * sign any blob in the container.
 *
 * SERVER ONLY.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isThumbnailKeyFor } from "@/lib/match-thumbnail";
import {
  azureThumbnailStorage,
  type ThumbnailStorage,
} from "@/lib/services/match-thumbnail/storage";

const LOG = "[match-thumbnails]";

export interface MatchThumbnailRow {
  id: string;
  video_thumbnail_key: string | null;
}

/** Match id → image URL. A match with no thumbnail has no entry. */
export type MatchThumbnailUrls = Record<string, string>;

/**
 * Sign the thumbnails of rows the caller was allowed to read.
 *
 * Never throws and never fails the page: a missing store, a planted key or a
 * signing error all end as "no entry", and the row draws its fallback.
 */
export function signMatchThumbnails(
  rows: readonly MatchThumbnailRow[],
  storage: Pick<
    ThumbnailStorage,
    "available" | "sign"
  > = azureThumbnailStorage(),
): MatchThumbnailUrls {
  const urls: MatchThumbnailUrls = {};
  let available: boolean | null = null;

  for (const row of rows) {
    if (!row.video_thumbnail_key) continue;
    if (!isThumbnailKeyFor(row.id, row.video_thumbnail_key)) {
      console.error(`${LOG} refused a key outside its match's prefix`, {
        matchId: row.id,
      });
      continue;
    }
    available ??= storage.available();
    if (!available) return urls;
    try {
      urls[row.id] = storage.sign(row.video_thumbnail_key);
    } catch (cause) {
      console.error(`${LOG} could not sign`, {
        matchId: row.id,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return urls;
}

/**
 * Thumbnail URLs for `matchIds`, read through `supabase` — which MUST be the
 * signed-in caller's client, so RLS decides which of the ids exist for them.
 */
export async function getMatchThumbnailUrls(
  supabase: SupabaseClient,
  matchIds: readonly string[],
  storage?: Pick<ThumbnailStorage, "available" | "sign">,
): Promise<MatchThumbnailUrls> {
  const ids = [...new Set(matchIds)];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("matches")
    .select("id, video_thumbnail_key")
    .in("id", ids)
    .not("video_thumbnail_key", "is", null);

  if (error) {
    console.error(`${LOG} could not read thumbnail keys`, {
      message: error.message,
    });
    return {};
  }
  return signMatchThumbnails((data ?? []) as MatchThumbnailRow[], storage);
}
