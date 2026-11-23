/**
 * Take a match's thumbnail down once the match has no video left.
 *
 * Called by the attachment cleanup worker after it has collected a retired
 * attachment's video (a removal, a replacement or an expiry). A thumbnail of
 * a video nobody can play any more is a frame of footage the person removed,
 * so it goes with it.
 *
 * "No video left" is asked of the database, not assumed: a replacement
 * retires one attachment while another is already in place, and that match
 * keeps its thumbnail — the new upload stored its own.
 *
 * Match deletion does not come through here: `purgeMatchStorage` deletes by
 * prefix, since the row is about to go.
 *
 * Best effort. Never throws; a failure leaves the image for the next run or
 * for the match's own deletion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { azureThumbnailStorage, type ThumbnailStorage } from "./storage";

const LOG = "[match-thumbnail]";

export interface ClearThumbnailDeps {
  /** True when the match still has any video: an attachment or a job's. */
  hasVideo(matchId: string): Promise<boolean>;
  /** Null the column. */
  clearKey(matchId: string): Promise<string | null>;
  storage: Pick<ThumbnailStorage, "available" | "deleteAllFor">;
}

export type ClearThumbnailOutcome = "kept" | "cleared" | "skipped" | "failed";

export async function clearThumbnailIfVideoGone(
  matchId: string,
  deps: ClearThumbnailDeps,
): Promise<ClearThumbnailOutcome> {
  try {
    if (await deps.hasVideo(matchId)) return "kept";
    if (!deps.storage.available()) return "skipped";

    // Column first: a row that names a deleted image would draw a broken
    // picture, while an image no row names is only a few stranded kilobytes
    // the match's own deletion collects.
    const error = await deps.clearKey(matchId);
    if (error) {
      console.error(`${LOG} could not clear the key`, { matchId, error });
      return "failed";
    }
    await deps.storage.deleteAllFor([matchId]);
    return "cleared";
  } catch (cause) {
    console.error(`${LOG} clear threw`, {
      matchId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return "failed";
  }
}

/** Production deps over the service-role client the cleanup worker holds. */
export function productionClearThumbnailDeps(
  admin: SupabaseClient,
): ClearThumbnailDeps {
  return {
    async hasVideo(matchId) {
      const attachments = await admin
        .from("match_video_attachments")
        .select("id", { count: "exact", head: true })
        .eq("match_id", matchId)
        .neq("state", "retired");
      // Unreadable is "yes": never delete on a question that went unanswered.
      if (attachments.error) return true;
      if ((attachments.count ?? 0) > 0) return true;

      const jobs = await admin
        .from("processing_jobs")
        .select("id", { count: "exact", head: true })
        .eq("match_id", matchId)
        .or(
          "video_object_key.not.is.null,trimmed_object_key.not.is.null,playback_object_key.not.is.null",
        );
      if (jobs.error) return true;
      return (jobs.count ?? 0) > 0;
    },
    async clearKey(matchId) {
      const { error } = await admin
        .from("matches")
        .update({ video_thumbnail_key: null })
        .eq("id", matchId);
      return error?.message ?? null;
    },
    storage: azureThumbnailStorage(),
  };
}
