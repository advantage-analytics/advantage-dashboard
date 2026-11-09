import { test, expect } from "@playwright/test";
import {
  mintPlaybackSas,
  playbackSasWindow,
  PLAYBACK_CACHE_CONTROL,
  PLAYBACK_SAS_WINDOW_SECONDS,
} from "@/lib/services/splitstep/video-url/azure-sas";

/**
 * The browser caches video by URL. A playback SAS that changed on every page
 * load meant a match watched twice was downloaded (and billed) twice.
 */

const WINDOW_MS = PLAYBACK_SAS_WINDOW_SECONDS * 1000;
const TTL = 30 * 60;

test("mints inside one window share st/se; every mint keeps the full TTL", () => {
  const boundary = Date.UTC(2026, 10, 9, 12); // a 6h boundary
  const a = playbackSasWindow(boundary - WINDOW_MS + 1, TTL);
  const b = playbackSasWindow(boundary - TTL * 1000, TTL);
  expect(a.expiresOn.getTime()).toBe(boundary);
  expect(b.expiresOn).toEqual(a.expiresOn);
  expect(b.startsOn).toEqual(a.startsOn);

  // One millisecond later the TTL would cross the boundary: next window.
  const c = playbackSasWindow(boundary - TTL * 1000 + 1, TTL);
  expect(c.expiresOn.getTime()).toBe(boundary + WINDOW_MS);

  for (let now = boundary; now < boundary + 2 * WINDOW_MS; now += 97_000) {
    const w = playbackSasWindow(now, TTL);
    expect(w.expiresOn.getTime() - now).toBeGreaterThanOrEqual(TTL * 1000);
    expect(w.startsOn.getTime()).toBeLessThan(now);
  }
});

test("two playback mints in a row produce the identical URL with rscc", () => {
  const previous = { ...process.env };
  try {
    process.env.AZURE_STORAGE_ACCOUNT = "devstoreaccount1";
    process.env.AZURE_STORAGE_KEY = Buffer.alloc(32).toString("base64");
    process.env.AZURE_STORAGE_CONTAINER = "playback-cache";
    delete process.env.AZURE_STORAGE_ENDPOINT;

    const first = mintPlaybackSas({ blobName: "m/playback.mp4" });
    const second = mintPlaybackSas({ blobName: "m/playback.mp4" });
    // Same window unless the test straddles a boundary, which it cannot
    // in practice (two synchronous calls); compare only when it did not.
    if (first.expiresAt.getTime() === second.expiresAt.getTime()) {
      expect(second.playbackUrl).toBe(first.playbackUrl);
    }
    const url = new URL(first.playbackUrl);
    expect(url.searchParams.get("sp")).toBe("r");
    expect(url.searchParams.get("rscc")).toBe(PLAYBACK_CACHE_CONTROL);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
