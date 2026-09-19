"use client";

/**
 * Playback and first-point arithmetic for the SwingVision alignment step.
 *
 * This is a STEP, not a workflow. Nothing here uploads and nothing here saves:
 * the hook turns a recording plus one entered position into either a validated
 * `Alignment` or a refusal, and the orchestration step (plan 13) is what later
 * moves bytes and writes the offset. A test asserts that the step issues no
 * request with a real scheme, for the same reason the file step does — a
 * confirmed time that has not been sent anywhere must not look sent.
 *
 * **One clock, one parser.** `parseConfirmedVideoTime` and
 * `formatConfirmedVideoTime` (`lib/match-video/alignment.ts`) are the only
 * reader and writer of `hh:mm:ss.sss` in this feature. A second formatter here
 * — even a three-line one — is how the field and the server end up disagreeing
 * about whether `1:90:00` is a typo.
 *
 * **Corrections cannot accumulate.** `planAlignment` derives the offset from
 * the source anchor every time (`anchorSourceSeconds - confirmedVideoTime`),
 * never from the offset already saved. Two corrections that land on the same
 * video position produce the same offset, and the fifth nudge is no further
 * from the truth than the first. That is a property of the pure module; this
 * hook's contribution is to never hold a running total of its own.
 *
 * **Zero is confirmed, not inferred.** A first point at `00:00:00.000` is
 * usually a person who has not scrubbed yet, and occasionally a recording that
 * genuinely opens on the serve. The hook refuses to submit a zero until it has
 * been acknowledged, and every route to a zero — typing one, or landing on one
 * with Use current time — goes through `setConfirmedTime`, which clears the
 * acknowledgement. There is no second path that could skip it.
 *
 * **Nothing is invented.** A match whose import has no usable first or final
 * timestamp is reported as missing timing, not filled in with a guess; interior
 * points with a null timestamp are counted and named. `insufficient_coverage`
 * stays the only code carrying "not long enough", so a data problem never sends
 * someone hunting for a longer file.
 *
 * **A rejected `play()` is not a broken video.** Browsers reject the promise
 * for autoplay policy (`NotAllowedError`) and for a load that superseded the
 * request (`AbortError`). Those set a quiet notice; only the element's own
 * `error` event sets `mediaError`. Collapsing the two tells an athlete their
 * recording is unusable because the tab was in the background.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatConfirmedVideoTime,
  planAlignment,
  summarizeSourceTiming,
  type Alignment,
  type SourcePoint,
  type SourceShot,
  type SourceTimingSummary,
} from "@/lib/match-video/alignment";
import type {
  MatchVideoError,
  MatchVideoResult,
} from "@/lib/match-video/types";

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/**
 * The fine seek, in seconds.
 *
 * A thirtieth rather than a measured frame duration: the saved-video source has
 * no container parse behind it, so the real frame interval is not known for
 * every source this step accepts. Naming it "one frame" when it might be 1.25
 * of one would be a small lie in a step whose whole job is precision, so the
 * control says what it does — a step this size — and the field below it is
 * where millisecond accuracy actually lives.
 */
export const FINE_STEP_SECONDS = 1 / 30;

/** The coarse seek, in seconds. Arrow keys with Shift, and the ± buttons. */
export const COARSE_STEP_SECONDS = 1;

/** Page Up / Page Down on the scrub control. */
export const JUMP_STEP_SECONDS = 10;

/**
 * How far before the match's last known instant the preview starts.
 *
 * The question the preview answers is "does the end of this match land where
 * the alignment says it does", and that is only answerable by watching it
 * arrive. Dropping the playhead exactly on the final instant answers nothing.
 */
export const PREVIEW_LEAD_SECONDS = 6;

/* -------------------------------------------------------------------------
 * Source
 * ---------------------------------------------------------------------- */

/**
 * Where the preview comes from.
 *
 * `local` is the file the person just picked, still on their machine — this is
 * the add and replace path, and it is the case that must issue no request at
 * all. `saved` is the published attachment being re-aligned, played from a
 * short-lived read-only URL the orchestration step supplies. The alignment
 * arithmetic is identical; only the element's `src` differs.
 */
export type AlignmentSource =
  { kind: "local"; file: File } | { kind: "saved"; url: string };

export type AlignmentMediaStatus = "loading" | "ready" | "error";

/* -------------------------------------------------------------------------
 * State
 * ---------------------------------------------------------------------- */

export interface UseAttachmentAlignmentOptions {
  source: AlignmentSource;
  /** Imported points, first by `point_number` being the alignment anchor. */
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  /**
   * The duration the container parse read, when one ran (the local path).
   *
   * Preferred over `HTMLVideoElement.duration` for coverage, which reports the
   * longest track: a recording whose audio outruns its picture would otherwise
   * claim coverage it does not have. The element's duration still drives the
   * scrub control, because that is the timeline the element will actually seek.
   */
  declaredDurationSeconds?: number;
  /**
   * The saved confirmed position, in correction mode. Preloaded into the field
   * and used as the material-change baseline; `null`/omitted while adding.
   */
  savedConfirmedSeconds?: number | null;
  /** Fired with the validated alignment when it may be submitted, else null. */
  onAlignmentChange?: (alignment: Alignment | null) => void;
}

export interface AttachmentAlignmentApi {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The object URL for a local file, or the saved URL. Never empty. */
  sourceUrl: string;

  mediaStatus: AlignmentMediaStatus;
  /** Element duration: what the scrub control spans. 0 until metadata lands. */
  playbackDurationSeconds: number;
  currentTimeSeconds: number;
  isPlaying: boolean;
  /**
   * A `play()` the browser declined. NOT a media failure — the element is fine
   * and the same control will work on a second press.
   */
  playNotice: string | null;

  /** What the imported rows say, or why they cannot be aligned against. */
  timing: MatchVideoResult<SourceTimingSummary>;
  /** The raw field text. The hook never rewrites it behind the user. */
  confirmedTime: string;
  /** The plan for the current field text, or null while it is blank. */
  plan: MatchVideoResult<Alignment> | null;
  /** The refusal to show, if any. */
  error: MatchVideoError | null;
  /** A valid zero waiting on its acknowledgement. */
  needsZeroConfirmation: boolean;
  /** Correction mode with the field still on the saved value. */
  isNoOpCorrection: boolean;
  /** Everything checked out and the parent may act. */
  canSubmit: boolean;

  setConfirmedTime: (text: string) => void;
  useCurrentTime: () => void;
  confirmZero: () => void;
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
  previewLastPoint: () => void;
  onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onSeeked: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onMediaError: () => void;
  onPlay: () => void;
  onPause: () => void;
}

export function useAttachmentAlignment(
  options: UseAttachmentAlignmentOptions,
): AttachmentAlignmentApi {
  const {
    source,
    points,
    shots,
    declaredDurationSeconds,
    savedConfirmedSeconds = null,
    onAlignmentChange,
  } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);

  /**
   * The field starts on the saved value in correction mode and blank otherwise.
   *
   * Preloading is what makes "I only want to nudge it by half a second" a nudge
   * rather than a re-measurement, and it is also what makes a no-op detectable:
   * the baseline is on screen, so leaving it alone is visibly leaving it alone.
   */
  const [confirmedTime, setConfirmedTimeState] = useState(() =>
    savedConfirmedSeconds === null
      ? ""
      : formatConfirmedVideoTime(savedConfirmedSeconds),
  );
  const [zeroAcknowledged, setZeroAcknowledged] = useState(false);

  const [mediaStatus, setMediaStatus] =
    useState<AlignmentMediaStatus>("loading");
  const [playbackDurationSeconds, setPlaybackDurationSeconds] = useState(0);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playNotice, setPlayNotice] = useState<string | null>(null);

  /* ---------------------------------------------------------------------
   * Source URL
   * ------------------------------------------------------------------ */

  const localFile = source.kind === "local" ? source.file : null;

  /**
   * A local file's object URL is created and assigned INSIDE the effect, with
   * the element's `src` set from it there and nowhere else.
   *
   * Not memoised and handed to JSX: a memoised URL revoked from a cleanup is
   * already dead by the time development's second effect run looks for it, and
   * this element is the one that has to keep playing. Holding it in state
   * instead would mean a render pass between creating the URL and using it, for
   * a value that is only ever read by one DOM node. The wizard's video step
   * assigns its source the same way.
   *
   * A saved source is already a URL and is passed through to `src` untouched —
   * revoking one would break the caller's own reference to it.
   */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !localFile) return;
    const url = URL.createObjectURL(localFile);
    el.src = url;
    return () => {
      // Detach before revoking — Safari otherwise keeps a handle on a
      // multi-gigabyte blob for the life of the page.
      el.pause();
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
  }, [localFile]);

  const sourceUrl = source.kind === "saved" ? source.url : "";

  /**
   * A new recording invalidates everything measured against the old one.
   *
   * Adjusted during render rather than in an effect — React's own pattern for
   * a value derived from a prop that changed — so the step never paints one
   * frame of the previous file's confirmed time beside the new recording. The
   * field is reset rather than carried across: a time that was right for
   * another file is not a head start, it is a wrong answer already typed in.
   */
  const sourceKey =
    source.kind === "saved" ? source.url : (localFile?.name ?? "");
  const [lastSourceKey, setLastSourceKey] = useState(sourceKey);
  if (sourceKey !== lastSourceKey) {
    setLastSourceKey(sourceKey);
    setConfirmedTimeState(
      savedConfirmedSeconds === null
        ? ""
        : formatConfirmedVideoTime(savedConfirmedSeconds),
    );
    setZeroAcknowledged(false);
    setMediaStatus("loading");
    setPlaybackDurationSeconds(0);
    setCurrentTimeSeconds(0);
    setPlayNotice(null);
  }

  /* ---------------------------------------------------------------------
   * Source timing and the plan
   * ------------------------------------------------------------------ */

  const timing = useMemo(
    () => summarizeSourceTiming(points, shots),
    [points, shots],
  );

  /**
   * Coverage is measured against the parsed duration when there is one.
   *
   * Zero while metadata is still loading, which `planAlignment` refuses with
   * `unsupported_media`/`video_duration_unusable` — so the plan is simply not
   * computed until a duration exists, rather than showing a refusal about a
   * file that is merely still opening.
   */
  const coverageDurationSeconds =
    declaredDurationSeconds && declaredDurationSeconds > 0
      ? declaredDurationSeconds
      : playbackDurationSeconds;

  const plan = useMemo<MatchVideoResult<Alignment> | null>(() => {
    if (confirmedTime.trim().length === 0) return null;
    if (!(coverageDurationSeconds > 0)) return null;
    return planAlignment({
      points,
      shots,
      confirmedVideoTime: confirmedTime,
      videoDurationSeconds: coverageDurationSeconds,
    });
  }, [confirmedTime, coverageDurationSeconds, points, shots]);

  // The timing refusal outranks anything about the entered time: a match that
  // cannot be aligned at all should say so rather than blame what was typed.
  const error: MatchVideoError | null = !timing.ok
    ? timing.error
    : plan && !plan.ok
      ? plan.error
      : null;

  const confirmedSeconds = plan?.ok
    ? plan.value.confirmedVideoTimeSeconds
    : null;

  const needsZeroConfirmation = confirmedSeconds === 0 && !zeroAcknowledged;

  const isNoOpCorrection =
    savedConfirmedSeconds !== null &&
    confirmedSeconds !== null &&
    confirmedSeconds === savedConfirmedSeconds;

  const canSubmit =
    timing.ok &&
    plan !== null &&
    plan.ok &&
    !needsZeroConfirmation &&
    !isNoOpCorrection;

  /* ---------------------------------------------------------------------
   * Reporting upward
   * ------------------------------------------------------------------ */

  const notify = useRef(onAlignmentChange);
  useEffect(() => {
    notify.current = onAlignmentChange;
  }, [onAlignmentChange]);

  const submittable = canSubmit && plan?.ok ? plan.value : null;
  useEffect(() => {
    notify.current?.(submittable);
  }, [submittable]);

  /* ---------------------------------------------------------------------
   * Entering a time
   * ------------------------------------------------------------------ */

  /**
   * The one writer of the field, and therefore the one place a zero can be
   * introduced. Typing and Use current time both land here, so both clear the
   * acknowledgement and both are made to confirm again.
   */
  const setConfirmedTime = useCallback((text: string) => {
    setConfirmedTimeState(text);
    setZeroAcknowledged(false);
  }, []);

  const useCurrentTime = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setConfirmedTime(formatConfirmedVideoTime(el.currentTime));
  }, [setConfirmedTime]);

  const confirmZero = useCallback(() => setZeroAcknowledged(true), []);

  /* ---------------------------------------------------------------------
   * Playback
   * ------------------------------------------------------------------ */

  const seekTo = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    const ceiling = Number.isFinite(el.duration) ? el.duration : seconds;
    const next = Math.max(0, Math.min(ceiling, seconds));
    el.currentTime = next;
    setCurrentTimeSeconds(next);
  }, []);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const el = videoRef.current;
      if (!el) return;
      seekTo(el.currentTime + deltaSeconds);
    },
    [seekTo],
  );

  /**
   * Play or pause, keeping a declined `play()` out of the error channel.
   *
   * The promise is optional in older engines, hence the guard; when it exists,
   * a rejection is reported as what it is. `NotAllowedError` is a policy — the
   * gesture did not count, or the tab is not allowed to start audio — and
   * `AbortError` means a newer load interrupted this one. Neither says anything
   * about the file, and neither may set `mediaError`.
   */
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    setPlayNotice(null);
    const started = el.play() as Promise<void> | undefined;
    if (!started || typeof started.catch !== "function") return;
    void started.catch((reason: unknown) => {
      const name =
        reason && typeof reason === "object" && "name" in reason
          ? String((reason as { name: unknown }).name)
          : "";
      setIsPlaying(false);
      setPlayNotice(
        name === "AbortError"
          ? "Playback was interrupted while the video was still loading. Press play again."
          : "Your browser did not start playback. Press play again, or scrub to the first point instead.",
      );
    });
  }, []);

  /**
   * Jump to where this alignment says the match ends, a few seconds early.
   *
   * Only offered once a plan exists, because the video-clock position it seeks
   * to is derived from that plan's offset. It is a check on the alignment, not
   * a second way to set one: it never writes the field.
   */
  const previewLastPoint = useCallback(() => {
    if (!plan?.ok) return;
    const end = plan.value.coverage.requiredVideoEndSeconds;
    seekTo(Math.max(0, end - PREVIEW_LEAD_SECONDS));
  }, [plan, seekTo]);

  const onLoadedMetadata = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = event.currentTarget;
      setMediaStatus("ready");
      setPlaybackDurationSeconds(
        Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0,
      );
      // `preload="metadata"` knows the dimensions but has decoded no frame, so
      // the player sits black until something seeks it.
      if (el.currentTime === 0) el.currentTime = 0.001;
    },
    [],
  );

  const onTimeUpdate = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) =>
      setCurrentTimeSeconds(event.currentTarget.currentTime),
    [],
  );

  const onSeeked = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) =>
      setCurrentTimeSeconds(event.currentTarget.currentTime),
    [],
  );

  const onMediaError = useCallback(() => {
    setMediaStatus("error");
    setIsPlaying(false);
    // A real media failure clears any stale play notice: the quieter message
    // would otherwise sit under the alert suggesting a second press would help.
    setPlayNotice(null);
  }, []);

  const onPlay = useCallback(() => {
    setIsPlaying(true);
    setPlayNotice(null);
  }, []);

  const onPause = useCallback(() => setIsPlaying(false), []);

  return {
    videoRef,
    sourceUrl,
    mediaStatus,
    playbackDurationSeconds,
    currentTimeSeconds,
    isPlaying,
    playNotice,
    timing,
    confirmedTime,
    plan,
    error,
    needsZeroConfirmation,
    isNoOpCorrection,
    canSubmit,
    setConfirmedTime,
    useCurrentTime,
    confirmZero,
    togglePlay,
    seekBy,
    seekTo,
    previewLastPoint,
    onLoadedMetadata,
    onTimeUpdate,
    onSeeked,
    onMediaError,
    onPlay,
    onPause,
  };
}
