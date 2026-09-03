"use client";

/**
 * TrimStepContent — step 3: the video check.
 *
 * The one screen where the file is the interface. A 16:9 player on ink-900
 * with four 28px controls in a bottom gradient — frame-step, play, frame-step,
 * mute — and the playhead time in a mono capsule; beneath it the filmstrip,
 * trimmed-out ends washed in page tone, the kept window one 2px Signal Blue
 * bracket whose ends are the handles; then the two camera questions the vendor
 * refuses a job without. Design: Upload Wizard v5, frame 3c.
 *
 * Everything runs against the LOCAL file through an object URL, so trimming
 * is instant and nothing leaves the browser. Holding a handle zooms the window
 * it spans: these clips are hours long, and at full extent one pixel is
 * several seconds — not a resolution you can place a cut against a serve with.
 *
 * ── Attribution ─────────────────────────────────────────────────────────────
 * `initialTopPlayerIsPlayer1` is camera-relative and about the OPENING of the
 * video only — ends change every odd game. It is what maps the vendor's
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
import type { VideoProbeSummary } from "./types";
import { focusRingCls, noteStripCls } from "./styles";
import { formatClipLength, formatClock, formatTimecode } from "./utils";

/** The two camera answers, by their FormData field. */
export type CameraAnswer = "fixedCamera" | "initialTopPlayerIsPlayer1";

export interface TrimStepContentProps {
  videoFile: File | null;
  probe: VideoProbeSummary | null;
  startSeconds: number | undefined;
  endSeconds: number | undefined;
  /** Provider-supplied floor, so this component never names a vendor. */
  minTrimSeconds: number;
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

/** How far the rail zooms in when precision engages. */
const PRECISION_ZOOM = 14;

/** Never zoom tighter than this — below it the strip is all one frame. */
const MIN_PRECISION_SPAN_SECONDS = 45;

/** Pointer must rest this long before the rail zooms. See onMove. */
const HOLD_TO_ZOOM_MS = 200;

const ZOOM_ANIM_MS = 260;

/** Drag within this fraction of either edge pans the zoomed window. */
const AUTOPAN_EDGE = 0.06;
const AUTOPAN_STEP = 0.04;

/** Floating frame preview. Height follows the video's own aspect ratio. */
const PREVIEW_WIDTH_PX = 132;

const FALLBACK_ASPECT = 16 / 9;

/**
 * The player's ceiling. 720 × 405 in the design's column — 16:9 fills the
 * width and shares its edges with the rail beneath it, so player and scrubber
 * read as one instrument. Squarer or portrait clips hit the cap and centre.
 */
const PLAYER_MAX_HEIGHT = "405px";

const controlCls = `inline-flex size-7 items-center justify-center rounded-[var(--radius-element)] text-white transition-colors duration-150 hover:bg-white/10 ${focusRingCls}`;

interface ViewWindow {
  start: number;
  span: number;
}

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
      className={`flex h-10 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-element)] border px-3 text-[12px] font-medium text-[var(--ink-900)] transition-colors duration-150 ${
        selected
          ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
          : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]"
      } ${focusRingCls}`}
    >
      {selected ? (
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--blue)]">
          <Check className="size-[9px] text-white" strokeWidth={2.5} aria-hidden="true" />
        </span>
      ) : (
        <span className="inline-flex size-3.5 shrink-0 rounded-full border border-[var(--ink-300)]" />
      )}
      {label}
    </button>
  );
}

/**
 * One required question: eyebrow with the form's red asterisk, a pair of
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
  options: readonly [{ value: boolean; label: string }, { value: boolean; label: string }];
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="inline-flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        <span aria-label="Required" className="text-[12px] leading-none text-[var(--error)]">
          *
        </span>
      </span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
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
  subjectFirstName,
  fixedCamera,
  initialTopPlayerIsPlayer1,
  onTrimChange,
  onAnswer,
}: TrimStepContentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dragging, setDragging] = useState<Handle | null>(null);
  const [precision, setPrecision] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [railWidth, setRailWidth] = useState(0);

  const duration = probe?.durationSeconds ?? 0;
  const start = startSeconds ?? 0;
  const end = endSeconds ?? duration;
  const selectedDuration = Math.max(0, end - start);
  const tooShort = duration > 0 && selectedDuration < minTrimSeconds;

  /** One frame, when we know the rate. Falls back to a reasonable nudge. */
  const frameStep = probe?.fps ? 1 / probe.fps : 0.1;

  // The slice of the clip the rail spans, as an override on top of "the whole
  // video". Null is the resting state rather than a copy of the duration, so a
  // new file needs no reset — the derived window follows it.
  const [zoom, setZoom] = useState<ViewWindow | null>(null);
  const viewRef = useRef<ViewWindow>({ start: 0, span: 0 });
  const rafRef = useRef<number | null>(null);

  const view = useMemo<ViewWindow>(() => {
    if (!zoom || duration <= 0) return { start: 0, span: duration };
    // Clamped rather than trusted: a zoom left over from a previous, longer
    // file would otherwise scroll the rail off the end of a shorter one.
    const span = Math.min(zoom.span, duration);
    return { start: Math.max(0, Math.min(duration - span, zoom.start)), span };
  }, [zoom, duration]);

  const filmstrip = useVideoFilmstrip(videoFile, duration);

  // Playhead and its clock are written imperatively rather than held in state.
  // They update ~4x a second during playback and twice per pointermove while
  // dragging, and nothing else on this step depends on them. Re-rendering the
  // filmstrip and both questions to move one 2px line is waste on the one
  // thread that is busy decoding video.
  const playheadRef = useRef(0);
  const playheadElRef = useRef<HTMLDivElement>(null);
  const clockElRef = useRef<HTMLSpanElement>(null);

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
    const { start: viewStart, span } = viewRef.current;
    const pct = span > 0 ? ((playheadRef.current - viewStart) / span) * 100 : 0;
    el.style.left = `${pct}%`;
    // Hidden rather than clamped when the playhead falls outside the zoomed
    // window — pinning it to an edge reads as "the playhead is here", which is
    // exactly wrong.
    el.style.opacity = pct < 0 || pct > 100 ? "0" : "1";
  }, []);

  // Mirror `view` into a ref for the imperative playhead and the window-level
  // pointer handlers. Written in an effect, never during render.
  useEffect(() => {
    viewRef.current = view;
    applyPlayhead();
  }, [view, applyPlayhead]);

  // A new source rewinds the playhead and cancels any zoom still animating.
  useEffect(() => {
    playheadRef.current = 0;
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
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

  /**
   * Ease the rail window to a new span.
   *
   * `settleToRest` lands on null rather than on the target numbers, so zooming
   * back out returns the window to "however long this video is" instead of
   * pinning a stale copy of the duration.
   */
  const animateView = useCallback(
    (toStart: number, toSpan: number, settleToRest = false) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const from = viewRef.current;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - startedAt) / ZOOM_ANIM_MS);
        if (k < 1) {
          const eased = 1 - Math.pow(1 - k, 3);
          setZoom({
            start: from.start + (toStart - from.start) * eased,
            span: from.span + (toSpan - from.span) * eased,
          });
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        setZoom(settleToRest ? null : { start: toStart, span: toSpan });
        rafRef.current = null;
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    []
  );

  const seekTo = useCallback(
    (time: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(duration, time));
    },
    [duration]
  );

  const positionFromEvent = useCallback((clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const { start: viewStart, span } = viewRef.current;
    return viewStart + ratio * span;
  }, []);

  /** Single clamp for both handles. */
  const moveHandle = useCallback(
    (handle: Handle, time: number) => {
      if (handle === "start") {
        const next = Math.max(0, Math.min(time, end - frameStep));
        onTrimChange(next, end);
        seekTo(next);
      } else {
        const next = Math.min(duration, Math.max(time, start + frameStep));
        onTrimChange(start, next);
        seekTo(next);
      }
    },
    [start, end, duration, frameStep, onTrimChange, seekTo]
  );

  /**
   * Narrow the rail around the held handle, keeping it under the cursor so the
   * grab point doesn't jump out from under the user's finger.
   */
  const engagePrecision = useCallback(
    (handle: Handle, clientX: number) => {
      const rail = railRef.current;
      if (!rail || duration <= 0) return;
      const span = Math.max(MIN_PRECISION_SPAN_SECONDS, duration / PRECISION_ZOOM);
      // Short clip — the whole thing already fits at frame resolution.
      if (span >= duration) return;

      const rect = rail.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const anchor = handle === "start" ? start : end;
      const nextStart = Math.max(0, Math.min(duration - span, anchor - ratio * span));

      setPrecision(true);
      animateView(nextStart, span);
    },
    [duration, start, end, animateView]
  );

  // Drag inputs go through a ref so the window subscription keys only on
  // `dragging`. Written in an effect, not during render.
  const dragCtx = useRef({ moveHandle, positionFromEvent, engagePrecision, precision, duration });
  useEffect(() => {
    dragCtx.current = { moveHandle, positionFromEvent, engagePrecision, precision, duration };
  });

  const draggingRef = useRef<Handle | null>(null);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    if (!dragging) return;

    // Hold-to-zoom, re-armed on every move. A quick grab-and-throw across the
    // rail stays at full extent; rest the pointer for a beat and the window
    // narrows around it.
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const armHold = (clientX: number) => {
      clearTimeout(holdTimer);
      if (dragCtx.current.precision) return;
      holdTimer = setTimeout(() => {
        dragCtx.current.engagePrecision(dragging, clientX);
      }, HOLD_TO_ZOOM_MS);
    };

    const onMove = (e: PointerEvent) => {
      const ctx = dragCtx.current;
      ctx.moveHandle(dragging, ctx.positionFromEvent(e.clientX));
      armHold(e.clientX);

      // Edge auto-pan, so a zoomed window can still be walked along the clip.
      const rail = railRef.current;
      if (!rail || !ctx.precision) return;
      const rect = rail.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio >= AUTOPAN_EDGE && ratio <= 1 - AUTOPAN_EDGE) return;
      const direction = ratio < AUTOPAN_EDGE ? -1 : 1;
      setZoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          start: Math.max(
            0,
            Math.min(ctx.duration - prev.span, prev.start + direction * prev.span * AUTOPAN_STEP)
          ),
        };
      });
    };

    const onUp = () => {
      clearTimeout(holdTimer);
      setDragging(null);
      setPrecision(false);
      animateView(0, dragCtx.current.duration, true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      clearTimeout(holdTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, animateView]);

  const startDrag = useCallback((handle: Handle, clientX: number) => {
    setDragging(handle);
    // The window handler arms its own hold timer on the first move; this covers
    // a press with no movement at all.
    window.setTimeout(() => {
      if (draggingRef.current === handle && !dragCtx.current.precision) {
        dragCtx.current.engagePrecision(handle, clientX);
      }
    }, HOLD_TO_ZOOM_MS);
  }, []);

  const nudge = useCallback(
    (handle: Handle, direction: -1 | 1, coarse = false) => {
      const from = handle === "start" ? start : end;
      moveHandle(handle, from + (coarse ? 1 : frameStep) * direction);
    },
    [start, end, frameStep, moveHandle]
  );

  const seekBy = useCallback(
    (delta: number) => {
      const el = videoRef.current;
      if (!el) return;
      seekTo(el.currentTime + delta);
    },
    [seekTo]
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
   * Keep the playhead marker in step, and paint the floating preview from the
   * main player — the drag already seeks it, so the frame it just landed on
   * costs a canvas blit instead of a whole extra decode.
   */
  const handleSeeked = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
      playheadRef.current = el.currentTime;
      applyPlayhead();

      if (!draggingRef.current) return;
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
    [applyPlayhead]
  );

  /**
   * Force the first frame to paint. With `preload="metadata"` the element
   * knows its dimensions but has not decoded a frame, so the player sits black
   * until something seeks it.
   */
  const paintFirstFrame = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (el.currentTime === 0) el.currentTime = 0.001;
  }, []);

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      playheadRef.current = e.currentTarget.currentTime;
      applyPlayhead();
    },
    [applyPlayhead]
  );

  // ---- Derived geometry ----

  const pct = useCallback(
    (time: number) => (view.span > 0 ? ((time - view.start) / view.span) * 100 : 0),
    [view]
  );

  const startPct = pct(start);
  const endPct = pct(end);
  const draggedPct = dragging ? pct(dragging === "start" ? start : end) : 0;

  // Zoomed, a handle routinely sits outside the window. The bracket that spans
  // the selection is clipped to the rail; the handles themselves are hidden
  // rather than pinned to an edge, since a marker parked at 0% reads as "the
  // cut is here", which is exactly wrong.
  const visibleStartPct = Math.max(0, Math.min(100, startPct));
  const visibleEndPct = Math.max(0, Math.min(100, endPct));
  const selectionWidthPct = Math.max(0, visibleEndPct - visibleStartPct);

  const aspect =
    probe && probe.width > 0 && probe.height > 0 ? probe.width / probe.height : FALLBACK_ASPECT;
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
      const time = view.start + ((i + 0.5) / count) * view.span;
      const index = Math.round((time / duration) * frames.length - 0.5);
      return {
        key: i,
        src: frames[Math.max(0, Math.min(frames.length - 1, index))],
      };
    });
  }, [aspect, railWidth, filmstrip.frames, duration, view]);

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
          A saved draft keeps everything but the video. Go back a step and pick the file again to
          check it here.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/55 to-transparent pb-2.5 pt-8">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => seekBy(-frameStep)}
              className={controlCls}
              aria-label="Back one frame"
            >
              <SkipBack className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className={controlCls}
            >
              {isPlaying ? (
                <Pause className="size-4" strokeWidth={1.5} aria-hidden="true" />
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
              <SkipForward className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span className="mx-1 h-3 w-px bg-white/35" aria-hidden="true" />
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className={controlCls}
            >
              {isMuted ? (
                <VolumeX className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Volume2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Playhead time — text written imperatively, see applyPlayhead. */}
        <span
          ref={clockElRef}
          className="mono tabular pointer-events-none absolute right-2.5 top-2.5 rounded-[var(--radius-cell)] bg-black/55 px-1.5 py-0.5 text-[10px] text-white/85"
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

        <div className="relative">
          {/* Live frame at the handle being dragged. Sits above the rail on its
              own layer so showing it never reflows the strip. */}
          {dragging ? (
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
                {formatClock(dragging === "start" ? start : end, { tenths: true })}
              </div>
            </div>
          ) : null}

          {/* Rail. Click seeks; handles drag. */}
          <div
            ref={railRef}
            onPointerDown={(e) => seekTo(positionFromEvent(e.clientX))}
            className="relative cursor-pointer touch-none select-none rounded-[var(--radius-element)] bg-[var(--ink-900)]"
            style={{ height: RAIL_HEIGHT_PX }}
          >
            {duration > 0 ? (
              <>
                {/* Filmstrip */}
                <div
                  className={`absolute inset-0 flex overflow-hidden rounded-[var(--radius-element)] transition-opacity duration-200 ${
                    precision ? "opacity-40" : "opacity-100"
                  }`}
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
                  <span className="eyebrow-sm pointer-events-none absolute right-2 top-2 rounded-[var(--radius-cell)] bg-black/55 px-1.5 py-0.5 text-white/70">
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

                {/* The kept window: one 2px Signal Blue bracket */}
                <div
                  className="pointer-events-none absolute -bottom-0.5 -top-0.5 rounded-[4px] border-2 border-[var(--blue)]"
                  style={{ left: `${visibleStartPct}%`, width: `${selectionWidthPct}%` }}
                />

                {/* Playhead — position written imperatively, see applyPlayhead */}
                <div
                  ref={playheadElRef}
                  className="pointer-events-none absolute -bottom-1.5 -top-1.5 z-[2] -ml-px w-0.5 rounded-[1px] bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.45)]"
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
                      aria-label={handle === "start" ? "Trim start" : "Trim end"}
                      aria-valuemin={0}
                      aria-valuemax={duration}
                      aria-valuenow={value}
                      aria-valuetext={formatClock(value, { tenths: true })}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        startDrag(handle, e.clientX);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          nudge(handle, -1, e.shiftKey);
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          nudge(handle, 1, e.shiftKey);
                        }
                      }}
                      className={`absolute -bottom-0.5 -top-0.5 z-[3] w-[18px] cursor-ew-resize ${focusRingCls}`}
                      style={{ left: `calc(${handlePct}% - 10px)` }}
                    >
                      <span
                        className={`absolute inset-y-0 left-1 w-[10px] bg-[var(--blue)] ${
                          handle === "start" ? "rounded-l-[4px]" : "rounded-r-[4px]"
                        }`}
                      >
                        <span className="absolute left-1 top-1/2 -mt-[7px] h-3.5 w-0.5 rounded-[1px] bg-white/90" />
                      </span>
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>
        </div>

        {/* START / END under the strip's own edges. */}
        <div className="flex items-baseline justify-between px-0.5 pt-0.5">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              Start
            </span>
            <span className="mono tabular text-[12px] font-medium text-[var(--ink-900)]">
              {formatTimecode(start)}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              End
            </span>
            <span className="mono tabular text-[12px] font-medium text-[var(--ink-900)]">
              {formatTimecode(end)}
            </span>
          </span>
        </div>

        {tooShort ? (
          <div className={noteStripCls}>
            <XCircle
              className="mt-0.5 size-[13px] shrink-0 text-[var(--error)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              The window is under {formatClipLength(minTrimSeconds)} — widen it to cover the match.
            </span>
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
          hint="Ends change every odd game — only the opening counts"
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
