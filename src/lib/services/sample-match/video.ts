/**
 * The sample match's film — one bundled clip, read-only, for anyone signed in.
 *
 *   GET /api/sample-match/video
 *
 * `/dashboard/matches/sample` renders an anonymised report from a committed
 * fixture whose placeholder ids name no row, so the match's own
 * `GET /api/matches/[matchId]/video` cannot serve it: there is no
 * `match_video_attachments` row to read and no visibility question to ask.
 * This route answers in that route's exact envelope — `PlaybackMetadataResult`
 * with the attachment populated — so the Film view's credential-refresh hook
 * reads the sample from here with nothing changed but the URL it polls.
 *
 * ONE BLOB, NAMED HERE AND NOWHERE ELSE. {@link SAMPLE_VIDEO_BLOB} is a module
 * constant and the handler takes NO request: not the URL, not the query, not a
 * header, not a body. A `?key=` on the request is simply never seen, so there
 * is no argument through which a caller could have this route sign a different
 * object. The only thing a caller can vary is whether they are signed in.
 *
 * SESSION-GATED, NOT VISIBILITY-GATED. The sample belongs to nobody, so the
 * only question is "is there a user" — asked through the cookie client's
 * `auth.getUser()`, which validates the JWT against Supabase rather than
 * trusting the cookie's claims. No RLS read, no workspace lookup, no
 * service-role client: nothing on this path can see a real match.
 *
 * READ CREDENTIAL ONLY. `mintSas` is the pipeline's `mintPlaybackSas` — `r`
 * on one blob for thirty minutes, the same life as a match video's playback
 * URL. A deployment without Azure configured (or a signing failure) is
 * `storage_unavailable` (503) through `errorResponse()`, whose `detail` is
 * dropped in production; the Film view's unavailable state covers it, exactly
 * as it does for a real match. The blob's presence is not probed here: the
 * clip is uploaded by hand once (`sample/match-v1.mp4`), and a missing object
 * surfaces as the player's playback failure rather than a second round trip
 * on every refresh.
 *
 * Injected (`SampleVideoDeps`) so the whole thing runs in a spec with no
 * session and no Azure.
 */

import type { NextResponse } from "next/server";

import {
  matchVideoError,
  type ActiveAttachment,
  type PlaybackMetadata,
  type PlaybackMetadataResult,
} from "@/lib/match-video/types";
import {
  errorResponse,
  jsonResponse,
  transportError,
} from "@/lib/services/match-video/http";

const LOG = "[sample-match-video]";

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/**
 * The sample clip's blob name, in the match-video container. The `-v1` is the
 * replacement contract: a re-cut clip goes up under a new name and this
 * constant changes with it, so a cached player holding an old URL never finds
 * different bytes behind the same key.
 */
export const SAMPLE_VIDEO_BLOB = "sample/match-v1.mp4";

/** Thirty minutes — the pipeline's playback default, stated here explicitly. */
export const SAMPLE_VIDEO_TTL_SECONDS = 30 * 60;

/**
 * The attachment metadata the sample answers with. Fixed, because the hook's
 * refresh contract compares `id` and `version` across polls: a stable pair
 * reads as "nothing changed, only the URL was refreshed", which is always the
 * truth here. The id is a placeholder in the fixture's own
 * `00000000-0000-4000-8000-` range and names no row anywhere.
 *
 * `durationSeconds` is the one field the Film timeline reads for its clock.
 * `0` means "unknown" to `clockOf()` (the player then uses the element's own
 * duration), and stays until the clip is cut and measured.
 */
export const SAMPLE_VIDEO_ATTACHMENT: ActiveAttachment = {
  id: "00000000-0000-4000-8000-5a4d504c4531",
  version: 1,
  offsetSeconds: 0,
  confirmedVideoTimeSeconds: 0,
  durationSeconds: 0,
  contentType: "video/mp4",
  filename: "sample-match.mp4",
};

/* -------------------------------------------------------------------------
 * Seams
 * ---------------------------------------------------------------------- */

/**
 * The slice of the cookie client this route uses: `auth.getUser()` and
 * nothing else. Structural rather than `SupabaseClient` so a spec hands in a
 * three-line fake — and so the type itself says no table is ever read.
 */
export interface SampleVideoSession {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
}

export interface SampleVideoDeps {
  supabase: SampleVideoSession;
  /**
   * Read-only (`r`) SAS on one blob. Production passes `mintPlaybackSas`
   * from `splitstep/video-url/azure-sas.ts`; it throws when Azure is not
   * configured, and the handler turns that into a 503.
   */
  mintSas(params: { blobName: string; ttlSeconds: number }): {
    playbackUrl: string;
    expiresAt: Date;
  };
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

/**
 * `GET /api/sample-match/video`
 *
 * No request parameter, on purpose — and the route's `GET` declares none
 * either — so nothing a caller sends can reach the blob name or the TTL. No
 * same-origin check, for the reason `playback.ts` gives — a browser
 * sends no `Origin` on a same-origin GET, the route sets no CORS header, and
 * the answer is `private, no-store`.
 */
export async function handleGetSampleVideo(
  deps: SampleVideoDeps,
): Promise<NextResponse> {
  let userId: string | null;
  try {
    const {
      data: { user },
      error,
    } = await deps.supabase.auth.getUser();
    userId = error || !user ? null : user.id;
  } catch (cause) {
    console.error(`${LOG} unhandled session failure`, { cause });
    return errorResponse(transportError("internal_error", "unhandled"));
  }
  if (!userId) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  let credential: { playbackUrl: string; expiresAt: Date };
  try {
    credential = deps.mintSas({
      blobName: SAMPLE_VIDEO_BLOB,
      ttlSeconds: SAMPLE_VIDEO_TTL_SECONDS,
    });
  } catch (cause) {
    const detail =
      cause instanceof Error && cause.message.includes("is not set")
        ? "storage_not_configured"
        : "sas_signing_failed";
    console.error(`${LOG} could not mint the sample credential — ${detail}`, {
      cause,
    });
    return errorResponse(matchVideoError("storage_unavailable", detail));
  }

  const attachment: PlaybackMetadata = {
    ...SAMPLE_VIDEO_ATTACHMENT,
    playbackUrl: credential.playbackUrl,
    playbackExpiresAt: credential.expiresAt.toISOString(),
  };
  const result: PlaybackMetadataResult = { attachment };
  return jsonResponse(result, 200);
}
