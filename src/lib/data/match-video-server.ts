import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mintPlaybackSas,
  resolveAzureStorageConfig,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";

import { choosePlaybackFile, type PlaybackChoice } from "./match-video-choice";

/**
 * The match video, if there is one and the viewer may watch it.
 *
 * ── Which file ──────────────────────────────────────────────────────────────
 * Our own upload when it still exists, the vendor's re-encode otherwise — the
 * rule and its clock live in `match-video-choice.ts`. Either way it is the
 * match video and nothing more: no dead time removed, no overlays, no rally
 * cut, so nothing may call it a highlight reel.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 * The ownership check is a SELECT on `matches` through the CALLER's client, so
 * `visible_match_ids()` answers it — creator, either player, or program
 * membership under the roster-visible rule. Only after that does the admin
 * client read the object keys, because `processing_jobs` is service-role
 * territory and a key is not something to hand out before the row above it has
 * said yes.
 */

export interface MatchVideo {
  /** A short-lived, read-only URL straight to Azure. */
  url: string;
  expiresAt: string;
  /**
   * Seconds to subtract from `points.video_time` to seek in THIS file — 0 for
   * our own upload, the job's `start_time_seconds` for the vendor's re-encode.
   * `film-timeline.ts` is the one place the conversion happens.
   */
  startTimeSeconds: number;
  source: PlaybackChoice["source"];
}

/** Newest few jobs are plenty: a match is resubmitted a handful of times at most. */
const JOBS_CONSIDERED = 5;

export const getMatchVideo = cache(async function getMatchVideo(
  matchId: string,
): Promise<MatchVideo | null> {
  // Without storage credentials there is nothing to sign, and this is a normal
  // state on a deployment that has never run a video job. Returning null keeps
  // the page rendering rather than throwing on a match that never had one.
  if (!resolveAzureStorageConfig().ok) return null;

  const supabase = await createClient();

  // The authorization step. RLS decides; this file does not re-implement it.
  const { data: match } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return null;

  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("processing_jobs")
    .select("video_object_key, trimmed_object_key, start_time_seconds")
    .eq("match_id", matchId)
    .or("video_object_key.not.is.null,trimmed_object_key.not.is.null")
    .order("created_at", { ascending: false })
    .limit(JOBS_CONSIDERED);

  try {
    const container = videoContainerClient();
    const choice = await choosePlaybackFile(jobs ?? [], (blobName) =>
      container
        .getBlockBlobClient(blobName)
        .exists()
        .catch(() => false),
    );
    if (!choice) return null;

    const { playbackUrl, expiresAt } = mintPlaybackSas({
      blobName: choice.blobName,
    });
    return {
      url: playbackUrl,
      expiresAt: expiresAt.toISOString(),
      startTimeSeconds: choice.startTimeSeconds,
      source: choice.source,
    };
  } catch (error) {
    // Signing throws only on a misconfigured account, which is an operator
    // problem rather than a viewer's. The page shows no video; the log says why.
    console.error("[match-video] could not sign a playback url", {
      matchId,
      message: (error as Error)?.message,
    });
    return null;
  }
});
