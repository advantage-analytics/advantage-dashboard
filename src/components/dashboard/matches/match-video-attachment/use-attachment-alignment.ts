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
 *
 * **Marking sets the cut (add and replace).** When `trim` is passed, a marked
 * first point also places the kept window: `defaultAttachmentTrimWindow` pads
 * it before the serve and after SwingVision's last point. Either end can then
 * be moved to the playhead. An adjusted window is keyed to the mark it was
 * adjusted against, so marking a different first point puts both cuts back on
 * their defaults without an effect having to notice — and a window that no
 * longer covers the match is refused with the server's own coverage rule
 * (`planTrimmedAlignment`), which holds the alignment back from the parent.
 * The window reported upward is the one on screen, and it is the one cut.
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
import {
  defaultAttachmentTrimWindow,
  planTrimmedAlignment,
  type AttachmentTrimWindow,
} from "@/lib/match-video/trim-window";
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

/**
 * A kept window and the mark it belongs to.
 *
 * The mark travels with the window because a window is only meaningful
 * against the first point it was placed around: the flow cuts `window` only
 * while `markedSeconds` is still the alignment it is submitting.
 */
export interface AttachmentTrimSelection {
  /** The marked first point, in the ORIGINAL file. */
  markedSeconds: number;
  window: AttachmentTrimWindow;
}

/** Turns the kept-window cut on. Add and replace pass it; adjust never does. */
export interface AttachmentAlignmentTrimOptions {
  /**
   * The default window for a mark. The flow passes its own `trimWindow` dep so
   * the window drawn here is computed exactly as the one it cuts.
   */
  defaultWindow?: typeof defaultAttachmentTrimWindow;
  /** A window adjusted before the step last unmounted (Back, then forward). */
  initial?: AttachmentTrimSelection | null;
  /** The kept window while the step may submit, else null. */
  onChange?: (selection: AttachmentTrimSelection | null) => void;
}

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
  /** Add and replace: the marked first point also sets the kept window. */
  trim?: AttachmentAlignmentTrimOptions;
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

  /** Whether this step cuts the file (add and replace). */
  trimEnabled: boolean;
  /**
   * The duration coverage is measured against: the parsed one when there is
   * one, else the element's. "Keeps … of <this>".
   */
  coverageDurationSeconds: number;
  /** The validated first point in the original file, else null. */
  markedSeconds: number | null;
  /** SwingVision's last required instant on this file's clock, else null. */
  lastPointSeconds: number | null;
  /** The kept window on screen, or null before a first point is marked. */
  trimWindow: AttachmentTrimWindow | null;
  /** The window marking alone would give, for the default captions. */
  defaultTrimWindow: AttachmentTrimWindow | null;
  /** `error` is about the window, not the recording or the time. */
  trimRefused: boolean;

  setConfirmedTime: (text: string) => void;
  useCurrentTime: () => void;
  confirmZero: () => void;
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
  previewLastPoint: () => void;
  /** Move the start cut to the playhead. */
  setTrimStartHere: () => void;
  /** Move the end cut to the playhead. */
  setTrimEndHere: () => void;
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
    trim,
  } = options;
  const trimEnabled = trim !== undefined;
  const windowFor = trim?.defaultWindow ?? defaultAttachmentTrimWindow;

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
  /** An adjusted window, keyed to its mark. Null = the default for any mark. */
  const [trimSelection, setTrimSelection] =
    useState<AttachmentTrimSelection | null>(() => trim?.initial ?? null);

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
    setTrimSelection(null);
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

  const confirmedSeconds = plan?.ok
    ? plan.value.confirmedVideoTimeSeconds
    : null;

  /* ---------------------------------------------------------------------
   * The kept window
   * ------------------------------------------------------------------ */

  const matchSpanSeconds = plan?.ok
    ? plan.value.timing.requiredSourceEndSeconds -
      plan.value.timing.anchorSourceSeconds
    : null;
  const lastPointSeconds =
    confirmedSeconds !== null && matchSpanSeconds !== null
      ? confirmedSeconds + matchSpanSeconds
      : null;

  const defaultTrimWindow = useMemo<AttachmentTrimWindow | null>(() => {
    if (!trimEnabled || !plan?.ok) return null;
    return windowFor({
      markedSeconds: plan.value.confirmedVideoTimeSeconds,
      timing: plan.value.timing,
      videoDurationSeconds: coverageDurationSeconds,
    });
  }, [coverageDurationSeconds, plan, trimEnabled, windowFor]);

  // An adjustment made against a different mark is not this mark's window:
  // marking again puts both cuts back on their defaults.
  const trimWindow: AttachmentTrimWindow | null =
    defaultTrimWindow === null
      ? null
      : trimSelection !== null &&
          trimSelection.markedSeconds === confirmedSeconds
        ? trimSelection.window
        : defaultTrimWindow;

  const trimPlan = useMemo<MatchVideoResult<Alignment> | null>(() => {
    if (!trimWindow || confirmedSeconds === null) return null;
    return planTrimmedAlignment({
      points,
      shots,
      markedSeconds: confirmedSeconds,
      window: trimWindow,
    });
  }, [confirmedSeconds, points, shots, trimWindow]);

  // The timing refusal outranks anything about the entered time: a match that
  // cannot be aligned at all should say so rather than blame what was typed.
  // The window is checked last — it only exists once the time is valid.
  const trimRefused =
    timing.ok && plan?.ok === true && trimPlan !== null && !trimPlan.ok;
  const error: MatchVideoError | null = !timing.ok
    ? timing.error
    : plan && !plan.ok
      ? plan.error
      : trimPlan && !trimPlan.ok
        ? trimPlan.error
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
    !isNoOpCorrection &&
    (!trimEnabled || trimPlan?.ok === true);

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

  const notifyTrim = useRef(trim?.onChange);
  useEffect(() => {
    notifyTrim.current = trim?.onChange;
  }, [trim?.onChange]);

  // Primitives, so a fresh window object with the same bounds is not news.
  const keptMark = canSubmit && trimWindow ? confirmedSeconds : null;
  const keptStart = keptMark !== null ? trimWindow!.startSeconds : null;
  const keptEnd = keptMark !== null ? trimWindow!.endSeconds : null;
  useEffect(() => {
    notifyTrim.current?.(
      keptMark !== null && keptStart !== null && keptEnd !== null
        ? {
            markedSeconds: keptMark,
            window: { startSeconds: keptStart, endSeconds: keptEnd },
          }
        : null,
    );
  }, [keptMark, keptStart, keptEnd]);

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

  /**
   * Move one cut to the playhead, to the millisecond the completion stores.
   *
   * Written against the CURRENT window, so moving the start keeps whatever the
   * end already is — default or adjusted — and vice versa. No clamping to the
   * mark: a start placed after the serve is shown and refused, not corrected
   * behind the person's back.
   */
  const setTrimEdgeHere = useCallback(
    (edge: "start" | "end") => {
      const el = videoRef.current;
      if (!el || !trimWindow || confirmedSeconds === null) return;
      const here = Math.round(el.currentTime * 1000) / 1000;
      setTrimSelection({
        markedSeconds: confirmedSeconds,
        window:
          edge === "start"
            ? { startSeconds: here, endSeconds: trimWindow.endSeconds }
            : { startSeconds: trimWindow.startSeconds, endSeconds: here },
      });
    },
    [confirmedSeconds, trimWindow],
  );
  const setTrimStartHere = useCallback(
    () => setTrimEdgeHere("start"),
    [setTrimEdgeHere],
  );
  const setTrimEndHere = useCallback(
    () => setTrimEdgeHere("end"),
    [setTrimEdgeHere],
  );

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
    trimEnabled,
    coverageDurationSeconds,
    markedSeconds: confirmedSeconds,
    lastPointSeconds,
    trimWindow,
    defaultTrimWindow,
    trimRefused,
    setConfirmedTime,
    useCurrentTime,
    confirmZero,
    togglePlay,
    seekBy,
    seekTo,
    previewLastPoint,
    setTrimStartHere,
    setTrimEndHere,
    onLoadedMetadata,
    onTimeUpdate,
    onSeeked,
    onMediaError,
    onPlay,
    onPause,
  };
}
