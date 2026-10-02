/**
 * Plan step 8, playback half — what a viewer needs to watch a match's video,
 * and nothing they would need to change it.
 *
 *   GET /api/matches/[matchId]/video
 *
 * VISIBILITY, NOT OWNERSHIP. This is the one attachment endpoint that calls
 * {@link authorizeMatchVisibility} rather than `authorizeMatchVideoMutation`.
 * A teammate who can see a match may watch its video; the same person is
 * still refused by every route that reserves, renews, cancels, completes or
 * aligns, because those ask the second question — creator, SwingVision
 * provenance, exact active workspace — that this one deliberately does not.
 * Using the mutation helper here would not be "safer": it would deny a coach
 * the recording of a match they are looking at, for no security gain, since
 * the caller can already see the match row itself.
 *
 * READ CREDENTIAL ONLY, AND STRUCTURALLY SO. {@link PlaybackDeps} is the
 * complete list of what this path may call, and neither seam can produce a
 * write credential: `mintPlayback` returns Azure's
 * `AttachmentPlaybackCredential` — a type with a `playbackUrl` and no
 * `uploadUrl` at all — and the production wiring reaches it only through
 * `mintAttachmentPlaybackCredential`, whose input is the ROW and whose SAS
 * names the FINAL key with `r`. There is no argument anywhere on this path
 * through which the staged key could be signed, or named. The staged key is
 * not even part of the row shape this module reads.
 *
 * NO ACTIVE ATTACHMENT IS AN ANSWER, NOT AN ERROR. A SwingVision match with
 * no video responds `200 {"attachment": null}`. A 404 would be a claim about
 * the MATCH, which the caller can plainly see; and the null is the same key,
 * in the same envelope, as the populated answer, so a client branches on one
 * field rather than on a status code. Note what the body does NOT carry: no
 * mode, no reservation hint, no upload URL, nothing a client could mistake
 * for permission or an invitation to create an attachment. A client that goes
 * on to reserve one still sends `expectedActive: null` and still has T3's
 * unique index arbitrate it — "there is no video" is information, never a
 * licence to add a second.
 *
 * ID AND VERSION ARE THE REFRESH CONTRACT. A client holding a playback URL
 * polls this route as the credential nears expiry (plan step 16). A DIFFERENT
 * `id` means the video was replaced and the player must reload its source; the
 * SAME `id` with a HIGHER `version` means only the alignment was corrected, so
 * the source stands and the timeline shifts. Same id and same version means
 * nothing changed and only the URL was refreshed. That is exactly why both
 * fields are returned even though a URL alone would play.
 *
 * A MISSING OBJECT AND AN UNREACHABLE STORE ARE DIFFERENT ANSWERS. An active
 * row whose final blob is not there is `stale_attachment` (409): the row and
 * storage have parted company, which is what every other `stale_attachment`
 * in this feature means, and it is the answer a client must not retry into a
 * loop. A store that cannot be asked is `storage_unavailable` (503), which a
 * client should retry. Folding the first into the second would have viewers
 * retrying a file that is never coming back; folding it into `attachment:
 * null` would be worse still — it would tell a creator their match has no
 * video and invite them to upload a duplicate over a row that is still active.
 *
 * Injected (`PlaybackDeps`) so the whole ladder runs in a spec with no
 * session, no database and no Azure.
 */

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  matchVideoError,
  ok,
  type MatchVideoResult,
  type PlaybackMetadata,
  type PlaybackMetadataResult,
} from "@/lib/match-video/types";

import { authorizeMatchVisibility, type MatchVideoAccessDeps } from "./access";
import {
  errorResponse,
  jsonResponse,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "./http";
import { publishedBlobOf } from "./probe";
import {
  inspectAttachmentBlob,
  mintAttachmentPlaybackCredential,
  type AttachmentPlaybackCredential,
} from "./storage";

const LOG = "[match-video-playback]";

/* -------------------------------------------------------------------------
 * Row shape
 * ---------------------------------------------------------------------- */

/**
 * The columns playback reads off the ACTIVE `match_video_attachments` row.
 *
 * Narrow on purpose, and note the two omissions. `staged_blob_key` is absent,
 * so nothing on this path can name the writable object even by accident; the
 * lease, copy and cleanup bookkeeping is absent because a viewer has no
 * business knowing an upload ever happened.
 *
 * Every verified column is non-nullable here although the table declares them
 * nullable: T2's `match_video_attachments_active_verified_check` guarantees an
 * ACTIVE row carries all of them, and this shape only ever describes an active
 * row. The production seam rechecks the state in its `where` clause.
 */
export interface PlaybackAttachmentRow {
  id: string;
  version: number;
  offset_seconds: number;
  confirmed_video_time_seconds: number;
  verified_duration_seconds: number;
  verified_content_type: string;
  filename: string;
  final_blob_key: string;
}

/**
 * `final_blob_key` is all {@link publishedBlobOf} needs, but its parameter is
 * T6's row shape. The staged key is filled with the final one's value for the
 * call and goes nowhere else: `publishedBlobOf` reads `final_blob_key` only,
 * and this module has no function that signs a staged name.
 */
function finalBlobOf(row: PlaybackAttachmentRow) {
  return publishedBlobOf({
    staged_blob_key: row.final_blob_key,
    final_blob_key: row.final_blob_key,
    source_etag: null,
  });
}

/* -------------------------------------------------------------------------
 * Seams
 * ---------------------------------------------------------------------- */

/**
 * Two seams, and neither can write.
 *
 * `loadActiveAttachment` answers `null` for a match with no video — a normal
 * outcome, not an error, which is why it is inside the `ok` case rather than
 * a refusal. `finalObjectExists` is one `Get Blob Properties`; it reads no
 * bytes, because there are none this endpoint needs. `mintPlayback` returns a
 * read-only credential whose type has no upload field.
 */
export interface PlaybackDeps extends MatchVideoAccessDeps {
  loadActiveAttachment(
    matchId: string,
  ): Promise<HttpResult<PlaybackAttachmentRow | null>>;
  /** `false` when nothing is at the final key. Never reads bytes. */
  finalObjectExists(
    row: PlaybackAttachmentRow,
  ): Promise<MatchVideoResult<boolean>>;
  /** Read-only (`r`) SAS on the final key. There is no upload counterpart. */
  mintPlayback(
    row: PlaybackAttachmentRow,
  ): MatchVideoResult<AttachmentPlaybackCredential>;
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

/**
 * `GET /api/matches/[matchId]/video`
 *
 * No same-origin check, deliberately, and it is not an omission. A browser
 * sends no `Origin` on a same-origin GET, so `checkSameOrigin` — written for
 * mutations, as its own comment says — would refuse every legitimate call.
 * What protects the credential instead is that this route sets no CORS
 * header of any kind: a cross-site page can cause the request but can never
 * read the response, and the answer is `private, no-store` so no shared cache
 * holds it either. Nothing here changes state, so there is nothing a blind
 * cross-site request could accomplish.
 */
export async function handleGetPlayback(
  _request: Request,
  matchId: string,
  deps: PlaybackDeps,
): Promise<NextResponse> {
  const access = await authorizeMatchVisibility(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} refused — ${access.error.detail}`, { matchId });
    return errorResponse(access.error);
  }

  let loaded: HttpResult<PlaybackAttachmentRow | null>;
  try {
    loaded = await deps.loadActiveAttachment(access.value.match.id);
  } catch (cause) {
    console.error(`${LOG} unhandled failure`, { matchId, cause });
    return errorResponse(transportError("internal_error", "unhandled"));
  }
  if (!loaded.ok) return errorResponse(loaded.error);

  const row = loaded.value;
  if (!row) {
    // The normal empty answer. Same envelope, same key, nothing to act on.
    const empty: PlaybackMetadataResult = { attachment: null };
    return jsonResponse(empty, 200);
  }

  const context = { matchId, attachmentId: row.id };

  let exists: MatchVideoResult<boolean>;
  try {
    exists = await deps.finalObjectExists(row);
  } catch (cause) {
    console.error(`${LOG} unhandled failure`, { ...context, cause });
    return errorResponse(transportError("internal_error", "unhandled"));
  }
  if (!exists.ok) {
    console.error(
      `${LOG} storage unreachable — ${exists.error.detail}`,
      context,
    );
    return errorResponse(exists.error);
  }
  if (!exists.value) {
    // Active, but the published object is gone. Not a retry, and emphatically
    // not "this match has no video".
    console.error(`${LOG} active attachment has no final object`, context);
    return errorResponse(
      matchVideoError("stale_attachment", "final_object_missing"),
    );
  }

  const credential = deps.mintPlayback(row);
  if (!credential.ok) {
    console.error(
      `${LOG} could not mint playback credential — ${credential.error.detail}`,
      context,
    );
    return errorResponse(credential.error);
  }

  const attachment: PlaybackMetadata = {
    id: row.id,
    version: row.version,
    offsetSeconds: row.offset_seconds,
    confirmedVideoTimeSeconds: row.confirmed_video_time_seconds,
    durationSeconds: row.verified_duration_seconds,
    contentType: row.verified_content_type,
    filename: row.filename,
    playbackUrl: credential.value.playbackUrl,
    playbackExpiresAt: credential.value.expiresAt.toISOString(),
  };
  const result: PlaybackMetadataResult = { attachment };
  return jsonResponse(result, 200);
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

const ATTACHMENTS_TABLE = "match_video_attachments";

/**
 * The active row, through the SERVICE-ROLE client.
 *
 * `match_video_attachments` has no RLS policy and no grant to any client role
 * (T2), so this is the only way to read it — and it is safe here precisely
 * because {@link handleGetPlayback} has already asked `matches` through the
 * CALLER's client and been told the match exists for them. The service role
 * answers "which video", never "may you".
 *
 * `state = 'active'` is in the `where` clause, not checked afterwards: a
 * pending attempt is someone's in-progress upload and a retired one is
 * awaiting deletion, and neither is anything a viewer should learn about. The
 * partial unique index makes at most one row match.
 */
export function supabaseActiveAttachment(
  admin: SupabaseClient,
): PlaybackDeps["loadActiveAttachment"] {
  return async (matchId) => {
    const { data, error } = await admin
      .from(ATTACHMENTS_TABLE)
      .select(
        "id, version, offset_seconds, confirmed_video_time_seconds, " +
          "verified_duration_seconds, verified_content_type, filename, " +
          "final_blob_key",
      )
      .eq("match_id", matchId)
      .eq("state", "active")
      .maybeSingle();

    if (error) {
      console.error(`${LOG} could not read the active attachment`, {
        matchId,
        sqlstate: error.code,
        message: error.message,
      });
      return {
        ok: false,
        error: transportError("internal_error", "attachment_read_failed"),
      };
    }
    if (!data) return ok(null);

    const row = data as unknown as Record<string, unknown>;
    return ok<PlaybackAttachmentRow>({
      id: String(row.id),
      version: Number(row.version),
      offset_seconds: Number(row.offset_seconds),
      // `numeric` arrives as a string from PostgREST.
      confirmed_video_time_seconds: Number(row.confirmed_video_time_seconds),
      verified_duration_seconds: Number(row.verified_duration_seconds),
      verified_content_type: String(row.verified_content_type),
      filename: String(row.filename),
      final_blob_key: String(row.final_blob_key),
    });
  };
}

/**
 * The Azure seams: one properties read and one read-only signature, both on
 * the final key and both reached through {@link finalBlobOf}, whose branded
 * result T6 will only mint from a row.
 */
export function azurePlaybackStorage(): Pick<
  PlaybackDeps,
  "finalObjectExists" | "mintPlayback"
> {
  return {
    async finalObjectExists(row) {
      const blob = finalBlobOf(row);
      if (!blob.ok) return blob;
      const head = await inspectAttachmentBlob(blob.value);
      if (!head.ok) return head;
      return ok(head.value !== null);
    },

    mintPlayback(row) {
      return mintAttachmentPlaybackCredential({
        id: row.id,
        staged_blob_key: row.final_blob_key,
        final_blob_key: row.final_blob_key,
        source_etag: null,
      });
    },
  };
}

export type { MatchVideoHttpError };
