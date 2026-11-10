/**
 * Which store holds a video, and how to sign or check it there.
 *
 * Two stores since November 2026 (`docs/r2-video-storage-plan.md`):
 * - `azure` — every upload, the vendor's trimmed copy, and any playback copy
 *   made before the worker wrote to R2.
 * - `r2` — the playback copy, and the sample clip, once moved.
 *
 * The store of a playback copy is `processing_jobs.playback_store`; null means
 * Azure. `VIDEO_READ_STORE=azure` turns every R2 read off (`store-of.ts`).
 */

import {
  mintPlaybackSas,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";

import { mintR2Playback, r2ObjectExists, resolveR2Config } from "./r2";
import { r2ReadsDisabled, storeOf, type VideoStore } from "./store-of";

export { storeOf, type VideoStore };

const LOG = "[video-storage]";

/**
 * The store the sample clip is read from. `SAMPLE_VIDEO_STORE=r2` once
 * `sample/match-v1.mp4` has been copied there; Azure otherwise, and always
 * Azure while `VIDEO_READ_STORE=azure`.
 */
export function sampleVideoStore(): VideoStore {
  return storeOf(process.env.SAMPLE_VIDEO_STORE);
}

/**
 * A read URL for a browser, in the given store. Throws when unconfigured.
 * The kill switch holds here too: no R2 URL is minted while it is on.
 */
export function mintStoredPlayback(params: {
  key: string;
  store: VideoStore;
  ttlSeconds?: number;
}): { playbackUrl: string; expiresAt: Date } {
  if (params.store === "r2" && !r2ReadsDisabled()) {
    return mintR2Playback({ key: params.key, ttlSeconds: params.ttlSeconds });
  }
  return mintPlaybackSas({
    blobName: params.key,
    ttlSeconds: params.ttlSeconds,
  });
}

/**
 * Whether the object is there. Any failure reads as absent, so the player
 * falls through to the next file instead of showing nothing — but an R2
 * failure other than "not found" (a revoked token, an outage) is logged, by
 * key and status only, so a quiet return to Azure egress has a cause on record.
 */
export async function storedObjectExists(
  key: string,
  store: VideoStore,
): Promise<boolean> {
  if (store === "r2") {
    if (r2ReadsDisabled() || !resolveR2Config().ok) return false;
    try {
      return await r2ObjectExists(key);
    } catch (error) {
      const e = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      console.error(`${LOG} R2 HEAD failed; reading from Azure instead`, {
        key,
        status: e?.$metadata?.httpStatusCode ?? null,
        name: e?.name ?? null,
      });
      return false;
    }
  }
  return videoContainerClient()
    .getBlockBlobClient(key)
    .exists()
    .catch(() => false);
}

/**
 * The sample clip's signer, in the shape `SampleVideoDeps.mintSas` takes:
 * read-only, one object, in whichever store {@link sampleVideoStore} names.
 */
export function mintSampleVideo(params: {
  blobName: string;
  ttlSeconds: number;
}): { playbackUrl: string; expiresAt: Date } {
  return mintStoredPlayback({
    key: params.blobName,
    store: sampleVideoStore(),
    ttlSeconds: params.ttlSeconds,
  });
}
