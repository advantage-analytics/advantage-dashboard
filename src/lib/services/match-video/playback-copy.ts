import { createHmac, timingSafeEqual } from "node:crypto";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * The playback copy: what the Azure playback worker (`workers/playback/run.sh`)
 * makes of every upload, and how its report lands on `processing_jobs`.
 *
 * The copy is the upload with its index moved to the front — or, when the
 * upload is high-bitrate, HEVC, 4K or sparse in keyframes, re-encoded to
 * H.264 ≤1080p with a keyframe every 2 s — on the upload's own timeline, so it
 * plays with no offset (`match-video-choice.ts`). Measured 2026-10-19: most
 * uploads were already ~2 Mbps H.264 with sound, but every one had its index
 * at the END, so a browser fetched the tail of a 1–2 GB file before a frame.
 *
 * The worker signs each report with `PLAYBACK_CALLBACK_SECRET`; the key it
 * names must be the one derived here from the upload's, so a report can only
 * ever point a job at its own copy.
 */

export const PLAYBACK_PREFIX = "playback/";

/** `videos/<uid>/<match>/<name>.<ext>` → `playback/<uid>/<match>/<name>.mp4`. */
export function playbackKeyFor(sourceKey: string): string | null {
  const match = /^videos\/([^/]+)\/([^/]+)\/([^/]+?)(\.[A-Za-z0-9]+)?$/.exec(
    sourceKey,
  );
  if (!match) return null;
  const [, owner, matchId, name] = match;
  return `${PLAYBACK_PREFIX}${owner}/${matchId}/${name}.mp4`;
}

/** The worker's HMAC-SHA256 of the raw body, hex, checked in constant time. */
export function verifyPlaybackSignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export type PlaybackStatus = "processing" | "ready" | "failed";

export interface PlaybackReport {
  sourceKey: string;
  status: PlaybackStatus;
  /** Present on `ready`; always `playbackKeyFor(sourceKey)`. */
  playbackKey: string | null;
  error: string | null;
}

const ERROR_MAX_LENGTH = 500;

/** A report the worker could have sent, or null. */
export function parsePlaybackReport(value: unknown): PlaybackReport | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const sourceKey = raw.sourceKey;
  const status = raw.status;
  if (typeof sourceKey !== "string") return null;
  if (status !== "processing" && status !== "ready" && status !== "failed") {
    return null;
  }
  const derived = playbackKeyFor(sourceKey);
  if (!derived) return null;
  if (status === "ready" && raw.playbackKey !== derived) return null;
  return {
    sourceKey,
    status,
    playbackKey: status === "ready" ? derived : null,
    error:
      status === "failed" && typeof raw.error === "string"
        ? raw.error.slice(0, ERROR_MAX_LENGTH)
        : null,
  };
}

/** The columns one report writes. `processing` keeps a copy already made. */
export function playbackColumns(report: PlaybackReport): {
  playback_status: PlaybackStatus;
  playback_error: string | null;
  playback_object_key?: string;
} {
  if (report.status === "ready") {
    return {
      playback_status: "ready",
      playback_error: null,
      playback_object_key: report.playbackKey!,
    };
  }
  return { playback_status: report.status, playback_error: report.error };
}

/**
 * Write a report onto every job that plays this upload (a resubmitted match's
 * jobs share it). Returns how many rows took it.
 */
export async function applyPlaybackReport(
  db: ReturnType<typeof createAdminClient>,
  report: PlaybackReport,
): Promise<number> {
  const { data, error } = await db
    .from("processing_jobs")
    .update(playbackColumns(report))
    .eq("video_object_key", report.sourceKey)
    .select("id");
  if (error)
    throw new Error(`Could not record the playback copy: ${error.message}`);
  return data?.length ?? 0;
}
