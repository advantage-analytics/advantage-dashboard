"use client";

/**
 * VideoStepContent — pick, validate and trim a match video.
 *
 * Everything here runs against the LOCAL file. The video is scrubbed through an
 * object URL, so trimming is instant and does not wait on any upload. Nothing
 * leaves the browser on this step.
 *
 * The rail is a filmstrip rather than a bar, and holding a handle zooms the
 * window it spans. That matters because these clips are hours long: at full
 * extent one pixel is several seconds, which is not a resolution you can place
 * a cut against a serve with. Zoomed, the same pixel is a handful of frames.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useVideoFilmstrip } from "@/hooks/use-video-filmstrip";
import type { VideoProbeSummary } from "./types";
import {
  ghostBtnCls,
  eyebrowLabelCls,
  dangerIconBtnCls,
  dropZoneCls,
  floatMenuCls,
  focusRingCls,
} from "./styles";
import { formatFileSize, formatClipLength, formatClock } from "./utils";

/**
 * The recording rules, on demand.
 *
 * The chips carry the shape of the answer; this carries the reason. A popover
 * rather than a page because the rules only matter in the ten seconds before
 * you pick a file, and a link away from the wizard at that moment loses the
 * file you were about to drop.
 */
function RecordingRequirements({ chips }: { chips: readonly string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`rounded-sm text-[11px] text-[#3B82F6] transition-colors duration-150 hover:text-[#2563EB] ${focusRingCls}`}
        >
          Recording requirements
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={`w-[300px] p-3.5 ${floatMenuCls}`}
      >
        <p className={eyebrowLabelCls}>What the analysis needs</p>
        <ul className="mt-2.5 flex flex-col gap-2 text-[12px] leading-[1.5] text-[#525252]">
          {chips.length > 0 && (
            <li>
              <span className="text-[#0D0D0D]">The file</span> — {chips.join(", ").toLowerCase()}.
            </li>
          )}
          <li>
            <span className="text-[#0D0D0D]">One camera, one position</span> — a tripod or
            a phone propped against the fence. Following the play breaks the court
            mapping.
          </li>
          <li>
            <span className="text-[#0D0D0D]">Behind the baseline</span>, high enough to
            see both service boxes, with all four corners of the court in frame.
          </li>
          <li>
            <span className="text-[#0D0D0D]">Singles only</span>, and complete games —
            the window you trim to has to match the score you enter next.
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export interface VideoStepContentProps {
  videoFile: File | null;
  probe: VideoProbeSummary | null;
  warnings: string[];
  isProbing: boolean;
  error: string | null;
  startSeconds: number | undefined;
  endSeconds: number | undefined;
  isOver: boolean;
  /** Provider-supplied floor, so this component never names a vendor. */
  minTrimSeconds: number;
  /** From the provider strategy — keeps the picker and the validator in sync. */
  acceptString: string;
  /** Requirement chips, derived from provider config rather than hardcoded. */
  requirementChips: readonly string[];
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onPick: (file: File | null) => void;
  onTrimChange: (startSeconds: number, endSeconds: number) => void;
  onRemove: () => void;
}

type Handle = "start" | "end";

const HANDLES: readonly Handle[] = ["start", "end"];

/** Rail height in CSS pixels. Also sets the thumbnail size. */
const RAIL_HEIGHT_PX = 56;

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
 * Ceiling for the player, applied to height and (via the aspect ratio) width.
 *
 * Set so that 16:9 never reaches it in this column: match footage is landscape,
 * so it fills the width and shares its edges with the trim rail underneath.
 * That alignment is the point — the rail scrubs the player, and two elements
 * that read as one control should not be inset from each other. Squarer or
 * portrait clips do hit the cap and centre, which is inherent to their shape.
 *
 * Deliberately not a viewport-relative value. Clamping to vh keeps the rail
 * above the fold on short screens, but it also unpins the player from the
 * column at every ordinary window size, which trades a permanent misalignment
 * for a scroll the page already handles.
 */
const PLAYER_MAX_HEIGHT = "440px";

const transportBtnCls =
  `h-6 rounded-[6px] px-2.5 text-[11px] font-medium tabular-nums bg-white/10 text-white/85 hover:bg-white/[0.18] transition-colors duration-200 ${focusRingCls}`;

interface ViewWindow {
  start: number;
  span: number;
}

function VideoStepContentImpl({
  videoFile,
  probe,
  warnings,
  isProbing,
  error,
  startSeconds,
  endSeconds,
  isOver,
  minTrimSeconds,
  acceptString,
  requirementChips,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onTrimChange,
  onRemove,
}: VideoStepContentProps) {
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

  // Playhead is written imperatively rather than held in state. It updates ~4x
  // a second during playback and twice per pointermove while dragging (the
  // seek fires its own timeupdate), and none of the rest of this step — probe
  // chips, warnings, filmstrip, both control columns — depends on it.
  // Re-rendering all of that to move one 1px line is waste on the one thread
  // that is busy decoding video.
  const playheadRef = useRef(0);
  const playheadElRef = useRef<HTMLDivElement>(null);

  // One object URL per file, revoked when the file changes or the step
  // unmounts. Leaking these pins the file handle for the life of the page.
  const objectUrl = useMemo(
    () => (videoFile ? URL.createObjectURL(videoFile) : null),
    [videoFile]
  );
  useEffect(() => {
    if (!objectUrl) return;
    return () => {
      // Detach from the element before revoking. Safari otherwise keeps a
      // handle on the source alive — the same teardown order probe.ts uses.
      const el = videoRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const applyPlayhead = useCallback(() => {
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
  // The window itself needs no reset — see the derivation above.
  useEffect(() => {
    playheadRef.current = 0;
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [objectUrl]);

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

  /**
   * Single clamp for both handles. Drag and nudge previously each had their own
   * copy and had already drifted — the drag path seeked an unclamped value and
   * was saved only by seekTo re-clamping.
   */
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
  // `dragging`. Depending on start/end directly re-subscribed on every pointer
  // sample, since each move writes them back through onTrimChange.
  //
  // Written in an effect, not during render — a ref mutated while rendering is
  // unsafe when a render can be discarded or replayed. This effect is declared
  // before the drag effect below, and pointer events only fire after both have
  // committed, so onMove always sees current values.
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
    // rail stays at full extent — which is what you want when dragging the end
    // handle from the third set back to the first. Rest the pointer for a beat,
    // at grab time or mid-drag, and the window narrows around it.
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
   * Keep the playhead marker in step, and paint the floating preview.
   *
   * The preview is drawn from the main player rather than a second video
   * element: the drag already seeks this one, so painting the frame it just
   * landed on costs a canvas blit instead of a whole extra decode.
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
   * Force the first frame to paint.
   *
   * With `preload="metadata"` the element knows its dimensions but has not
   * decoded a frame, so the player sits black until something seeks it. A
   * sub-frame nudge costs one decode and means the box shows the video the
   * moment it is sized.
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

  // Zoomed, a handle routinely sits outside the window — the end of a match is
  // an hour past a start-handle zoom. The bars that span the selection have to
  // be clipped to the rail or they paint across the page; the handles
  // themselves are hidden rather than pinned to an edge, since a marker parked
  // at 0% reads as "the cut is here", which is exactly wrong.
  const visibleStartPct = Math.max(0, Math.min(100, startPct));
  const visibleEndPct = Math.max(0, Math.min(100, endPct));
  const selectionWidthPct = Math.max(0, visibleEndPct - visibleStartPct);

  const aspect =
    probe && probe.width > 0 && probe.height > 0 ? probe.width / probe.height : FALLBACK_ASPECT;
  const previewHeightPx = Math.round(PREVIEW_WIDTH_PX / aspect);

  /**
   * Thumbnails tile at their natural aspect and are looked up by time, rather
   * than being stretched to fill. Zoomed in, neighbouring slots resolve to the
   * same sample and the strip visibly repeats — which is honest: twenty frames
   * is what was decoded. The live preview above the handle is what carries
   * frame-level detail at that magnification.
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

  // ---- Empty / loading / error states ----

  if (!videoFile) {
    return (
      <div className="flex flex-col gap-4">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative flex min-h-[260px] flex-col items-center justify-center rounded-[14px] border border-dashed transition-colors duration-200 ${dropZoneCls(
            isProbing,
            isOver
          )}`}
        >
          {isProbing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-5 animate-spin text-[#3B82F6]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#525252]">Checking your video…</p>
              <p className="text-[11px] text-[#AAAAAA]">Nothing is uploading yet.</p>
            </div>
          ) : (
            <>
              <Upload className="size-8 text-[#CCCCCC]" strokeWidth={1.5} />
              <p className="mt-3.5 text-[15px] font-medium text-[#0D0D0D]">
                {isOver ? "Drop it here" : "Drop match video here"}
              </p>
              <p className="mt-1.5 text-[12px] text-[#888888]">One video per match</p>
              <Button
                onClick={() => document.getElementById("video-input-wizard")?.click()}
                className={`${ghostBtnCls} mt-3.5 h-8 px-3.5 text-[12px]`}
              >
                Browse files
              </Button>
              <input
                id="video-input-wizard"
                type="file"
                accept={acceptString}
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </>
          )}
        </div>

        {/* Out of the zone: inside it they read as decoration on a target, and
            the target is the thing you are meant to hit. */}
        <div className="flex items-center gap-2 border-t border-[#F3F3F3] py-3.5">
          {requirementChips.map((chip) => (
            <span
              key={chip}
              className="inline-flex h-[22px] items-center rounded-[6px] border border-[#F3F3F3] bg-white px-2 text-[10px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA]"
            >
              {chip}
            </span>
          ))}
          <span className="flex-1" />
          <RecordingRequirements chips={requirementChips} />
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-[10px] border border-[#E51837]/20 bg-[#E51837]/[0.04] px-3 py-2.5">
            <XCircle className="mt-px size-3.5 shrink-0 text-[#E51837]" strokeWidth={1.5} />
            <div>
              <p className="text-[12px] font-medium text-[#0D0D0D]">
                This video can&apos;t be analysed
              </p>
              <p className="mt-0.5 text-[12px] leading-[1.5] text-[#525252]">{error}</p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ---- Loaded: probe summary, player, trim rail ----

  return (
    <div className="flex flex-col gap-5">
      {/* File chip + probe facts. Shows the user why the file passed. */}
      <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#F3F3F3] bg-[#FAFAFA] px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[#0D0D0D]">{videoFile.name}</p>
          {probe ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[#888888]">
              <span>
                {probe.width}×{probe.height}
              </span>
              <span aria-hidden="true" className="text-[#CCCCCC]">
                ·
              </span>
              <span>{probe.fps ? `${probe.fps} fps` : "fps unknown"}</span>
              <span aria-hidden="true" className="text-[#CCCCCC]">
                ·
              </span>
              <span>{formatClipLength(probe.durationSeconds)}</span>
              <span aria-hidden="true" className="text-[#CCCCCC]">
                ·
              </span>
              <span>{formatFileSize(probe.sizeBytes)}</span>
            </div>
          ) : null}
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove video"
          className={`shrink-0 ${dangerIconBtnCls}`}
        >
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {warnings.length > 0 ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-[#F3F3F3] bg-white px-3 py-2.5">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-[#AAAAAA]" strokeWidth={1.5} />
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-[12px] leading-[1.5] text-[#525252]">
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Player — local playback, no network. Native controls are omitted
          because the rail below is the scrub surface; a second timeline inside
          the frame would compete with it.

          The frame carries the clip's own aspect ratio rather than a fixed
          height, so there are no pillarbox bars: the box IS the video's shape.
          Capping height and width from the same value keeps a portrait clip
          from running the length of the page. At 16:9 in this column the cap
          isn't reached, so match footage fills the width and lines up with the
          rail beneath it. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-[10px] bg-[#0D0D0D]"
        style={{
          aspectRatio: aspect,
          maxHeight: PLAYER_MAX_HEIGHT,
          maxWidth: `calc(${PLAYER_MAX_HEIGHT} * ${aspect})`,
        }}
      >
        {objectUrl ? (
          <video
            ref={videoRef}
            src={objectUrl}
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
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/55 to-transparent pb-2.5 pt-8">
          <div className="pointer-events-auto flex items-center gap-2">
            <button onClick={() => seekBy(-10)} className={transportBtnCls}>
              −10s
            </button>
            <button
              onClick={() => seekBy(-frameStep)}
              className={transportBtnCls}
              aria-label="Back one frame"
            >
              −1f
            </button>
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className={`flex h-6 w-11 items-center justify-center rounded-[6px] bg-[#3B82F6] text-white transition-colors duration-200 hover:bg-[#2563EB] ${focusRingCls}`}
            >
              {isPlaying ? (
                <Pause className="size-3" strokeWidth={2} fill="currentColor" />
              ) : (
                <Play className="size-3" strokeWidth={2} fill="currentColor" />
              )}
            </button>
            <button
              onClick={() => seekBy(frameStep)}
              className={transportBtnCls}
              aria-label="Forward one frame"
            >
              +1f
            </button>
            <button onClick={() => seekBy(10)} className={transportBtnCls}>
              +10s
            </button>
            <button
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className={`flex size-6 items-center justify-center rounded-[6px] bg-white/10 text-white/85 transition-colors duration-200 hover:bg-white/[0.18] ${focusRingCls}`}
            >
              {isMuted ? (
                <VolumeX className="size-3" strokeWidth={1.5} />
              ) : (
                <Volume2 className="size-3" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Trim */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className={`${eyebrowLabelCls} whitespace-nowrap`}>Trim to the match</span>
          <span className="flex-1" />
          <span className="text-[11px] tabular-nums text-[#888888]">
            {formatClipLength(selectedDuration)} selected
          </span>
        </div>

        <div className="relative">
          {/* Live frame at the handle being dragged. Sits above the rail on its
              own layer so showing it never reflows the strip. */}
          {dragging ? (
            <div
              className="pointer-events-none absolute bottom-[calc(100%+8px)] z-10 overflow-hidden rounded-[8px] border border-[#E5E5EA] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
              style={{
                width: PREVIEW_WIDTH_PX,
                left: `clamp(0px, calc(${draggedPct}% - ${PREVIEW_WIDTH_PX / 2}px), calc(100% - ${PREVIEW_WIDTH_PX}px))`,
              }}
            >
              <canvas
                ref={previewCanvasRef}
                width={PREVIEW_WIDTH_PX * 2}
                height={previewHeightPx * 2}
                className="block w-full bg-[#0D0D0D]"
                style={{ height: previewHeightPx }}
              />
              <div className="bg-white py-1 text-center text-[10px] tabular-nums text-[#525252]">
                {formatClock(dragging === "start" ? start : end, { tenths: true })}
              </div>
            </div>
          ) : null}

          {/* Rail. Click seeks; handles drag. */}
          <div
            ref={railRef}
            onPointerDown={(e) => seekTo(positionFromEvent(e.clientX))}
            className="relative cursor-pointer touch-none select-none rounded-[8px] bg-[#0D0D0D]"
            style={{ height: RAIL_HEIGHT_PX }}
          >
            {duration > 0 ? (
              <>
                {/* Filmstrip */}
                <div
                  className={`absolute inset-0 flex overflow-hidden rounded-[8px] transition-opacity duration-200 ${
                    precision ? "opacity-40" : "opacity-100"
                  }`}
                >
                  {slots.map((slot) => (
                    <div
                      key={slot.key}
                      className="h-full min-w-0 flex-1 border-r border-white/[0.06] last:border-r-0"
                    >
                      {slot.src ? (
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

                {filmstrip.isExtracting ? (
                  <span className="pointer-events-none absolute right-2 top-2 rounded-[4px] bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[1.5px] text-white/70">
                    Reading frames
                  </span>
                ) : null}

                {/* Everything outside the selection, dimmed */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[8px] bg-[#FAFAFA]/[0.78]"
                  style={{ width: `${visibleStartPct}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 rounded-r-[8px] bg-[#FAFAFA]/[0.78]"
                  style={{ left: `${visibleEndPct}%`, width: `${100 - visibleEndPct}%` }}
                />

                {/* Selection edges */}
                <div
                  className="pointer-events-none absolute top-0 h-0.5 bg-[#3B82F6]"
                  style={{ left: `${visibleStartPct}%`, width: `${selectionWidthPct}%` }}
                />
                <div
                  className="pointer-events-none absolute bottom-0 h-0.5 bg-[#3B82F6]"
                  style={{ left: `${visibleStartPct}%`, width: `${selectionWidthPct}%` }}
                />

                {/* Playhead — position written imperatively, see applyPlayhead */}
                <div
                  ref={playheadElRef}
                  className="pointer-events-none absolute -top-1 -bottom-1 z-[2] w-px bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.4)]"
                  style={{ left: 0 }}
                />

                {/* Handles */}
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
                      className={`absolute -top-1.5 -bottom-1.5 z-[3] -ml-1.5 flex w-3.5 cursor-ew-resize items-center justify-center rounded-[3px] ${focusRingCls}`}
                      style={{ left: `${handlePct}%` }}
                    >
                      <div className="h-[calc(100%-4px)] w-[5px] rounded-full bg-[#3B82F6] shadow-[0_0_0_1.5px_#fff]" />
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>

          {/* Start and end read under their own handles rather than as a fixed
              scale across the rail. A tick strip described the view; these
              describe the two decisions, and they move with them. */}
          <div className="relative mt-2 h-5">
            {HANDLES.map((handle) => {
              const value = handle === "start" ? start : end;
              const handlePct = pct(value);
              if (handlePct < 0 || handlePct > 100) return null;
              return (
                <span
                  key={handle}
                  className="absolute inline-flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap"
                  style={{ left: `${handlePct}%` }}
                >
                  <span className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA]">
                    {handle === "start" ? "Start" : "End"}
                  </span>
                  <span className="text-[12px] font-medium tabular-nums text-[#0D0D0D]">
                    {formatClock(value)}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {tooShort ? (
          <div className="flex items-start gap-2 rounded-[10px] border border-[#E51837]/20 bg-[#E51837]/[0.04] px-3 py-2.5">
            <XCircle className="mt-px size-3.5 shrink-0 text-[#E51837]" strokeWidth={1.5} />
            <p className="text-[12px] leading-[1.5] text-[#525252]">
              The selected window is under {minTrimSeconds} seconds. Widen it to cover
              the match.
            </p>
          </div>
        ) : (
          /* The one rule that cannot be recovered from afterwards: a window that
             cuts into a game throws off every point after it. Hold-to-zoom is
             discoverable by accident; this is not. What the trim COSTS used to
             be spelled out here too — the footer's allowance meter now says it
             continuously, and says it whether or not the handles have moved. */
          <p className="text-[12px] leading-[1.5] text-[#888888]">
            Hold a handle to zoom. The window must contain{" "}
            <span className="text-[#525252]">complete games</span> matching the score you
            enter next.
          </p>
        )}
      </div>
    </div>
  );
}

export const VideoStepContent = memo(VideoStepContentImpl);
