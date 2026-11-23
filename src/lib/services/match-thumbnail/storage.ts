/**
 * Where a match thumbnail's bytes live: the video container, beside the
 * upload it was taken from, under `thumbnails/{matchId}/`.
 *
 * Azure rather than R2, where the playback copy is: this deployment holds
 * R2's read token only, and a thumbnail has to be written and deleted by the
 * app. At ~15 KB an image, the egress R2 exists to avoid is not a cost.
 *
 * The only file in this lane that reaches storage, so swapping the store is a
 * change to this file alone.
 *
 * SERVER ONLY — imports `@azure/storage-blob` through `azure-sas.ts`.
 */

import {
  isThumbnailKeyFor,
  THUMBNAIL_CONTENT_TYPE,
  thumbnailPrefixFor,
} from "@/lib/match-thumbnail";
import {
  mintPlaybackSas,
  resolveAzureStorageConfig,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";

/**
 * A thumbnail's name is never rewritten (a new image gets a new key), so the
 * browser may reuse it without asking. A day, private: the URL is a signed
 * read for one viewer and must not sit in a shared cache.
 */
export const THUMBNAIL_CACHE_CONTROL = "private, max-age=86400, immutable";

/** Signed for at least this long; snapped to the playback window. */
const THUMBNAIL_URL_TTL_SECONDS = 60 * 60;

export interface ThumbnailStorage {
  /** False when no store is configured: nothing is written or signed. */
  available(): boolean;
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** A read-only URL for one image. Local signing, no network. */
  sign(key: string): string;
  /** One image. Absent is success. */
  delete(key: string): Promise<void>;
  /** Every image stored for these matches. Absent is success. */
  deleteAllFor(matchIds: readonly string[]): Promise<number>;
}

export function azureThumbnailStorage(): ThumbnailStorage {
  return {
    available() {
      return resolveAzureStorageConfig().ok;
    },

    async put(key, bytes) {
      await videoContainerClient()
        .getBlockBlobClient(key)
        .uploadData(Buffer.from(bytes), {
          blobHTTPHeaders: {
            blobContentType: THUMBNAIL_CONTENT_TYPE,
            blobCacheControl: THUMBNAIL_CACHE_CONTROL,
          },
        });
    },

    sign(key) {
      return mintPlaybackSas({
        blobName: key,
        ttlSeconds: THUMBNAIL_URL_TTL_SECONDS,
        cacheControl: THUMBNAIL_CACHE_CONTROL,
      }).playbackUrl;
    },

    async delete(key) {
      await videoContainerClient().getBlockBlobClient(key).deleteIfExists();
    },

    async deleteAllFor(matchIds) {
      const container = videoContainerClient();
      let deleted = 0;
      for (const matchId of matchIds) {
        // By prefix, not by the column: it also collects an image whose row
        // write never landed, and it works after the match row is gone.
        const prefix = thumbnailPrefixFor(matchId);
        for await (const blob of container.listBlobsFlat({ prefix })) {
          if (!isThumbnailKeyFor(matchId, blob.name)) continue;
          const response = await container
            .getBlockBlobClient(blob.name)
            .deleteIfExists();
          if (response.succeeded) deleted += 1;
        }
      }
      return deleted;
    },
  };
}
