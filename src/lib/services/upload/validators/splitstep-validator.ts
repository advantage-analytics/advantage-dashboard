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
 *
 * ── Shape: two pure predicates plus one thin orchestrator ────────────────────
 * `checkVideoFileBasics` (name/size) and `evaluateVideoProbe` (probe metadata)
 * hold every threshold and every sentence. `validateSplitStepVideo` only wires
 * them either side of `probeVideo`. The split exists so the boundaries can be
 * driven from constructed `VideoProbe` fixtures — there is no ffmpeg on the
 * build machines and no clip fixtures in the repo, so a test that had to decode
 * a real file could not exist. See tests/upload-video-requirements.spec.ts.
 * Do not add a second copy of any threshold at a call site.
 *
 * ── The frame-rate floor ─────────────────────────────────────────────────────
 * The vendor's API docs (https://splitstep.ai/api-docs.html, re-read
 * 2026-09-27) say "29.97 fps (NTSC) and higher is accepted", and their error
 * table rejects below 29.9 fps by the vendor's own measurement. Those are not
 * a contradiction: at and above 29.97 is guaranteed, below 29.9 is refused, and
 * the band between is not promised. It is also not safe — job 45ff4bd7 read 30
 * to our 20-frame sample and 29.94 in its container, the vendor measured 29.80,
 * and it was rejected after a full upload.
 *
 * So two rates are judged. The browser sample, snapped to a standard rate, must
 * clear `MIN_VIDEO_FPS` (snapping keeps genuine 29.97 at 30). And when the
 * container's whole-track average is known (`averageFps`, MP4/MOV only), it
 * must be at least `MIN_CONTAINER_AVERAGE_FPS` — just under 30000/1001, so
 * constant-rate NTSC, 30 and 60 fps footage always passes and a variable-rate
 * file like 45ff4bd7's is refused before a byte uploads. Either rate can
 * refuse; neither rescues the other. A null average (another container, a
 * failed or slow read) leaves the sample to decide, as before. How the vendor
 * computes its number is still open as Q14 in docs/splitstep-vendor-questions.md.
 *
 * Likewise the container allowlist is exactly `ACCEPTED_VIDEO_EXTENSIONS` —
 * not the message's MP4 preference being enforced (.mov, .m4v, .avi, .mkv and
 * .webm are all accepted; the message names MP4 only as the best-performing
 * choice) but the set of extensions `videoExtensionFor()` in
 * src/lib/services/splitstep/object-keys.ts can build a blob key from. The
 * vendor's "any container ffmpeg can decode" names no enumerable set, so this
 * is a practical allowlist of what a camera or phone actually produces, kept
 * in lockstep with `videoExtensionFor()` so widening one end never outruns the
 * storage-key contract at the other — that mismatch is what would trade a
 * legible refusal at the picker for a 400 after the upload.
 */

import {
  probeVideo,
  snapToStandardFps,
  type VideoProbe,
} from "@/lib/video/probe";
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_VIDEO_SIZE_BYTES,
  MIN_CONTAINER_AVERAGE_FPS,
  MIN_TRIM_DURATION_SECONDS,
  MIN_VIDEO_FPS,
  MIN_VIDEO_HEIGHT,
  MIN_VIDEO_WIDTH,
  PROVIDER_DISPLAY_NAME,
  RECOMMENDED_VIDEO_FPS,
} from "@/lib/services/splitstep/config";
import type { ValidationResult } from "../types";

/**
 * Render a byte count the way the vendor's limit is written.
 *
 * Decimal, not binary. `MAX_VIDEO_SIZE_BYTES` is 8e9 - 1 because the vendor's
 * bound is decimal and exclusive, so dividing by 1024³ printed a *different*
 * number than the limit it was describing: a 8.1 GB file rendered as "7.5 GB"
 * against a maximum that also rendered as "7.5 GB" — a refusal that named the
 * same figure twice and gave the user nothing to act on. It also disagreed
 * with the "Under 8 GB" the requirements panel shows two inches away.
 */
function formatGigabytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * "a or b" for two, "a, b, c or d" for more. The allowlist grew from two
 * entries to six, and a bare `join(" or ")` turned the refusal into
 * ".mp4 or .mov or .m4v or .avi or .mkv or .webm".
 */
function formatExtensionList(extensions: readonly string[]): string {
  if (extensions.length < 2) return extensions[0] ?? "";
  return `${extensions.slice(0, -1).join(", ")} or ${extensions[extensions.length - 1]}`;
}

function acceptedExtensionOf(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  return ACCEPTED_VIDEO_EXTENSIONS.find((ext) => lower.endsWith(ext)) ?? null;
}

function hasAcceptedExtension(fileName: string): boolean {
  return acceptedExtensionOf(fileName) !== null;
}

/**
 * The checks that need only a name and a byte count.
 *
 * Returns null when the file clears them. Kept separate because they are cheap:
 * an obviously wrong file is refused without paying for a decode.
 */
export function checkVideoFileBasics(file: {
  name: string;
  size: number;
}): ValidationResult | null {
  if (!hasAcceptedExtension(file.name)) {
    return {
      success: false,
      error: `Unsupported format. Use ${formatExtensionList(ACCEPTED_VIDEO_EXTENSIONS)} — MP4 (H.264) works best.`,
    };
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      success: false,
      error: `Video is ${formatGigabytes(file.size)}. The maximum is ${formatGigabytes(MAX_VIDEO_SIZE_BYTES)}.`,
    };
  }

  return null;
}

/**
 * Is this probe's whole-track container average known and below the rate the
 * vendor documents as accepted? See the module comment's frame-rate floor.
 */
function averageBelowAccepted(probe: VideoProbe): probe is VideoProbe & {
  averageFps: number;
} {
  return (
    probe.averageFps != null && probe.averageFps < MIN_CONTAINER_AVERAGE_FPS
  );
}

/** An average to at most two decimals, without trailing zeros: 29.94, 24. */
function formatAverage(averageFps: number): string {
  return `${Number(averageFps.toFixed(2))} fps`;
}

/**
 * The frame rate the checks judge: the sampled rate when the browser could
 * measure one, otherwise the whole-track container average snapped the same
 * way. The fallback matters in browsers without `requestVideoFrameCallback`
 * (Firefox): the sample is null there, but the container read still works, and
 * without it a 24 fps MP4 would skip the floor and fail only after upload.
 * Null only when neither is known.
 */
function effectiveFps(probe: VideoProbe): number | null {
  if (probe.fps !== null) return probe.fps;
  return probe.averageFps != null ? snapToStandardFps(probe.averageFps) : null;
}

/**
 * The frame rate to show beside a video: the whole-track average when it is
 * below the accepted rate (so the fact agrees with the refusal beside it), the
 * effective rate otherwise, and null when the rate is unknown.
 */
export function formatProbeFps(probe: VideoProbe): string | null {
  if (averageBelowAccepted(probe)) return formatAverage(probe.averageFps);
  const fps = effectiveFps(probe);
  return fps === null ? null : `${fps} fps`;
}

/**
 * The checks that need decoded metadata.
 *
 * The frame-rate comparison snaps first, so the 30 floor sees 30 for NTSC
 * 29.97 footage whether or not the caller's `fps` had already been rounded.
 * The rate judged is the sampled one, or the container average when the
 * browser could not sample (see `effectiveFps`). Only when neither is known is
 * it "the browser wouldn't say", which is a warning and never a refusal — see
 * the module comment.
 */
export function evaluateVideoProbe(probe: VideoProbe): ValidationResult {
  const details: ValidationResult["details"] = { video: probe };

  if (probe.width < MIN_VIDEO_WIDTH || probe.height < MIN_VIDEO_HEIGHT) {
    return {
      success: false,
      error: `Video is ${probe.width}×${probe.height}. Analysis needs at least ${MIN_VIDEO_WIDTH}×${MIN_VIDEO_HEIGHT} (1080p).`,
      details,
    };
  }

  // A measured rate below the floor is fatal. An unmeasurable one is not —
  // see the warning below. The comparison runs on the snapped rate so NTSC
  // 29.97 clears the 30 floor here as well, and not only because probe.ts
  // happened to round it on the way in; the message still quotes the rate the
  // file reported, which is the number the camera's menu shows.
  //
  if (probe.fps !== null && snapToStandardFps(probe.fps) < MIN_VIDEO_FPS) {
    return {
      success: false,
      error: `Video runs at ${probe.fps} fps. Analysis needs at least ${MIN_VIDEO_FPS} fps.`,
      details,
    };
  }

  // The container average is judged too, in every browser — a variable-rate
  // MP4 can open at 30 (what the sample sees) and average well under it (what
  // the vendor measures). It never rescues a low sample; it can only refuse.
  if (averageBelowAccepted(probe)) {
    return {
      success: false,
      error: `This recording averages ${formatAverage(probe.averageFps)}, which usually means a variable frame rate. ${PROVIDER_DISPLAY_NAME} accepts 29.97 fps and higher, so export it at a constant 30 fps and pick it again.`,
      details,
    };
  }

  const fps = effectiveFps(probe);

  if (
    probe.durationSeconds > 0 &&
    probe.durationSeconds < MIN_TRIM_DURATION_SECONDS
  ) {
    return {
      success: false,
      error: `Video is only ${Math.round(probe.durationSeconds)}s long. That's too short to contain a match.`,
      details,
    };
  }

  const warnings: string[] = [];

  if (fps === null) {
    // Says three things on purpose: what we could not do, that the requirement
    // is unchanged by our not being able to check it, and who refuses the file
    // if it is wrong. Without the last clause this reads as permission.
    warnings.push(
      `This browser can't measure frame rate. Analysis still needs at least ${MIN_VIDEO_FPS} fps — check your camera setting, because ${PROVIDER_DISPLAY_NAME} can still reject the video after it uploads.`,
    );
  } else if (fps < RECOMMENDED_VIDEO_FPS) {
    warnings.push(
      `Recorded at ${fps} fps. ${RECOMMENDED_VIDEO_FPS} fps produces noticeably better ball tracking.`,
    );
  }

  return {
    success: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    details,
  };
}

/**
 * Validate a video file for analysis.
 *
 * Cheap checks (name, size) run first so an obviously wrong file is rejected
 * without paying for a decode.
 */
export async function validateSplitStepVideo(
  file: File,
): Promise<ValidationResult> {
  const basics = checkVideoFileBasics(file);
  if (basics) return basics;

  let probe: VideoProbe;
  try {
    probe = await probeVideo(file);
  } catch (err) {
    // A probe failure is not the same fact as a bad file. `probeVideo` builds
    // an `HTMLVideoElement`, so it can only read what THIS BROWSER decodes —
    // and Chrome and Safari decode neither .avi nor .mkv, both of which the
    // allowlist above accepts because the vendor does ("any container ffmpeg
    // can decode"). Refusing there would be us reporting our own limitation as
    // the file's defect, in a sentence ("may be corrupt") that tells the person
    // nothing they can act on — and it would make the widened allowlist a lie
    // for two of its six entries.
    //
    // So ask the browser whether it could ever have decoded this, and only
    // refuse when it says it should have been able to. That is the same
    // judgement the null-fps warning below makes, for the same reason: a
    // requirement we cannot check is still a requirement, and the vendor is the
    // party that actually knows.
    if (browserCannotDecode(file)) {
      return {
        success: true,
        warnings: [
          `This browser can't read ${acceptedExtensionOf(file.name) ?? "this container"} files, so nothing here could be checked. ` +
            `The requirements still apply — ${MIN_VIDEO_WIDTH}×${MIN_VIDEO_HEIGHT} and at least ${MIN_VIDEO_FPS} fps — and ` +
            `${PROVIDER_DISPLAY_NAME} can still reject the video after it uploads.`,
        ],
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Couldn't read this video.",
    };
  }

  return evaluateVideoProbe(probe);
}

/**
 * Does this browser definitively refuse the container?
 *
 * `canPlayType` answers `""`, `"maybe"` or `"probably"`; only the empty string
 * is a definite no, which is exactly the signal wanted here — it keeps the
 * deferral narrow. A file whose type the browser does not even recognise is in
 * the same position. Outside a browser (tests, SSR) this answers false, so the
 * refusal path is what a non-DOM caller gets.
 */
function browserCannotDecode(file: File): boolean {
  if (typeof document === "undefined") return false;
  // An absent MIME type is not evidence of anything — the OS simply did not
  // label the file. Refusing is the honest answer there: excusing it would let
  // a truncated .mp4 upload up to 8 GB and then tell the person "this browser
  // can't read .mp4 files", which is false and unactionable. Only an explicit
  // `""` from `canPlayType` — a definite no about a type we DO know — earns
  // the deferral.
  if (!file.type) return false;
  return document.createElement("video").canPlayType(file.type) === "";
}
