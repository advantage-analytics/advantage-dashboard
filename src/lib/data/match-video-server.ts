import { cache } from "react";

import type { MatchVideoResult } from "@/lib/match-video/types";
import {
  authorizeMatchVisibility,
  matchVideoAccessDeps,
  type MatchVideoAccessDeps,
} from "@/lib/services/match-video/access";
import type { HttpResult } from "@/lib/services/match-video/http";
import {
  azurePlaybackStorage,
  type PlaybackAttachmentRow,
} from "@/lib/services/match-video/playback";
import type { AttachmentPlaybackCredential } from "@/lib/services/match-video/storage";
import {
  mintPlaybackSas,
  resolveAzureStorageConfig,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";
import { type AdminClient, lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

import { choosePlaybackFile, type PlaybackChoice } from "./match-video-choice";
import { activeAttachment, finalObjectExists } from "./match-video-seams";

/**
 * The match video, if there is one and the viewer may watch it.
 *
 * ── Which file ──────────────────────────────────────────────────────────────
 * Two lineages, asked in this order and never merged:
 *
 *   attachment    a SwingVision import whose owner attached their own
 *                 recording. The ACTIVE `match_video_attachments` row — the
 *                 only state a viewer may ever see — carries the verified
 *                 duration and the saved alignment.
 *   provider job  the Advantage Intelligence lineage, untouched by any of the
 *                 above: our own upload when it still exists, the vendor's
 *                 re-encode otherwise. The rule and its clock live in
 *                 `match-video-choice.ts`.
 *
 * The attachment is asked first, and a match that has one never reaches the
 * job query — the two cannot both be right about the same match, and a
 * SwingVision import has no job to fall back to anyway. A match with NO active
 * attachment falls through to the job path with its selection and its legacy
 * offset exactly as they were.
 *
 * Either way it is the match video and nothing more: no dead time removed, no
 * overlays, no rally cut, so nothing may call it a highlight reel.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 * Visibility first, privilege second, and structurally so: the SELECT on
 * `matches` runs through the CALLER's client, so `visible_match_ids()` answers
 * it — creator, either player, or program membership under the roster-visible
 * rule. Only a caller who got past it reaches {@link MatchVideoDeps}'s
 * privileged seams, because those seams are only ever called below
 * {@link authorizeMatchVisibility} in {@link resolveMatchVideo}. Neither
 * `match_video_attachments` nor `processing_jobs` is readable by any client
 * role, and a signed URL is not something to mint before the row above it has
 * said yes.
 *
 * VISIBILITY, NOT OWNERSHIP — the same rule `playback.ts` (T12) applies to the
 * HTTP route this loader mirrors. A teammate who can see a match may watch its
 * video; they still cannot change it, which is `match-film-entry-server.ts`'s
 * question and not this one's.
 *
 * ── A failure is never an absence ───────────────────────────────────────────
 * An active row whose file cannot be found, reached or signed returns `null`
 * and says why in the log. It does NOT fall through to the job path: the
 * result would be a different match's footage on the same page. What it also
 * is not is "this match has no video" — the Film view asks
 * `getMatchFilmEntry()` for that, and that loader reads the same row through
 * the same seam so the player and the buttons beside it cannot disagree.
 *
 * ── What this never writes ──────────────────────────────────────────────────
 * Nothing. Attaching a video does not rewrite a single imported row and does
 * not rename its provenance: a SwingVision match stays `source_provider =
 * 'swing-vision'`, its `points` keep the source clock they were imported on,
 * and the whole shift lives in one number on the attachment row. Every seam
 * below is a read.
 */

/* -------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------- */

/**
 * Which lineage the file came from. `"attachment"` is the owner's own
 * recording; the other two are `match-video-choice.ts`'s job selection.
 */
export type MatchVideoSource = PlaybackChoice["source"] | "attachment";

/**
 * The attachment being played, when the video is one.
 *
 * `id` and `version` are the refresh contract (plan step 16, T25): a DIFFERENT
 * `id` means the video was replaced and the player must reload its source; the
 * SAME `id` with a HIGHER `version` means only the alignment was corrected, so
 * the source stands and the timeline shifts.
 */
export interface MatchVideoAttachment {
  id: string;
  version: number;
  /**
   * Server-verified duration of the published file, in seconds — measured
   * from the bytes at completion, never claimed by a client. The timeline
   * clamps padded windows to it.
   */
  durationSeconds: number;
  contentType: string;
  filename: string;
}

export interface MatchVideo {
  /** A short-lived, read-only URL straight to Azure. */
  url: string;
  expiresAt: string;
  /**
   * Seconds to SUBTRACT from `points.video_time` to seek in THIS file —
   * `filmTime = pointTime - startTimeSeconds`. `film-timeline.ts` is the one
   * place the conversion happens.
   *
   * SIGNED, and a negative value is ordinary rather than an error. For the
   * provider-job lineage it is 0 (our own upload, already on the analysis
   * clock) or the job's `start_time_seconds` (the vendor's re-encode), both
   * non-negative. For an attachment it is `firstPointSourceTime -
   * confirmedVideoTime`, which is NEGATIVE whenever the recording was rolling
   * before the source clock's first point — the common case for someone who
   * hit record and then walked onto the court. Rejecting or clamping a
   * negative offset here would push every such match's seeks off by the whole
   * lead-in.
   */
  startTimeSeconds: number;
  source: MatchVideoSource;
  /** The attachment this is, or `null` for the provider-job lineage. */
  attachment: MatchVideoAttachment | null;
}

/* -------------------------------------------------------------------------
 * Seams
 * ---------------------------------------------------------------------- */

/**
 * Every seam this loader may call, and not one of them can write.
 *
 * The three attachment seams are borrowed from `playback.ts` (T12) rather than
 * restated — the same borrowing `match-film-entry-server.ts` (T22) does — so
 * "which video, and is it really there" is answered once for the API route,
 * the Film entry actions and the player. `loadActiveAttachment` selects
 * `state = 'active'` in its WHERE clause, so a pending upload and a retired
 * one are not merely filtered out afterwards: they are never fetched.
 * `finalObjectExists` is one `Get Blob Properties` and reads no bytes.
 * `mintPlayback` returns an `AttachmentPlaybackCredential`, a type with a
 * `playbackUrl` and no `uploadUrl` at all, over the FINAL key only.
 *
 * `loadProviderVideo` is the Advantage Intelligence lineage, unchanged and
 * reached only when there is no active attachment.
 */
export interface MatchVideoDeps extends MatchVideoAccessDeps {
  loadActiveAttachment(
    matchId: string,
  ): Promise<HttpResult<PlaybackAttachmentRow | null>>;
  finalObjectExists(
    row: PlaybackAttachmentRow,
  ): Promise<MatchVideoResult<boolean>>;
  mintPlayback(
    row: PlaybackAttachmentRow,
  ): MatchVideoResult<AttachmentPlaybackCredential>;
  loadProviderVideo(matchId: string): Promise<MatchVideo | null>;
}

const LOG = "[match-video]";

/* -------------------------------------------------------------------------
 * The ladder
 * ---------------------------------------------------------------------- */

/**
 * Resolve one match's playable video.
 *
 * The order is the point. {@link authorizeMatchVisibility} runs first and
 * every other seam runs under its `ok` branch, so a caller who cannot see the
 * match causes no attachment read, no storage probe and no signature — there
 * is no path through this function that reaches a privileged seam without a
 * visible match row.
 */
export async function resolveMatchVideo(
  matchId: string,
  deps: MatchVideoDeps,
): Promise<MatchVideo | null> {
  const access = await authorizeMatchVisibility(matchId, deps);
  if (!access.ok) {
    // Absent, invisible, malformed or unreadable all end the same way for a
    // player: no source. The refusal detail is the log's business.
    if (access.error.code === "storage_unavailable") {
      console.error(`${LOG} could not read the match`, {
        matchId,
        detail: access.error.detail,
      });
    }
    return null;
  }
  const id = access.value.match.id;

  let loaded: HttpResult<PlaybackAttachmentRow | null>;
  try {
    loaded = await deps.loadActiveAttachment(id);
  } catch (cause) {
    console.error(`${LOG} unhandled attachment read failure`, {
      matchId: id,
      cause,
    });
    return null;
  }
  if (!loaded.ok) {
    console.error(`${LOG} could not read the active attachment`, {
      matchId: id,
      detail: loaded.error.detail,
    });
    return null;
  }

  const row = loaded.value;
  // No attachment is the ordinary state of every match that predates this
  // feature. The Advantage Intelligence path answers for those, exactly as it
  // always has.
  if (!row) return deps.loadProviderVideo(id);

  const context = { matchId: id, attachmentId: row.id };

  let exists: MatchVideoResult<boolean>;
  try {
    exists = await deps.finalObjectExists(row);
  } catch (cause) {
    console.error(`${LOG} unhandled storage probe failure`, {
      ...context,
      cause,
    });
    return null;
  }
  if (!exists.ok) {
    console.error(
      `${LOG} storage unreachable — ${exists.error.detail}`,
      context,
    );
    return null;
  }
  if (!exists.value) {
    console.error(`${LOG} active attachment has no final object`, context);
    return null;
  }

  const credential = deps.mintPlayback(row);
  if (!credential.ok) {
    console.error(
      `${LOG} could not mint a playback credential — ${credential.error.detail}`,
      context,
    );
    return null;
  }

  return {
    url: credential.value.playbackUrl,
    expiresAt: credential.value.expiresAt.toISOString(),
    // Signed, straight off the row. No Math.abs, no Math.max, no guard: see
    // `MatchVideo.startTimeSeconds`.
    startTimeSeconds: row.offset_seconds,
    source: "attachment",
    attachment: {
      id: row.id,
      version: row.version,
      durationSeconds: row.verified_duration_seconds,
      contentType: row.verified_content_type,
      filename: row.filename,
    },
  };
}

/* -------------------------------------------------------------------------
 * The Advantage Intelligence lineage — unchanged
 * ---------------------------------------------------------------------- */

/** Newest few jobs are plenty: a match is resubmitted a handful of times at most. */
const JOBS_CONSIDERED = 5;

/**
 * The provider-job video, selected exactly as it was before attachments
 * existed: the newest job that still has a file, our own upload preferred over
 * the vendor's re-encode, and the legacy offset — 0 for ours, the job's
 * `start_time_seconds` for theirs — carried through untouched.
 *
 * The visibility SELECT that used to open this function has moved up into
 * {@link resolveMatchVideo}, which runs it before this is ever called; nothing
 * else about the selection changed.
 */
function supabaseProviderVideo(
  admin: AdminClient,
): MatchVideoDeps["loadProviderVideo"] {
  return async (matchId) => {
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
        attachment: null,
      };
    } catch (error) {
      // Signing throws only on a misconfigured account, which is an operator
      // problem rather than a viewer's. The page shows no video; the log says why.
      console.error(`${LOG} could not sign a playback url`, {
        matchId,
        message: (error as Error)?.message,
      });
      return null;
    }
  };
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

export const getMatchVideo = cache(async function getMatchVideo(
  matchId: string,
): Promise<MatchVideo | null> {
  // Without storage credentials there is nothing to sign, and this is a normal
  // state on a deployment that has never run a video job. Returning null keeps
  // the page rendering rather than throwing on a match that never had one.
  // Both lineages sign through the same account, so one check covers both.
  if (!resolveAzureStorageConfig().ok) return null;

  const supabase = await createClient();

  // Built lazily, so a visit the visibility check refuses never constructs a
  // service-role client at all — the same helper `getMatchFilmEntry` uses.
  const adminProxy = lazyAdminClient();

  // The attachment read and the blob probe come from the shared seams, so the
  // match-detail page's `getMatchVideo` + `getMatchFilmEntry` pair costs one
  // of each rather than two. `mintPlayback` is this loader's alone.
  return resolveMatchVideo(matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    loadActiveAttachment: activeAttachment,
    finalObjectExists,
    mintPlayback: azurePlaybackStorage().mintPlayback,
    loadProviderVideo: supabaseProviderVideo(adminProxy),
  });
});
