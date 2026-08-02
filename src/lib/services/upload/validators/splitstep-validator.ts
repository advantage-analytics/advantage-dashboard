/**
 * Video validation for the Advantage Intelligence (SplitStep) provider.
 *
 * Runs entirely in the browser against the local File, before any upload
 * starts. Every fatal check here is one the vendor would otherwise apply after
 * we had already moved gigabytes of data.
 *
 * Fatal vs. warning is a deliberate split: resolution, frame rate, container
 * and size are hard vendor constraints, but an *undetermined* frame rate is a
 * limitation of the browser, not a defect in the file, and must not block.
 */

import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_VIDEO_SIZE_BYTES,
  MIN_TRIM_DURATION_SECONDS,
  MIN_VIDEO_FPS,
  MIN_VIDEO_HEIGHT,
  MIN_VIDEO_WIDTH,
  RECOMMENDED_VIDEO_FPS,
} from '@/lib/services/splitstep/config';
import type { ValidationResult } from '../types';

function formatGigabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function hasAcceptedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Validate a video file for analysis.
 *
 * Cheap checks (name, size) run first so an obviously wrong file is rejected
 * without paying for a decode.
 */
export async function validateSplitStepVideo(file: File): Promise<ValidationResult> {
  if (!hasAcceptedExtension(file.name)) {
    return {
      success: false,
      error: `Unsupported format. Use ${ACCEPTED_VIDEO_EXTENSIONS.join(' or ')} — MP4 (H.264) works best.`,
    };
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      success: false,
      error: `Video is ${formatGigabytes(file.size)}. The maximum is ${formatGigabytes(MAX_VIDEO_SIZE_BYTES)}.`,
    };
  }

  let probe: VideoProbe;
  try {
    probe = await probeVideo(file);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Couldn't read this video.",
    };
  }

  const details: ValidationResult['details'] = { video: probe };

  if (probe.width < MIN_VIDEO_WIDTH || probe.height < MIN_VIDEO_HEIGHT) {
    return {
      success: false,
      error: `Video is ${probe.width}×${probe.height}. Analysis needs at least ${MIN_VIDEO_WIDTH}×${MIN_VIDEO_HEIGHT} (1080p).`,
      details,
    };
  }

  // A measured rate below the floor is fatal. An unmeasurable one is not —
  // see the warning below.
  if (probe.fps !== null && probe.fps < MIN_VIDEO_FPS) {
    return {
      success: false,
      error: `Video runs at ${probe.fps} fps. Analysis needs at least ${MIN_VIDEO_FPS} fps.`,
      details,
    };
  }

  if (probe.durationSeconds > 0 && probe.durationSeconds < MIN_TRIM_DURATION_SECONDS) {
    return {
      success: false,
      error: `Video is only ${Math.round(probe.durationSeconds)}s long. That's too short to contain a match.`,
      details,
    };
  }

  const warnings: string[] = [];

  if (probe.fps === null) {
    warnings.push(
      `This browser can't measure frame rate. Analysis needs at least ${MIN_VIDEO_FPS} fps — check your camera setting before submitting.`
    );
  } else if (probe.fps < RECOMMENDED_VIDEO_FPS) {
    warnings.push(
      `Recorded at ${probe.fps} fps. ${RECOMMENDED_VIDEO_FPS} fps produces noticeably better ball tracking.`
    );
  }

  return {
    success: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    details,
  };
}
