/**
 * `POST /api/matches/[matchId]/video/thumbnail` — store the still the browser
 * captured from the video it is uploading.
 *
 * The body is the image itself (`image/jpeg`, at most
 * {@link THUMBNAIL_MAX_BYTES}), not a credential request: at ~15 KB there is
 * nothing to gain from a direct-to-storage upload, and taking the bytes here
 * means the server sees what it stores.
 *
 * Order: same-origin, sign-in and RLS visibility
 * (`authorizeMatchVisibility`), creator, then the body. Only the match's
 * creator may set its thumbnail — the same person who may attach its video —
 * and a caller who cannot see the match gets the same 404 as for one that
 * does not exist.
 *
 * The image is client-supplied, so it is trusted for nothing: it must be a
 * JPEG by its own first bytes, it is stored and served as `image/jpeg`
 * whatever the request claimed, and it is only ever rendered in an `<img>`.
 *
 * Best effort by contract: the wizard fires this beside the real upload and
 * ignores the answer. A match without a thumbnail draws its fallback.
 *
 * Dependency-injected so the refusal ladder runs in a spec with no session,
 * database or storage (`tests/match-thumbnail.spec.ts`).
 */

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

import {
  isThumbnailKeyFor,
  looksLikeJpeg,
  THUMBNAIL_CONTENT_TYPE,
  THUMBNAIL_MAX_BYTES,
  thumbnailObjectKey,
} from "@/lib/match-thumbnail";
import { matchVideoError } from "@/lib/match-video/types";
import {
  authorizeMatchVisibility,
  type MatchVideoAccessDeps,
} from "@/lib/services/match-video/access";
import {
  checkSameOrigin,
  errorResponse,
  jsonResponse,
  transportError,
  type HttpResult,
} from "@/lib/services/match-video/http";

import type { ThumbnailStorage } from "./storage";

const LOG = "[match-thumbnail]";

export interface UploadThumbnailDeps extends MatchVideoAccessDeps {
  allowedOrigins?: readonly string[];
  storage: Pick<ThumbnailStorage, "available" | "put" | "delete">;
  /** The match's current key, through the caller's client. */
  readKey(
    matchId: string,
  ): Promise<{ key: string | null; error: string | null }>;
  /** Set the key, through the caller's client. Null on success. */
  writeKey(matchId: string, key: string): Promise<string | null>;
  /** Test seam; production mints a random UUID. */
  mintImageId?: () => string;
}

export interface UploadThumbnailResult {
  stored: true;
}

export async function handleUploadThumbnail(
  request: Request,
  matchId: string,
  deps: UploadThumbnailDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  const access = await authorizeMatchVisibility(matchId, deps);
  if (!access.ok) return errorResponse(access.error);

  const { actor, match } = access.value;
  if (match.created_by !== actor.id) {
    return errorResponse(matchVideoError("forbidden", "not_creator"));
  }

  const body = await readImage(request);
  if (!body.ok) return errorResponse(body.error);

  if (!deps.storage.available()) {
    return errorResponse(
      matchVideoError("storage_unavailable", "not_configured"),
    );
  }

  const previous = await deps.readKey(match.id);
  const key = thumbnailObjectKey(match.id, (deps.mintImageId ?? randomUUID)());

  try {
    await deps.storage.put(key, body.value);
  } catch (cause) {
    console.error(`${LOG} could not store`, {
      matchId: match.id,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return errorResponse(matchVideoError("storage_unavailable", "put_failed"));
  }

  const writeError = await deps.writeKey(match.id, key);
  if (writeError) {
    console.error(`${LOG} could not record the key`, {
      matchId: match.id,
      error: writeError,
    });
    // The row does not name the image, so nothing would ever show or
    // collect it. Take it back now.
    await deps.storage.delete(key).catch(() => undefined);
    return errorResponse(
      matchVideoError("storage_unavailable", "key_write_failed"),
    );
  }

  // The image this one replaces. Only a key of this match's own shape is
  // ever deleted: the column is user-writable, and a planted key must not
  // turn this route into "delete any blob".
  if (
    previous.key &&
    previous.key !== key &&
    isThumbnailKeyFor(match.id, previous.key)
  ) {
    await deps.storage.delete(previous.key).catch((cause: unknown) => {
      console.error(`${LOG} could not delete the replaced image`, {
        matchId: match.id,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    });
  }

  const result: UploadThumbnailResult = { stored: true };
  return jsonResponse(result, 200);
}

/** The body as bytes: capped while it is read, and a JPEG by its content. */
async function readImage(request: Request): Promise<HttpResult<Uint8Array>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > THUMBNAIL_MAX_BYTES) {
    return fail(transportError("request_too_large", "content_length"));
  }
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== THUMBNAIL_CONTENT_TYPE) {
    return fail(transportError("invalid_request", "content_type"));
  }
  if (!request.body) return fail(transportError("invalid_request", "no_body"));

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > THUMBNAIL_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return fail(transportError("request_too_large", "body_stream"));
      }
      chunks.push(value);
    }
  } catch {
    return fail(transportError("invalid_request", "body_unreadable"));
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!looksLikeJpeg(bytes)) {
    return fail(transportError("invalid_request", "not_a_jpeg"));
  }
  return { ok: true, value: bytes };
}

function fail(error: ReturnType<typeof transportError>): HttpResult<never> {
  return { ok: false, error };
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

/**
 * The key's read and write over the CALLER's client: `matches`' own policies
 * ("Users can update own matches") are the write rule, rechecked by the
 * database after the handler's creator check.
 */
export function supabaseThumbnailKeyStore(
  supabase: SupabaseClient,
): Pick<UploadThumbnailDeps, "readKey" | "writeKey"> {
  return {
    async readKey(matchId) {
      const { data, error } = await supabase
        .from("matches")
        .select("video_thumbnail_key")
        .eq("id", matchId)
        .maybeSingle();
      return {
        key:
          (data as { video_thumbnail_key: string | null } | null)
            ?.video_thumbnail_key ?? null,
        error: error?.message ?? null,
      };
    },
    async writeKey(matchId, key) {
      const { data, error } = await supabase
        .from("matches")
        .update({ video_thumbnail_key: key })
        .eq("id", matchId)
        .select("id");
      if (error) return error.message;
      // RLS hides a row it will not update: no error, no row.
      return (data ?? []).length === 1 ? null : "no_row_updated";
    },
  };
}
