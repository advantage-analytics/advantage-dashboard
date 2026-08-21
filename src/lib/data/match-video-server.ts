import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mintPlaybackSas,
  resolveAzureStorageConfig,
} from "@/lib/services/splitstep/video-url/azure-sas";

/**
 * The match video, if there is one and the viewer may watch it.
 *
 * The pipeline has kept a video since the trimmed-capture work landed and
 * nothing has ever rendered it: `MatchVideoPanel` was orphaned and built for
 * the upload flow, and the `matches/[matchId]/video/` route CLAUDE.md once
 * described never existed. The asset was secured and unshown.
 *
 * ── What the file actually is ───────────────────────────────────────────────
 * The vendor's "trimmed" video is the `StartTime`/`EndTime` window from our own
 * job request, re-encoded — not dead time removed, no overlays, no rally cut.
 * Measured at 5181.268s against a submitted 5181.207s window. So it is called
 * the match video and nothing more; anything promising a highlight reel would
 * be describing a file that does not exist.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 * The ownership check is a SELECT on `matches` through the CALLER's client, so
 * `visible_match_ids()` answers it — creator, either player, or program
 * membership under the roster-visible rule. Only after that does the admin
 * client read the object key, because `processing_jobs` is service-role
 * territory and a key is not something to hand out before the row above it has
 * said yes.
 */

export interface MatchVideo {
  /** A short-lived, read-only URL straight to Azure. */
  url: string;
  expiresAt: string;
}

export const getMatchVideo = cache(async function getMatchVideo(
  matchId: string
): Promise<MatchVideo | null> {
  // Without storage credentials there is nothing to sign, and this is a normal
  // state on a deployment that has never run a video job. Returning null keeps
  // the page rendering rather than throwing on a match that never had one.
  if (!resolveAzureStorageConfig()) return null;

  const supabase = await createClient();

  // The authorization step. RLS decides; this file does not re-implement it.
  const { data: match } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return null;

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("processing_jobs")
    .select("trimmed_object_key")
    .eq("match_id", matchId)
    .not("trimmed_object_key", "is", null)
    // A resubmitted match has several jobs; the newest trimmed copy is the one
    // matching whatever analysis the page is showing.
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const blobName = job?.trimmed_object_key as string | undefined;
  if (!blobName) return null;

  try {
    const { playbackUrl, expiresAt } = mintPlaybackSas({ blobName });
    return { url: playbackUrl, expiresAt: expiresAt.toISOString() };
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
