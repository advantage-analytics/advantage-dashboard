"use client";

/**
 * Selection and local verification for the SwingVision video attachment.
 *
 * This is a STEP, not a workflow. Nothing here uploads: the hook turns a file
 * a person picked into either a verified selection or a refusal, and the
 * orchestration step (plan 13) is what later reserves a credential and moves
 * bytes. A test asserts that selecting a file issues no network request,
 * because "checked" beside a 6 GB file otherwise reads as "sent" — the same
 * honesty the new-match wizard's file step buys with its note strip.
 *
 * Two checks run, in this order, and both are local:
 *
 *   1. `inspectLocalVideoFile` (plan 4) — the extension gate, the byte cap and
 *      a bounded container parse over `File.slice`. It is the SAME code the
 *      server runs over Azure range reads after the bytes land, so a file
 *      accepted here is one the server can verify rather than one it will
 *      reject at completion. It already refuses AVI, external-resource
 *      formats, audio-only files, nonfinite durations and timing layouts the
 *      saved offset cannot express.
 *
 *   2. `confirmPlayableLocally` — a decoded-frame and seek check through a
 *      real `<video>` element. A container this browser can PARSE is not
 *      necessarily one it can PLAY, and the next step asks the athlete to
 *      scrub that file to the first point. Finding out there that the picture
 *      never arrives is finding out too late.
 *
 * **No vendor gates.** The Advantage Intelligence path refuses video below
 * 1080p or 30 fps (`src/lib/video/probe.ts` measures both for exactly that
 * reason). An attachment never reaches that vendor — it is the athlete's own
 * recording, played back beside imported SwingVision data — so resolution and
 * frame rate are read for display only and gate nothing. Importing that
 * validator here would quietly apply an analysis rule to a playback file.
 *
 * **Stale probes.** Every selection takes a generation number and its own
 * `AbortController`. A slower probe for a file the person already replaced
 * resolves into a discarded branch and can never populate the UI, and the
 * object URL it opened is revoked on the way out. Picking a file also clears
 * any alignment already confirmed — an offset measured against a different
 * recording is worse than no offset, because it looks like an answer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  MATCH_VIDEO_EXTENSIONS,
  MATCH_VIDEO_MIME_TYPES,
} from "@/lib/match-video/limits";
import {
  inspectLocalVideoFile,
  type InspectedMedia,
} from "@/lib/match-video/media-inspection";
import {
  fail,
  matchVideoError,
  ok,
  type MatchVideoError,
  type MatchVideoResult,
} from "@/lib/match-video/types";

/* -------------------------------------------------------------------------
 * Content type
 * ---------------------------------------------------------------------- */

type MatchVideoExtension = (typeof MATCH_VIDEO_EXTENSIONS)[number];
type MatchVideoMimeType = (typeof MATCH_VIDEO_MIME_TYPES)[number];

/**
 * The content type an extension implies.
 *
 * The reservation endpoint requires a bare `type/subtype` token, and a browser
 * is not a reliable source of one: Chrome reports `""` for `.mkv` and `.m4v`
 * varies by platform, while a file dragged from some tools arrives carrying
 * codec parameters (`video/mp4; codecs=avc1`) that the endpoint also refuses.
 * The extension has already been validated by the inspection above, so it is
 * the honest thing to derive the type from — sending the browser's guess
 * spends a round trip to be told `content_type_format`.
 *
 * Typed against both `limits.ts` lists so adding a container there without a
 * type here is a compile error rather than a 400 in production.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<
  MatchVideoExtension,
  MatchVideoMimeType
> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

/** The content type for a filename, or null when nothing here claims it. */
export function contentTypeForFilename(filename: string): string | null {
  const lowered = filename.toLowerCase();
  const extension = MATCH_VIDEO_EXTENSIONS.find((candidate) =>
    lowered.endsWith(candidate),
  );
  return extension ? CONTENT_TYPE_BY_EXTENSION[extension] : null;
}

/** What the file input accepts — extensions first, then the types. */
export const ATTACHMENT_ACCEPT = [
  ...MATCH_VIDEO_EXTENSIONS,
  ...MATCH_VIDEO_MIME_TYPES,
].join(",");

/** "MP4 · MOV · M4V · MKV · WEBM", for the line under the drop zone. */
export const ATTACHMENT_EXTENSION_LABEL = MATCH_VIDEO_EXTENSIONS.map(
  (extension) => extension.slice(1).toUpperCase(),
).join(" · ");

/* -------------------------------------------------------------------------
 * Decoded-frame and seek check
 * ---------------------------------------------------------------------- */

/** How long the browser may take to report metadata for a local file. */
export const DECODE_TIMEOUT_MS = 15_000;

/** How long one verification seek may take. */
export const SEEK_TIMEOUT_MS = 10_000;

/**
 * Where the verification seek lands.
 *
 * Far enough in that a decoder has to do real work, near enough that it costs
 * nothing on a three-hour file; clamped to the middle of a very short clip so
 * the target is always inside the media.
 */
export const DECODE_PROBE_MAX_SECONDS = 1;

type Settled = "ok" | "error" | "timeout" | "aborted";

/** Resolve on `type`, on `error`, on the deadline, or on abort — once. */
function settle(
  video: HTMLVideoElement,
  type: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Settled> {
  return new Promise<Settled>((resolve) => {
    if (signal.aborted) {
      resolve("aborted");
      return;
    }
    let done = false;
    const finish = (outcome: Settled) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener(type, onDone);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onDone = () => finish("ok");
    const onError = () => finish("error");
    const onAbort = () => finish("aborted");
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    video.addEventListener(type, onDone, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Confirm THIS browser can decode a frame of the file and seek within it.
 *
 * The container parse upstream proves the file is well formed; it does not
 * prove a decoder exists for its codec, and it cannot: the parse is pure and
 * runs identically on the server, where no decoder is in play. The gap is real
 * — a Matroska carrying HEVC parses on every platform and decodes on few — and
 * a person who gets past this step with one is sent to an alignment step
 * showing a black rectangle and asked to find the first point in it.
 *
 * Verified against the owned fixtures: Chromium decodes all of them, including
 * `vp9.mkv`, so acceptance here is a property of the codec inside the
 * container and never of the extension.
 *
 * Every exit revokes the object URL, and the source is detached first: Safari
 * otherwise keeps a handle on a multi-gigabyte blob for the life of the page.
 */
export async function confirmPlayableLocally(
  file: Blob,
  signal: AbortSignal,
): Promise<MatchVideoResult<void>> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    video.src = url;

    const loaded = await settle(
      video,
      "loadedmetadata",
      signal,
      DECODE_TIMEOUT_MS,
    );
    if (loaded === "aborted") return fail("unsupported_media", "aborted");
    if (loaded !== "ok") {
      return fail(
        "unsupported_media",
        loaded === "timeout" ? "decode_timeout" : "decode_unavailable",
      );
    }
    if (!video.videoWidth || !video.videoHeight) {
      return fail("unsupported_media", "no_decoded_dimensions");
    }

    const duration = video.duration;
    const target = Number.isFinite(duration)
      ? Math.min(DECODE_PROBE_MAX_SECONDS, duration / 2)
      : DECODE_PROBE_MAX_SECONDS;
    video.currentTime = target > 0 ? target : 0;

    const seeked = await settle(video, "seeked", signal, SEEK_TIMEOUT_MS);
    if (seeked === "aborted") return fail("unsupported_media", "aborted");
    if (seeked !== "ok") {
      return fail(
        "unsupported_media",
        seeked === "timeout" ? "seek_timeout" : "seek_failed",
      );
    }

    // HAVE_CURRENT_DATA: a frame for the current position actually exists.
    if (video.readyState < 2) {
      const decoded = await settle(
        video,
        "loadeddata",
        signal,
        SEEK_TIMEOUT_MS,
      );
      if (decoded === "aborted") return fail("unsupported_media", "aborted");
      if (decoded !== "ok" || video.readyState < 2) {
        return fail("unsupported_media", "frame_not_decoded");
      }
    }

    return ok(undefined);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/* -------------------------------------------------------------------------
 * State
 * ---------------------------------------------------------------------- */

/**
 * A file that passed both checks.
 *
 * `durationSeconds` is the media end of the VIDEO track, parsed from the
 * container — never `HTMLVideoElement.duration`, which reports the longest
 * track and would claim coverage a recording whose audio outruns its picture
 * does not have. It is advisory here in any case: the server measures the
 * published blob again before it becomes the number playback trusts.
 */
export interface AttachmentSelection {
  file: File;
  filename: string;
  sizeBytes: number;
  /** Derived from the extension, not from `File.type`. */
  contentType: string;
  durationSeconds: number;
  /** Everything the container parse read. Displayed; never gated on. */
  media: InspectedMedia;
}

export type AttachmentFileState =
  | { status: "empty" }
  | { status: "checking"; filename: string; sizeBytes: number }
  | { status: "ready"; selection: AttachmentSelection }
  | { status: "rejected"; filename: string; error: MatchVideoError };

export interface UseAttachmentFileOptions {
  /**
   * Called with `null` the instant a new file is picked or the current one is
   * removed, and with the selection once it passes. The orchestration step
   * clears any confirmed alignment on `null`: an offset measured against a
   * different recording is not a smaller error than no offset, it is one that
   * looks like an answer.
   */
  onSelectionChange?: (selection: AttachmentSelection | null) => void;
}

export interface AttachmentFileApi {
  state: AttachmentFileState;
  isOver: boolean;
  /** The selection when one is ready, else null. */
  selection: AttachmentSelection | null;
  /** Programmatic entry point; the DOM handlers below all funnel here. */
  select: (file: File | null | undefined) => void;
  remove: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useAttachmentFile(
  options: UseAttachmentFileOptions = {},
): AttachmentFileApi {
  const [state, setState] = useState<AttachmentFileState>({ status: "empty" });
  const [isOver, setIsOver] = useState(false);

  /** Bumped by every selection. A probe whose number is stale is discarded. */
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  // Held in a ref so `select` never has to be re-created when a parent passes
  // a fresh closure — a changing `select` identity would reset the DOM
  // handlers on every render of the step above.
  const notify = useRef(options.onSelectionChange);
  useEffect(() => {
    notify.current = options.onSelectionChange;
  }, [options.onSelectionChange]);

  // Leaving the step mid-probe must not leave a decode running against a file
  // nobody is waiting for, nor an object URL open on it.
  useEffect(() => {
    return () => {
      generation.current += 1;
      abort.current?.abort();
      abort.current = null;
    };
  }, []);

  const select = useCallback((file: File | null | undefined) => {
    const mine = (generation.current += 1);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    // Before anything async: whatever was selected is no longer selected, so
    // an alignment held elsewhere is already wrong.
    notify.current?.(null);

    if (!file) {
      setState({ status: "empty" });
      return;
    }

    setState({ status: "checking", filename: file.name, sizeBytes: file.size });

    void (async () => {
      const inspected = await inspectLocalVideoFile(file);
      if (mine !== generation.current) return;
      if (!inspected.ok) {
        setState({
          status: "rejected",
          filename: file.name,
          error: inspected.error,
        });
        return;
      }

      const playable = await confirmPlayableLocally(file, controller.signal);
      if (mine !== generation.current) return;
      if (!playable.ok) {
        setState({
          status: "rejected",
          filename: file.name,
          error: playable.error,
        });
        return;
      }

      const contentType = contentTypeForFilename(file.name);
      if (!contentType) {
        // Unreachable while the inspection's extension gate and the table
        // above read the same list; kept because the two could drift.
        setState({
          status: "rejected",
          filename: file.name,
          error: matchVideoError(
            "unsupported_media",
            "extension_not_supported",
          ),
        });
        return;
      }

      const selection: AttachmentSelection = {
        file,
        filename: file.name,
        sizeBytes: file.size,
        contentType,
        durationSeconds: inspected.value.durationSeconds,
        media: inspected.value,
      };
      setState({ status: "ready", selection });
      notify.current?.(selection);
    })();
  }, []);

  const remove = useCallback(() => select(null), [select]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsOver(false), []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsOver(false);
      select(event.dataTransfer?.files?.[0] ?? null);
    },
    [select],
  );

  const onFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      // Clearing the input is what lets the SAME file be chosen again after a
      // remove — without it the second pick fires no change event at all.
      event.target.value = "";
      select(file);
    },
    [select],
  );

  return {
    state,
    isOver,
    selection: state.status === "ready" ? state.selection : null,
    select,
    remove,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileChange,
  };
}
