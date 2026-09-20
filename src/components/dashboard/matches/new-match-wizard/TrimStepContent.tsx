"use client";

/**
 * TrimStepContent — step 3: the video check.
 *
 * The one screen where the file is the interface. A 16:9 player on ink-900
 * with a row of 28px controls in a bottom gradient — the jumps and frame steps
 * ranged longest-outward around play, then mute — and the playhead time in a
 * mono capsule; beneath it the filmstrip, trimmed-out ends washed in page
 * tone, the kept window one 2px Signal Blue bracket whose ends are the
 * handles; under it the two cut readouts and one line of key chips — I and O
 * move a cut to wherever the video already is; then the two camera questions
 * the vendor refuses a job without. Design: Upload Wizard v5, frame 3c.
 *
 * Everything runs against the LOCAL file through an object URL, so trimming
 * is instant and nothing leaves the browser.
 *
 * ── What the rail does, and what it doesn't ─────────────────────────────────
 * A press anywhere on it plays from there — the rail is the only place that
 * says "show me this part of the match", and watching is how you tell whether
 * the first serve sits inside the window. The bracket is a MARK, not a
 * control: it cannot be dragged as a whole, so there is no gesture that moves
 * both cuts at once and no way to shift a placed window by accident. Only the
 * two handles drag.
 *
 * The rail once zoomed ~14x around a handle you held still for 200ms, and
 * panned when you dragged near an edge. It rescaled the coordinate system
 * mid-gesture — slow down to be precise and the whole rail jumped, which read
 * as a bug rather than as help, and the animation ran setState every frame on
 * top of the drag's own. Precision lives in the keyboard now: a focused handle
 * arrows one frame at a time (a second with Shift), and I/O put a cut exactly
 * where the playhead is after you have scrubbed to the frame you want.
 *
 * ── Why a drag is local until you let go ────────────────────────────────────
 * A drag used to write every pointer sample into the wizard's form state and
 * seek the video on each one. That re-rendered the whole flow per pixel and
 * queued a decode per pixel on a multi-gigabyte file — the handle lagged the
 * pointer and the frame arrived late. Now the handle follows the pointer from
 * a ref at frame cadence, the video seeks to the LATEST position only once
 * the previous seek has landed, and the form learns the cut on release.
 *
 * ── Attribution ─────────────────────────────────────────────────────────────
 * `initialTopPlayerIsPlayer1` is camera-relative and about the START OF THE
 * SELECTED WINDOW only — ends change every odd game. The browser cuts the file
 * to this window before upload, so the window's first frame is the vendor's
 * frame zero; an answer about the recording's first frame is wrong whenever
 * the window starts after an odd number of games. It is what maps the vendor's
 * per-player predictions back onto the right person, so it is asked here
 * beside the frame it describes, never defaulted, and Continue sleeps until
 * both answers are given (`docs/ui-revamp-guardrails.md` §3.1).
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Info,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { useVideoFilmstrip } from "@/hooks/use-video-filmstrip";
import { JUMP_STEP_SECONDS } from "../match-video-attachment/use-attachment-alignment";
import type { VideoProbeSummary } from "./types";
import { focusRingCls, noteStripCls } from "./styles";
import { Kbd } from "@/components/ui/kbd";
import { isFormControl } from "./useWizardKeys";
import { formatClipLength, formatClock, formatTimecode } from "./utils";
import { FieldCaption } from "./FieldCaption";

/** The two camera answers, by their FormData field. */
export type CameraAnswer = "fixedCamera" | "initialTopPlayerIsPlayer1";

export interface TrimStepContentProps {
  videoFile: File | null;
  probe: VideoProbeSummary | null;
  startSeconds: number | undefined;
  endSeconds: number | undefined;
  /** Provider-supplied floor, so this component never names a vendor. */
  minTrimSeconds: number;
  /**
   * What Continue refused with — today, that the window costs more than is
   * left this month. Raised on the click rather than by disabling Continue, so
   * it has to be said HERE: the wizard's shared `error` is otherwise rendered
   * only on the details step, and a refusal nobody can read is a dead button.
   */
  refusal?: string | null;
  /** "Marcus" when the match is a roster player's; null when it is the uploader's. */
  subjectFirstName: string | null;
  fixedCamera: boolean | undefined;
  initialTopPlayerIsPlayer1: boolean | undefined;
  onTrimChange: (startSeconds: number, endSeconds: number) => void;
  onAnswer: (field: CameraAnswer, value: boolean) => void;
}

type Handle = "start" | "end";

const HANDLES: readonly Handle[] = ["start", "end"];

/** Rail height in CSS pixels. Also sets the thumbnail size. */
const RAIL_HEIGHT_PX = 52;

/** Floating frame preview. Height follows the video's own aspect ratio. */
const PREVIEW_WIDTH_PX = 132;

const FALLBACK_ASPECT = 16 / 9;

/**
 * The player's ceiling. 720 × 405 in the design's column — 16:9 fills the
 * width and shares its edges with the rail beneath it, so player and scrubber
 * read as one instrument. Squarer or portrait clips hit the cap and centre.
 */
const PLAYER_MAX_HEIGHT = "405px";

/**
 * The coarse in-frame jump, in seconds. `JUMP_STEP_SECONDS` (10s) is the
 * shared short hop; a minute is what it takes to cross a game on an
 * hours-long recording without dragging the rail.
 */
const LONG_JUMP_SECONDS = 60;

/** A coarse jump in the in-frame control row: a mono caption where the frame
 *  steps carry an icon, the spoken name on the button. */
function JumpButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${controlCls} mono tabular text-[10px] font-medium`}
      aria-label={label}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

const controlCls = `inline-flex size-7 items-center justify-center rounded-[var(--radius-element)] text-white transition-colors duration-150 hover:bg-white/10 ${focusRingCls}`;

/**
 * One of a pair of title-only check-dot cards, 40px tall. The dot is the
 * state; the border and wash confirm it.
 */
function OptionCard({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-3 text-[12px] font-medium whitespace-nowrap text-[var(--ink-900)] transition-colors duration-150 ${
        selected
          ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
          : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]"
      } ${focusRingCls}`}
    >
      {selected ? (
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--blue)]">
          <Check
            className="size-[9px] text-white"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </span>
      ) : (
        <span className="inline-flex size-3.5 shrink-0 rounded-full border border-[var(--ink-300)]" />
      )}
      {label}
    </button>
  );
}

/**
 * One required question: the field caption with the form's red asterisk, a pair of
 * cards, and the contract sentence under them as text-micro.
 */
function Question({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean | undefined;
  options: readonly [
    { value: boolean; label: string },
    { value: boolean; label: string },
  ];
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <FieldCaption label={label} required />
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 gap-2"
      >
        {options.map((option) => (
          <OptionCard
            key={option.label}
            label={option.label}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </div>
      <span className="text-micro">{hint}</span>
    </div>
  );
}

function TrimStepContentImpl({
  videoFile,
  probe,
  startSeconds,
  endSeconds,
  minTrimSeconds,
  refusal = null,
  subjectFirstName,
  fixedCamera,
  initialTopPlayerIsPlayer1,
  onTrimChange,
  onAnswer,
}: TrimStepContentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * The gesture in progress: a cut being moved, or the playhead being scrubbed
   * along the rail. `"scrub"` touches no cut — it only says where to watch.
   */
  const [dragging, setDragging] = useState<Handle | "scrub" | null>(null);
  // Where the drag has taken the cuts so far — shown live, committed to the
  // form on release. Null while nothing is being dragged.
  const [live, setLive] = useState<{ start: number; end: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [railWidth, setRailWidth] = useState(0);

  const duration = probe?.durationSeconds ?? 0;
  // Mirrored for the imperative playhead and the window-level pointer
  // handlers, which must not re-subscribe when a new file changes the length.
  const durationRef = useRef(duration);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  const committedStart = startSeconds ?? 0;
  const committedEnd = endSeconds ?? duration;
  // What the rail draws: the drag in progress, else the form's cuts.
  const start = live?.start ?? committedStart;
  const end = live?.end ?? committedEnd;
  const selectedDuration = Math.max(0, end - start);
  const tooShort = duration > 0 && selectedDuration < minTrimSeconds;

  /** One frame, when we know the rate. Falls back to a reasonable nudge. */
  const frameStep = probe?.fps ? 1 / probe.fps : 0.1;

  const filmstrip = useVideoFilmstrip(videoFile, duration);

  // Playhead and its clock are written imperatively rather than held in state.
  // They update ~4x a second during playback and twice per pointermove while
  // dragging, and nothing else on this step depends on them. Re-rendering the
  // filmstrip and both questions to move one 2px line is waste on the one
  // thread that is busy decoding video.
  const playheadRef = useRef(0);
  const playheadElRef = useRef<HTMLDivElement>(null);
  const clockElRef = useRef<HTMLSpanElement>(null);
  // Mirrors `dragging` for the imperative playhead and the seek callbacks,
  // which must not re-subscribe on every drag. Declared before the callbacks
  // that read it; written in an effect below, never during render.
  const draggingRef = useRef<Handle | "scrub" | null>(null);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  // One object URL per file, created AND revoked inside the effect, and the
  // element's src set from there rather than rendered. Leaking these pins the
  // file handle for the life of the page — but revoking a memoised URL from a
  // cleanup is worse: React runs every effect twice on mount in development,
  // and the second run found the URL already dead and the src already
  // stripped, so the player sat black. Owning both ends here means each run
  // gets a live URL of its own.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoFile) return;
    const url = URL.createObjectURL(videoFile);
    el.src = url;
    return () => {
      // Detach from the element before revoking. Safari otherwise keeps a
      // handle on the source alive — the same teardown order probe.ts uses.
      el.pause();
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
  }, [videoFile]);

  const applyPlayhead = useCallback(() => {
    const clock = clockElRef.current;
    if (clock) clock.textContent = formatTimecode(playheadRef.current);
    const el = playheadElRef.current;
    if (!el) return;
    const total = durationRef.current;
    const pct = total > 0 ? (playheadRef.current / total) * 100 : 0;
    el.style.left = `${pct}%`;
    // Hidden while a CUT is being dragged: the handle and its frame preview
    // are the reference then, and a second marker chasing them a decode
    // behind reads as jitter rather than as information. A scrub is the
    // opposite case — the playhead is the thing the gesture moves.
    const hidden =
      pct < 0 ||
      pct > 100 ||
      (draggingRef.current !== null && draggingRef.current !== "scrub");
    el.style.opacity = hidden ? "0" : "1";
  }, []);

  // A new source rewinds the playhead.
  useEffect(() => {
    playheadRef.current = 0;
    return () => {};
  }, [videoFile]);

  // Rail width drives how many thumbnails tile across it.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    setRailWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      setRailWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoFile]);

  const seekTo = useCallback(
    (time: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(duration, time));
    },
    [duration],
  );

  // The position a drag most recently asked the video for. Seeks are
  // expensive on a large file and the element services one at a time, so
  // while one is in flight the newest request waits here and is issued from
  // handleSeeked — the frame shown is always the latest, never a backlog.
  const wantedSeekRef = useRef<number | null>(null);
  const seekLatest = useCallback(
    (time: number) => {
      const el = videoRef.current;
      if (!el) return;
      // Clamped BEFORE it is parked: `seekBy` and the I/O keys read the parked
      // value as the truthful position, and a raw overshoot (+1m near the end)
      // would have the next −10s measured from beyond the file.
      const clamped = Math.max(0, Math.min(duration, time));
      wantedSeekRef.current = clamped;
      if (el.seeking) return;
      wantedSeekRef.current = null;
      el.currentTime = clamped;
    },
    [duration],
  );

  const positionFromEvent = useCallback((clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * durationRef.current;
  }, []);

  /** Single clamp for both cuts. */
  const clampCut = useCallback(
    (handle: Handle, time: number, other: number): number =>
      handle === "start"
        ? Math.max(0, Math.min(time, other - frameStep))
        : Math.min(duration, Math.max(time, other + frameStep)),
    [duration, frameStep],
  );

  /** A keyboard nudge commits at once — one step, one write. */
  const moveHandle = useCallback(
    (handle: Handle, time: number) => {
      if (handle === "start") {
        const next = clampCut("start", time, end);
        onTrimChange(next, end);
        seekTo(next);
      } else {
        const next = clampCut("end", time, start);
        onTrimChange(start, next);
        seekTo(next);
      }
    },
    [start, end, clampCut, onTrimChange, seekTo],
  );

  // The drag itself. The pointer's position lands in a ref; one frame later
  // the rail redraws from it and the video is asked for that frame. Nothing
  // reaches the form until release.
  const liveRef = useRef<{ start: number; end: number } | null>(null);
  const liveRafRef = useRef<number | null>(null);
  const applyDrag = useCallback(
    (grab: Handle, time: number) => {
      const current = liveRef.current ?? {
        start: committedStart,
        end: committedEnd,
      };
      liveRef.current =
        grab === "start"
          ? { start: clampCut("start", time, current.end), end: current.end }
          : { start: current.start, end: clampCut("end", time, current.start) };
      if (liveRafRef.current === null) {
        liveRafRef.current = requestAnimationFrame(() => {
          liveRafRef.current = null;
          const value = liveRef.current;
          if (!value) return;
          setLive(value);
          seekLatest(grab === "end" ? value.end : value.start);
        });
      }
    },
    [committedStart, committedEnd, clampCut, seekLatest],
  );

  /** Play, without the toggle — what letting go of the rail does. */
  const play = useCallback(() => {
    const el = videoRef.current;
    if (el?.paused) void el.play().catch(() => undefined);
  }, []);

  // Drag inputs go through a ref so the window subscription keys only on
  // `dragging`. Written in an effect, not during render.
  const dragCtx = useRef({
    applyDrag,
    positionFromEvent,
    duration,
    onTrimChange,
    seekTo,
    seekLatest,
    play,
  });
  useEffect(() => {
    dragCtx.current = {
      applyDrag,
      positionFromEvent,
      duration,
      onTrimChange,
      seekTo,
      seekLatest,
      play,
    };
  });

  useEffect(() => {
    if (!dragging) return;

    // The cursor stays the drag's own for the whole gesture, even when the
    // pointer leaves the 24px handle — otherwise it flickers to an arrow the
    // moment you move faster than the handle can follow.
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor =
      dragging === "scrub" ? "grabbing" : "ew-resize";

    const onMove = (e: PointerEvent) => {
      const ctx = dragCtx.current;
      const time = ctx.positionFromEvent(e.clientX);
      // A scrub writes nothing: it walks the playhead, and the player is the
      // output. Seeks coalesce, so a fast sweep across a multi-gigabyte file
      // decodes the frames it can keep up with rather than queueing all of
      // them.
      if (dragging === "scrub") ctx.seekLatest(time);
      else ctx.applyDrag(dragging, time);
    };

    const onUp = () => {
      if (liveRafRef.current !== null) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = null;
      }
      // Let go of a scrub and it plays from where you landed — the same thing
      // a press on the rail does, a click being a scrub that never moved.
      if (dragging === "scrub") {
        setDragging(null);
        dragCtx.current.play();
        return;
      }
      // Release is the one write: the form learns the cuts, and the video is
      // asked for the frame the cut actually landed on.
      const value = liveRef.current;
      liveRef.current = null;
      wantedSeekRef.current = null;
      if (value) {
        dragCtx.current.onTrimChange(value.start, value.end);
        dragCtx.current.seekTo(dragging === "end" ? value.end : value.start);
      }
      setLive(null);
      setDragging(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const startDrag = useCallback(
    (grab: Handle) => {
      liveRef.current = { start: committedStart, end: committedEnd };
      setLive(liveRef.current);
      setDragging(grab);
    },
    [committedStart, committedEnd],
  );

  const nudge = useCallback(
    (handle: Handle, direction: -1 | 1, coarse = false) => {
      const from = handle === "start" ? start : end;
      moveHandle(handle, from + (coarse ? 1 : frameStep) * direction);
    },
    [start, end, frameStep, moveHandle],
  );

  /**
   * Jump relative to where the video is *going*, not where it is.
   *
   * `el.currentTime` lags while a seek is in flight, so five quick taps on
   * +10s all measured from the same stale frame and moved ten seconds in
   * total. The pending request is the truthful origin when there is one.
   */
  const seekBy = useCallback(
    (delta: number) => {
      const el = videoRef.current;
      if (!el) return;
      seekLatest((wantedSeekRef.current ?? el.currentTime) + delta);
    },
    [seekLatest],
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
  }, []);

  /**
   * Put a cut where the video already is — scrub to the first serve, press I,
   * and the window starts there. `moveHandle` owns the clamp and the
   * write; this only decides *which* time is meant.
   */
  const setHandleToPlayhead = useCallback(
    (handle: Handle) => {
      const el = videoRef.current;
      if (!el) return;
      // A pending seek is the truthful position, for the same reason `seekBy`
      // reads it: `currentTime` lags while one is in flight, so pressing this
      // straight after a jump would otherwise cut at the frame you left.
      const time = wantedSeekRef.current ?? el.currentTime;
      // Refused rather than clamped on the wrong side of the other cut: a
      // clamp would land one frame off that cut, which reads as the key
      // having picked a time of its own.
      if (
        handle === "start" ? time >= end - frameStep : time <= start + frameStep
      ) {
        return;
      }
      moveHandle(handle, time);
    },
    [start, end, frameStep, moveHandle],
  );

  /**
   * The step's own keyboard, scoped to this subtree.
   *
   * A React handler on the step root rather than a listener on `window`: the
   * trim handles own their arrows (one frame, or a second with Shift) and stop
   * the event here, which a native document listener would never see because
   * React delegates at the root. Everything the wizard itself reads is left
   * alone — `Enter` is Continue and `Escape` is Back (`useWizardKeys`), and a
   * ctrl/meta/alt chord is somebody else's shortcut.
   */
  const onStepKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isFormControl(e.target)) return;
      // The camera questions are radio cards, and a radiogroup's arrows belong
      // to it — seeking the video (or moving a cut on I/O) from inside a
      // question would be this step answering a key meant for that one.
      if ((e.target as HTMLElement | null)?.closest?.('[role="radiogroup"]')) {
        return;
      }
      switch (e.key) {
        case " ":
        case "Spacebar": {
          // Space on a focused <button> is that button's own activation.
          // Handling it here would toggle playback AND press the button.
          const node = e.target as HTMLElement | null;
          if (node?.closest?.("button")) return;
          e.preventDefault();
          togglePlay();
          return;
        }
        case "ArrowLeft":
          e.preventDefault();
          seekBy(e.shiftKey ? -LONG_JUMP_SECONDS : -JUMP_STEP_SECONDS);
          return;
        case "ArrowRight":
          e.preventDefault();
          seekBy(e.shiftKey ? LONG_JUMP_SECONDS : JUMP_STEP_SECONDS);
          return;
        case "i":
        case "I":
          e.preventDefault();
          setHandleToPlayhead("start");
          return;
        case "o":
        case "O":
          e.preventDefault();
          setHandleToPlayhead("end");
          return;
        default:
          return;
      }
    },
    [togglePlay, seekBy, setHandleToPlayhead],
  );

  /**
   * Keep the playhead marker in step, and paint the floating preview from the
   * main player — the drag already seeks it, so the frame it just landed on
   * costs a canvas blit instead of a whole extra decode.
   */
  const handleSeeked = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
      playheadRef.current = el.currentTime;
      applyPlayhead();

      // A drag — or a jump button — asked for a newer frame while this one
      // was decoding. Flushing it is what makes `seekLatest` a coalescer
      // rather than a dropper; gating it on a drag stranded the last tap.
      const wanted = wantedSeekRef.current;
      if (wanted !== null) {
        wantedSeekRef.current = null;
        el.currentTime = Math.max(0, Math.min(el.duration || wanted, wanted));
      }

      if (!draggingRef.current || draggingRef.current === "scrub") return;
      const canvas = previewCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      try {
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      } catch {
        // A codec the browser will decode but not paint. The clocks and the
        // rail still work; only the thumbnail is missing.
      }
    },
    [applyPlayhead],
  );

  /**
   * Force the first frame to paint. With `preload="metadata"` the element
   * knows its dimensions but has not decoded a frame, so the player sits black
   * until something seeks it.
   */
  const paintFirstFrame = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
      if (el.currentTime === 0) el.currentTime = 0.001;
    },
    [],
  );

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      playheadRef.current = e.currentTarget.currentTime;
      applyPlayhead();
    },
    [applyPlayhead],
  );

  // ---- Derived geometry ----

  const pct = useCallback(
    (time: number) => (duration > 0 ? (time / duration) * 100 : 0),
    [duration],
  );

  const startPct = pct(start);
  const endPct = pct(end);
  const draggedPct =
    dragging === "start" ? pct(start) : dragging === "end" ? pct(end) : 0;

  // Zoomed, a handle routinely sits outside the window. The bracket that spans
  // the selection is clipped to the rail; the handles themselves are hidden
  // rather than pinned to an edge, since a marker parked at 0% reads as "the
  // cut is here", which is exactly wrong.
  const visibleStartPct = Math.max(0, Math.min(100, startPct));
  const visibleEndPct = Math.max(0, Math.min(100, endPct));
  const selectionWidthPct = Math.max(0, visibleEndPct - visibleStartPct);

  const aspect =
    probe && probe.width > 0 && probe.height > 0
      ? probe.width / probe.height
      : FALLBACK_ASPECT;
  const previewHeightPx = Math.round(PREVIEW_WIDTH_PX / aspect);

  /**
   * Thumbnails tile at their natural aspect and are looked up by time. Zoomed
   * in, neighbouring slots resolve to the same sample and the strip visibly
   * repeats — which is honest: twenty frames is what was decoded.
   */
  const slots = useMemo(() => {
    const thumbWidth = Math.max(24, Math.round(RAIL_HEIGHT_PX * aspect));
    const count = railWidth > 0 ? Math.ceil(railWidth / thumbWidth) : 0;
    const frames = filmstrip.frames;
    if (count === 0 || frames.length === 0 || duration <= 0) return [];

    return Array.from({ length: count }, (_, i) => {
      const time = ((i + 0.5) / count) * duration;
      const index = Math.round((time / duration) * frames.length - 0.5);
      return {
        key: i,
        src: frames[Math.max(0, Math.min(frames.length - 1, index))],
      };
    });
  }, [aspect, railWidth, filmstrip.frames, duration]);

  const who = subjectFirstName ?? "You";

  // A saved draft keeps the trim window and the answers but cannot keep the
  // File, so there is nothing to check against. The footer's Continue sleeps
  // on the same fact.
  if (!videoFile) {
    return (
      <div className={noteStripCls}>
        <Info
          className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span>
          A saved draft keeps everything but the video. Go back a step and pick
          the file again to check it here.
        </span>
      </div>
    );
  }

  return (
    // `tabIndex={-1}` so a click on the player or the rail — neither of which
    // is focusable — lands focus on this root instead of the body, and the
    // keys below work without first tabbing to a control. It stays out of the
    // tab order, and out of the wizard chord's field walk, which skips
    // `tabindex="-1"` on purpose.
    <div
      tabIndex={-1}
      onKeyDown={onStepKeyDown}
      className="flex flex-col gap-5 outline-none"
    >
      {/* Player — local playback, no network. Native controls are omitted
          because the rail below is the scrub surface; a second timeline inside
          the frame would compete with it. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-[var(--radius-element)] bg-[var(--ink-900)]"
        style={{
          aspectRatio: aspect,
          maxHeight: PLAYER_MAX_HEIGHT,
          maxWidth: `calc(${PLAYER_MAX_HEIGHT} * ${aspect})`,
        }}
      >
        {/* No src here — the effect above sets it from the file. */}
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          onLoadedMetadata={paintFirstFrame}
          onSeeked={handleSeeked}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          className="block size-full cursor-pointer bg-black object-contain"
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/55 to-transparent pt-8 pb-2.5">
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Coarse jumps flank the frame steps, longest on the outside, so
                the row reads as one scale from a minute down to a frame. */}
            <JumpButton
              label="Back one minute"
              onClick={() => seekBy(-LONG_JUMP_SECONDS)}
            >
              −1m
            </JumpButton>
            <JumpButton
              label="Back ten seconds"
              onClick={() => seekBy(-JUMP_STEP_SECONDS)}
            >
              −10s
            </JumpButton>
            <button
              type="button"
              onClick={() => seekBy(-frameStep)}
              className={controlCls}
              aria-label="Back one frame"
            >
              <SkipBack
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className={controlCls}
            >
              {isPlaying ? (
                <Pause
                  className="size-4"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <Play className="size-4" strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => seekBy(frameStep)}
              className={controlCls}
              aria-label="Forward one frame"
            >
              <SkipForward
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
            <JumpButton
              label="Forward ten seconds"
              onClick={() => seekBy(JUMP_STEP_SECONDS)}
            >
              +10s
            </JumpButton>
            <JumpButton
              label="Forward one minute"
              onClick={() => seekBy(LONG_JUMP_SECONDS)}
            >
              +1m
            </JumpButton>
            <span className="mx-1 h-3 w-px bg-white/35" aria-hidden="true" />
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className={controlCls}
            >
              {isMuted ? (
                <VolumeX
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <Volume2
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
            </button>
          </div>
        </div>

        {/* Playhead time — text written imperatively, see applyPlayhead. */}
        <span
          ref={clockElRef}
          className="mono tabular pointer-events-none absolute top-2.5 right-2.5 rounded-[var(--radius-cell)] bg-black/55 px-1.5 py-0.5 text-[10px] text-white/85"
        >
          {formatTimecode(0)}
        </span>
      </div>

      {/* Trim */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2.5">
          <span className="eyebrow whitespace-nowrap">Trim to the match</span>
          <span className="flex-1" />
          {/* The window against the file. */}
          <span className="mono tabular text-[11px] text-[var(--ink-500)]">
            {formatTimecode(selectedDuration)} of {formatTimecode(duration)}
          </span>
        </div>

        <div className="relative py-0.5">
          {/* Live frame at the handle being dragged. Sits above the rail on its
              own layer so showing it never reflows the strip. */}
          {dragging && dragging !== "scrub" ? (
            <div
              className="pointer-events-none absolute bottom-[calc(100%+8px)] z-10 overflow-hidden rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-white shadow-[var(--shadow-dropdown)]"
              style={{
                width: PREVIEW_WIDTH_PX,
                left: `clamp(0px, calc(${draggedPct}% - ${PREVIEW_WIDTH_PX / 2}px), calc(100% - ${PREVIEW_WIDTH_PX}px))`,
              }}
            >
              <canvas
                ref={previewCanvasRef}
                width={PREVIEW_WIDTH_PX * 2}
                height={previewHeightPx * 2}
                className="block w-full bg-[var(--ink-900)]"
                style={{ height: previewHeightPx }}
              />
              <div className="mono tabular bg-white py-1 text-center text-[10px] text-[var(--ink-700)]">
                {formatClock(dragging === "start" ? start : end, {
                  tenths: true,
                })}
              </div>
            </div>
          ) : null}

          {/* Rail. Press and sweep to look through the match; let go and it
              plays from there. Only the two handles move a cut. */}
          <div
            ref={railRef}
            onPointerDown={(e) => {
              // Press, and keep the pointer: the playhead follows it for as
              // long as you hold, so a sweep along the rail is a look through
              // the match. Let go and it plays from where you stopped.
              e.preventDefault();
              seekLatest(positionFromEvent(e.clientX));
              setDragging("scrub");
            }}
            className="relative cursor-pointer touch-none rounded-[var(--radius-element)] bg-[var(--ink-900)] select-none"
            style={{ height: RAIL_HEIGHT_PX }}
          >
            {duration > 0 ? (
              <>
                {/* Filmstrip */}
                <div
                  className={`absolute inset-0 flex overflow-hidden rounded-[var(--radius-element)] transition-opacity duration-200 ${"opacity-100"}`}
                >
                  {slots.map((slot) => (
                    <div key={slot.key} className="h-full min-w-0 flex-1">
                      {slot.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={slot.src}
                          alt=""
                          draggable={false}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
                <span className="pointer-events-none absolute inset-0 rounded-[var(--radius-element)] bg-[rgba(13,13,13,0.22)]" />

                {filmstrip.isExtracting ? (
                  <span className="eyebrow-sm pointer-events-none absolute top-2 right-2 rounded-[var(--radius-cell)] bg-black/55 px-1.5 py-0.5 text-white/70">
                    Reading frames
                  </span>
                ) : null}

                {/* Trimmed-out ends, washed in page tone */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[var(--radius-element)] bg-[rgba(250,250,250,0.86)]"
                  style={{ width: `${visibleStartPct}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 rounded-r-[var(--radius-element)] bg-[rgba(250,250,250,0.86)]"
                  style={{ width: `${100 - visibleEndPct}%` }}
                />

                {/* The kept window: one 2px Signal Blue bracket. A mark, not
                    a control — a press inside it reaches the rail and plays
                    from there, and only the two handles move a cut. */}
                <div
                  role="presentation"
                  className="pointer-events-none absolute -top-0.5 -bottom-0.5 z-[1] rounded-[4px] border-2 border-[var(--blue)]"
                  style={{
                    left: `${visibleStartPct}%`,
                    width: `${selectionWidthPct}%`,
                  }}
                />

                {/* Playhead — a single quiet hairline the rail's own height,
                    position written imperatively (see applyPlayhead). */}
                <div
                  ref={playheadElRef}
                  className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-white/75"
                  style={{ left: 0 }}
                />

                {/* Handles — the bracket's ends, 10px with a white grip line.
                    The hit area is wider than the mark. */}
                {HANDLES.map((handle) => {
                  const value = handle === "start" ? start : end;
                  const handlePct = pct(value);
                  if (handlePct < 0 || handlePct > 100) return null;
                  return (
                    <div
                      key={handle}
                      role="slider"
                      tabIndex={0}
                      aria-label={
                        handle === "start" ? "Trim start" : "Trim end"
                      }
                      aria-valuemin={0}
                      aria-valuemax={duration}
                      aria-valuenow={value}
                      aria-valuetext={formatClock(value, { tenths: true })}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        startDrag(handle);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
                          return;
                        }
                        // A focused handle owns its arrows: one frame, or a
                        // second with Shift. Stopping here keeps the step's
                        // ±10s / ±60s seek from firing as well — it is a React
                        // handler on the step root for exactly this reason.
                        e.preventDefault();
                        e.stopPropagation();
                        nudge(
                          handle,
                          e.key === "ArrowLeft" ? -1 : 1,
                          e.shiftKey,
                        );
                      }}
                      className={`group/handle absolute -top-0.5 -bottom-0.5 z-[3] w-6 cursor-ew-resize ${focusRingCls}`}
                      style={{ left: `calc(${handlePct}% - 13px)` }}
                    >
                      {/* 10px of Signal Blue on a 24px grab; hover and the
                          drag itself darken it so the hand knows it has it. */}
                      <span
                        className={`absolute inset-y-0 left-[7px] w-[10px] transition-colors duration-[var(--duration-hover)] group-hover/handle:bg-[var(--blue-hover)] ${
                          dragging === handle
                            ? "bg-[var(--blue-hover)]"
                            : "bg-[var(--blue)]"
                        } ${handle === "start" ? "rounded-l-[4px]" : "rounded-r-[4px]"}`}
                      >
                        <span className="absolute top-1/2 left-1 -mt-[7px] h-3.5 w-0.5 rounded-[1px] bg-white/90" />
                      </span>
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>
        </div>

        {/* START / END under the strip's own edges. Each readout is also the
            way back to its own cut: after scrubbing away, the number you want
            to check is the thing you click. Seeking only moves the playhead —
            the cut itself is untouched. */}
        <div className="flex items-baseline justify-between px-0.5 pt-0.5">
          <button
            type="button"
            onClick={() => seekLatest(start)}
            aria-label="Jump to the trim start"
            className={`inline-flex cursor-pointer items-baseline gap-1.5 rounded-[var(--radius-cell)] ${focusRingCls}`}
          >
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              Start
            </span>
            <span className="mono tabular text-[12px] font-medium text-[var(--ink-900)]">
              {formatTimecode(start)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => seekLatest(end)}
            aria-label="Jump to the trim end"
            className={`inline-flex cursor-pointer items-baseline gap-1.5 rounded-[var(--radius-cell)] ${focusRingCls}`}
          >
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              End
            </span>
            <span className="mono tabular text-[12px] font-medium text-[var(--ink-900)]">
              {formatTimecode(end)}
            </span>
          </button>
        </div>

        {/* The keys, once, where the hands already are. `Kbd` is the product's
            one keyboard chip; `sm` is its inline-hint size, and a combo is
            adjacent chips, never one chip holding both keys. Lowercase for
            word-named keys, as the roster's hint and Help write them. */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-[1.5] text-[var(--ink-600)]">
          <Kbd size="sm">space</Kbd>
          <span>play</span>
          <span aria-hidden="true" className="text-[var(--ink-300)]">
            ·
          </span>
          <Kbd size="sm">←</Kbd>
          <Kbd size="sm">→</Kbd>
          <span>10 s</span>
          <span aria-hidden="true" className="text-[var(--ink-300)]">
            ·
          </span>
          <Kbd size="sm">shift</Kbd>
          <Kbd size="sm">←</Kbd>
          <Kbd size="sm">→</Kbd>
          <span>1 min</span>
          <span aria-hidden="true" className="text-[var(--ink-300)]">
            ·
          </span>
          <Kbd size="sm">I</Kbd>
          <span>set start</span>
          <span aria-hidden="true" className="text-[var(--ink-300)]">
            ·
          </span>
          <Kbd size="sm">O</Kbd>
          <span>set end</span>
        </p>

        {tooShort ? (
          <div className={noteStripCls}>
            <XCircle
              className="mt-0.5 size-[13px] shrink-0 text-[var(--error)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              The window is under {formatClipLength(minTrimSeconds)} — widen it
              to cover the match.
            </span>
          </div>
        ) : null}

        {refusal ? (
          <div className={noteStripCls} role="alert">
            <XCircle
              className="mt-0.5 size-[13px] shrink-0 text-[var(--error)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>{refusal}</span>
          </div>
        ) : null}
      </div>

      {/* The two camera questions, under the strip. Both required — the
          analysis refuses a job without them, and the wrong answer to the
          second attributes every statistic to the wrong player. */}
      <div className="mt-2 grid grid-cols-2 gap-8 border-t border-[var(--border-hairline)] pt-6">
        <Question
          label="Camera"
          hint="For the whole recording"
          value={fixedCamera}
          options={[
            { value: true, label: "Fixed" },
            { value: false, label: "Moved or panned" },
          ]}
          onChange={(v) => onAnswer("fixedCamera", v)}
        />
        <Question
          label={`${who} at the start`}
          hint="At the start of your selected window — ends change every odd game"
          value={initialTopPlayerIsPlayer1}
          options={[
            { value: true, label: "Top of frame" },
            { value: false, label: "Bottom of frame" },
          ]}
          onChange={(v) => onAnswer("initialTopPlayerIsPlayer1", v)}
        />
      </div>
    </div>
  );
}

export const TrimStepContent = memo(TrimStepContentImpl);
