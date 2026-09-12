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
 * ── Boundaries this file deliberately does NOT tighten ───────────────────────
 * The vendor's guide (checked 2026-09-10, see
 * work/upload-flow-refinements/01_brief/output/brief.md §"Also consulted")
 * contradicts itself on frame rate: the specification accepts 29.97 fps, while
 * the error table describes rejection below 29.9 fps. Both statements are about
 * the same boundary and cannot both be the boundary. We keep the existing,
 * more permissive behavior — the floor is `MIN_VIDEO_FPS` applied to the
 * *snapped* rate, so genuine 29.97 footage reads as 30 and passes — rather
 * than inventing a third number. Anything in the narrow band
 * the vendor might still refuse is left to the vendor, which is the party that
 * actually knows.
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
 * The checks that need decoded metadata.
 *
 * The frame-rate comparison snaps first, so the 30 floor sees 30 for NTSC
 * 29.97 footage whether or not the caller's `fps` had already been rounded.
 * A null fps is "the browser wouldn't say", which is a warning and never a
 * refusal — see the module comment.
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
  if (probe.fps !== null && snapToStandardFps(probe.fps) < MIN_VIDEO_FPS) {
    return {
      success: false,
      error: `Video runs at ${probe.fps} fps. Analysis needs at least ${MIN_VIDEO_FPS} fps.`,
      details,
    };
  }

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

  if (probe.fps === null) {
    // Says three things on purpose: what we could not do, that the requirement
    // is unchanged by our not being able to check it, and who refuses the file
    // if it is wrong. Without the last clause this reads as permission.
    warnings.push(
      `This browser can't measure frame rate. Analysis still needs at least ${MIN_VIDEO_FPS} fps — check your camera setting, because ${PROVIDER_DISPLAY_NAME} can still reject the video after it uploads.`,
    );
  } else if (probe.fps < RECOMMENDED_VIDEO_FPS) {
    warnings.push(
      `Recorded at ${probe.fps} fps. ${RECOMMENDED_VIDEO_FPS} fps produces noticeably better ball tracking.`,
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
