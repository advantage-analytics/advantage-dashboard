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

let warnedUnconfigured = false;

/**
 * A row says a copy is in R2, but this deployment cannot read R2: say so,
 * once per process, naming the variable and never its value. Without it, a
 * bad Vercel value turns every R2 read into an Azure read with nothing in
 * the logs (found in production 2026-11-10).
 */
function warnR2Unconfigured(missing: string): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  console.warn(
    `${LOG} R2 is not configured (${missing}); reading from Azure instead`,
  );
}

/** Specs only: forget the once-per-process warning. */
export function resetR2ConfigWarningForTests(): void {
  warnedUnconfigured = false;
}

/**
 * The store the sample clip is read from. `SAMPLE_VIDEO_STORE=r2` once
 * `sample/match-v1.mp4` has been copied there; Azure otherwise, and always
 * Azure while `VIDEO_READ_STORE=azure`.
 */
export function sampleVideoStore(): VideoStore {
  return storeOf(process.env.SAMPLE_VIDEO_STORE);
}

/**
 * A read URL for a browser, in the given store. The kill switch holds here
 * too: no R2 URL is minted while it is on. An R2 request on a deployment
 * that cannot read R2 is signed in Azure, with a one-time warning.
 */
export function mintStoredPlayback(params: {
  key: string;
  store: VideoStore;
  ttlSeconds?: number;
}): { playbackUrl: string; expiresAt: Date } {
  if (params.store === "r2" && !r2ReadsDisabled()) {
    const r2 = resolveR2Config();
    if (r2.ok) {
      return mintR2Playback({ key: params.key, ttlSeconds: params.ttlSeconds });
    }
    // Only the sample reaches here unconfigured (match loaders confirm the
    // copy first): sign the same key in Azure rather than fail.
    warnR2Unconfigured(r2.missing);
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
    if (r2ReadsDisabled()) return false;
    const r2 = resolveR2Config();
    if (!r2.ok) {
      warnR2Unconfigured(r2.missing);
      return false;
    }
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
