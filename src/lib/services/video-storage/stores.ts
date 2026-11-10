/**
 * Which store holds a video, and how to sign or check it there.
 *
 * Two stores since November 2026 (`docs/r2-video-storage-plan.md`):
 * - `azure` — every upload, the vendor's trimmed copy, and any playback copy
 *   made before the worker wrote to R2.
 * - `r2` — the playback copy, and the sample clip, once moved.
 *
 * The store of a playback copy is `processing_jobs.playback_store`; null means
 * Azure, so a row written before that column existed reads correctly.
 */

import {
  mintPlaybackSas,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";

import { mintR2Playback, r2ObjectExists, resolveR2Config } from "./r2";

export type VideoStore = "azure" | "r2";

/** `processing_jobs.playback_store` as read: anything but `r2` is Azure. */
export function storeOf(value: string | null | undefined): VideoStore {
  return value === "r2" ? "r2" : "azure";
}

/**
 * The store the sample clip is read from. `SAMPLE_VIDEO_STORE=r2` once
 * `sample/match-v1.mp4` has been copied there; Azure otherwise.
 */
export function sampleVideoStore(): VideoStore {
  return process.env.SAMPLE_VIDEO_STORE === "r2" ? "r2" : "azure";
}

/** A read URL for a browser, in the given store. Throws when unconfigured. */
export function mintStoredPlayback(params: {
  key: string;
  store: VideoStore;
  ttlSeconds?: number;
}): { playbackUrl: string; expiresAt: Date } {
  if (params.store === "r2") {
    return mintR2Playback({ key: params.key, ttlSeconds: params.ttlSeconds });
  }
  return mintPlaybackSas({
    blobName: params.key,
    ttlSeconds: params.ttlSeconds,
  });
}

/**
 * Whether the object is there. Any failure — R2 not configured on this
 * deployment, a network error — reads as absent, so the player falls through
 * to the next file instead of showing nothing.
 */
export async function storedObjectExists(
  key: string,
  store: VideoStore,
): Promise<boolean> {
  if (store === "r2") {
    if (!resolveR2Config().ok) return false;
    return r2ObjectExists(key).catch(() => false);
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
