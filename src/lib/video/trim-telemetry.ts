import { toMb, track, type AnalyticsEvents } from "@/lib/analytics";
import type { TrimSkipReason } from "./trim-plan";
import type { TrimDiscardedTrack } from "./trim-protocol";

/**
 * Why a match video went up uncut, recorded where it can be found later.
 *
 * `prepareVideoForUpload` never rejects for "couldn't cut": it resolves to the
 * original with a reason, and the upload carries on with the whole file. Until
 * this existed that reason reached only the uploader's browser console, so a
 * raw 5.3 GB upload (Jerry Shi v JR, 2026-11-25: an iPhone's unreadable
 * spatial-audio track failed the cut) took hours of probing the file by hand
 * to explain. Every caller that falls back to the original reports it here.
 *
 * Ids, enums, codecs and a size only — never the file's name, nor the
 * worker's free-text error detail, which can quote it.
 */

export type VideoCutSkippedEvent = AnalyticsEvents["video_cut_skipped"];

export interface TrimSkipContext {
  surface: VideoCutSkippedEvent["surface"];
  matchId: string | null;
  jobId?: string | null;
  /** Size of the file going up instead of the cut. */
  fileSizeBytes: number;
}

/** The skip a caller saw: `prepareVideoForUpload`'s untrimmed result. */
export interface TrimSkip {
  reason: TrimSkipReason;
  discarded?: readonly TrimDiscardedTrack[];
}

/** The event's properties, or null for a skip that is not worth one. */
export function trimSkipProperties(
  skip: TrimSkip,
  context: TrimSkipContext,
): VideoCutSkippedEvent | null {
  if (skip.reason === "whole-clip") return null;
  const discarded = (skip.discarded ?? []).map((d) => ({
    type: d.type,
    codec: d.codec,
    reason: d.reason,
  }));
  return {
    surface: context.surface,
    reason: skip.reason,
    match_id: context.matchId,
    job_id: context.jobId ?? null,
    file_size_mb: toMb(context.fileSizeBytes),
    discarded_tracks: discarded,
    discarded_summary:
      discarded.length > 0
        ? discarded
            .map((d) => `${d.type}:${d.codec ?? "unknown"}:${d.reason}`)
            .join(",")
        : null,
  };
}

/**
 * Send `video_cut_skipped` for a skip (nothing for `whole-clip`), and keep the
 * console line callers had. `send` is a seam for the spec.
 */
export function reportTrimSkip(
  skip: TrimSkip,
  context: TrimSkipContext,
  send: (
    event: "video_cut_skipped",
    properties: VideoCutSkippedEvent,
  ) => void = track,
): void {
  const properties = trimSkipProperties(skip, context);
  if (!properties) return;
  console.info(
    "Uploading the original video without cutting it:",
    properties.reason,
    properties.discarded_summary ?? "",
  );
  try {
    send("video_cut_skipped", properties);
  } catch {
    // Telemetry never stands between a player and their upload.
  }
}
