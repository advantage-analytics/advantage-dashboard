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
 * Two measurements exist, and the whole-track container average is the judge
 * whenever it is known. The browser sample (`fps`, ~20 frames played from the
 * start of the file) is far too short to characterise a two-hour recording:
 * one dropped frame in those 20 reads 29.2, phones stutter most at the very
 * start, and a busy laptop drops presented frames the file never lost. A
 * 29.94 file was refused on exactly that reading (2026-09-29). So the sample,
 * snapped to a standard rate, must clear `MIN_VIDEO_FPS` only when the
 * container could not be read (`averageFps` null: not MP4/MOV, or the read
 * failed or timed out). When the average is known (`averageFps`, MP4/MOV only)
 * it alone decides, in three tiers:
 *
 *   - under `MIN_CONTAINER_AVERAGE_FPS` (29.5)          → refused before a byte
 *     uploads. The variable-rate case: a file opens at 30 to a 20-frame
 *     sample and averages far lower over the whole track. Why 29.5 is in
 *     config.ts, next to the constant.
 *   - 29.5 up to `RECOMMENDED_CONTAINER_AVERAGE_FPS` (29.97) → accepted with one
 *     warning. The vendor's hard gate is 25 fps (Q14 in
 *     docs/splitstep-vendor-questions.md, answered 2026-09-28), so nothing here
 *     is rejected after upload, but 29.97 is the rate it recommends and stands
 *     behind. Jobs 45ff4bd7 (29.94) and b74a1e04 (29.95) both publish from
 *     derivation 0.6.0 on. This band was refused until 2026-09-29.
 *   - at or above 29.97                                    → silent. Constant-rate
 *     NTSC, 30 and 60 fps footage always lands here.
 *
 * How the vendor computes its own number is still unknown.
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
  RECOMMENDED_CONTAINER_AVERAGE_FPS,
  RECOMMENDED_VIDEO_FPS,
} from "@/lib/services/splitstep/config";
import { normaliseReason } from "@/lib/match-video/playback-format";
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
      error: `Unsupported format. Use ${formatExtensionList(ACCEPTED_VIDEO_EXTENSIONS)}. MP4 (H.264) works best.`,
    };
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      success: false,
      error: `File too large. This video is ${formatGigabytes(file.size)} and the maximum is ${formatGigabytes(MAX_VIDEO_SIZE_BYTES)}.`,
    };
  }

  return null;
}

type ProbeWithAverage = VideoProbe & { averageFps: number };

/** Is the whole-track container average known and under `threshold`? */
function averageBelow(
  probe: VideoProbe,
  threshold: number,
): probe is ProbeWithAverage {
  return probe.averageFps != null && probe.averageFps < threshold;
}

/** An average to at most two decimals, without trailing zeros: 29.94, 24. */
function formatAverage(averageFps: number): string {
  return `${Number(averageFps.toFixed(2))} fps`;
}

/**
 * The frame rate the checks judge: the whole-track container average, snapped
 * to a standard rate, when it is known; otherwise the browser's sample. The
 * average wins because it covers every frame in the file and the sample covers
 * twenty (see the module comment). The fallback matters in browsers without
 * `requestVideoFrameCallback` (Firefox), where the sample is null but the
 * container read still works — and the other way round for a container
 * mediabunny cannot index. Null only when neither is known.
 *
 * Exported so UI code deriving "one frame" from a probe (e.g. the trim
 * step's frame-step calculation) uses the same precedence and snap as the
 * validator, rather than a second copy that could drift.
 */
export function effectiveFps(probe: VideoProbe): number | null {
  if (probe.averageFps != null) return snapToStandardFps(probe.averageFps);
  return probe.fps;
}

/**
 * The frame rate to show beside a video: the whole-track average when it is
 * below the accepted rate (so the fact agrees with the refusal beside it), the
 * effective rate otherwise, and null when the rate is unknown.
 */
export function formatProbeFps(probe: VideoProbe): string | null {
  if (averageBelow(probe, RECOMMENDED_CONTAINER_AVERAGE_FPS))
    return formatAverage(probe.averageFps);
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
      error: `Resolution too low. This video is ${probe.width}×${probe.height} and analysis needs ${MIN_VIDEO_WIDTH}×${MIN_VIDEO_HEIGHT} (1080p) or higher.`,
      details,
    };
  }

  // The sample judges only when the container could not be read; with an
  // average in hand the two checks below own the verdict, because twenty
  // frames from the start of a file are not a frame rate (module comment).
  // A sampled rate below the floor is then fatal. An unmeasurable one is not —
  // see the warning below. The comparison runs on the snapped rate so NTSC
  // 29.97 clears the 30 floor here as well, and not only because probe.ts
  // happened to round it on the way in; the message still quotes the rate the
  // file reported, which is the number the camera's menu shows.
  if (
    probe.averageFps == null &&
    probe.fps !== null &&
    snapToStandardFps(probe.fps) < MIN_VIDEO_FPS
  ) {
    return {
      success: false,
      error: `Frame rate too low. This video runs at ${probe.fps} fps and analysis needs ${MIN_VIDEO_FPS} or higher. Export at ${MIN_VIDEO_FPS} fps and add it again.`,
      details,
    };
  }

  // The container average, in every browser — a variable-rate MP4 can open
  // at 30 (what the sample sees) and average well under it (what the vendor
  // measures), or open at 29.2 and average 29.94.
  if (averageBelow(probe, MIN_CONTAINER_AVERAGE_FPS)) {
    return {
      success: false,
      error: `Frame rate too low. This video averages ${formatAverage(probe.averageFps)}, and analysis needs at least ${MIN_CONTAINER_AVERAGE_FPS} fps. Export at a constant 30 fps and add it again.`,
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
      error: `Video too short. It is only ${Math.round(probe.durationSeconds)}s long, which can't contain a match.`,
      details,
    };
  }

  const warnings: string[] = [];
  const notes: string[] = [];

  if (fps === null) {
    // Says three things on purpose: what we could not do, that the requirement
    // is unchanged by our not being able to check it, and who refuses the file
    // if it is wrong. Without the last clause this reads as permission.
    warnings.push(
      `Frame rate couldn't be read. Analysis needs at least ${MIN_VIDEO_FPS} fps, so check your camera setting. ${PROVIDER_DISPLAY_NAME} can still reject the video after it uploads.`,
    );
  } else if (averageBelow(probe, RECOMMENDED_CONTAINER_AVERAGE_FPS)) {
    // The band the refusal above lets through. One line, not two: this
    // subsumes the 60 fps nudge below, which would only repeat "faster is
    // better" under a warning that already says so.
    warnings.push(
      `Averages ${formatAverage(probe.averageFps)}. We'll still analyze it, but ball tracking may be less accurate. Export at a constant 30 fps for the best result.`,
    );
  } else if (fps < RECOMMENDED_VIDEO_FPS) {
    // A fact, not a caution: the file meets the floor and nothing is at risk.
    // It rides in `notes`, which the wizard folds into the requirement row's
    // own line — as a warning it turned nearly every 30 fps upload yellow,
    // which is how a colour stops meaning anything.
    notes.push(
      `Recorded at ${fps} fps. ${RECOMMENDED_VIDEO_FPS} fps gives noticeably better ball tracking.`,
    );
  }

  const conversion = conversionNotice(probe);
  if (conversion) warnings.push(conversion);

  return {
    success: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    notes: notes.length > 0 ? notes : undefined,
    details,
  };
}

/**
 * What happens to a file that is not 1080p-or-less H.264 (a phone's 4K or
 * HEVC recording). The uploader's browser plays it, so nothing else here
 * objects; a viewer's browser often cannot. It is re-encoded in this tab
 * before upload when the browser can, and the uploader is told either way —
 * the re-encode takes minutes, and the fallback is a file some people will not
 * be able to watch. Never a refusal: the vendor reads these files fine.
 */
export function conversionNotice(probe: VideoProbe): string | null {
  const reason = normaliseReason({
    videoCodec: probe.videoCodec ?? null,
    codedWidth: probe.width,
    codedHeight: probe.height,
  });
  if (!reason) return null;
  // The container could not be read here, so the worker will not read it
  // either and nothing would be converted: promise nothing.
  if (probe.canConvert == null) return null;

  const what = {
    codec: "This video isn't H.264",
    resolution: "This video is above 1080p",
    "codec-and-resolution": "This video is above 1080p and isn't H.264",
  }[reason];

  if (probe.canConvert === false) {
    return `${what}, and this browser can't convert it. It will upload as recorded, but some browsers won't be able to play it back. For reliable playback, export it as 1080p H.264 (on iPhone: Settings › Camera › Formats › Most Compatible) and pick it again.`;
  }
  return `${what}, so it will be converted to 1080p H.264 in this tab before it uploads. Keep the tab open: a full match can take a while.`;
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
