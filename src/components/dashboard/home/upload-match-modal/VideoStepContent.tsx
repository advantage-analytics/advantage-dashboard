"use client";

/**
 * VideoStepContent — pick, validate and trim a match video.
 *
 * Everything here runs against the LOCAL file. The video is scrubbed through an
 * object URL, so trimming is instant and does not wait on any upload. Nothing
 * leaves the browser on this step.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import type { VideoProbeSummary } from "./types";
import {
  primaryBtnCls,
  ghostBtnCls,
  eyebrowLabelCls,
  iconBtnCls,
  dangerIconBtnCls,
  dropZoneCls,
  focusRingCls,
} from "./styles";
import { formatFileSize, formatClipLength, formatClock } from "./utils";

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
  const [dragging, setDragging] = useState<Handle | null>(null);

  // Playhead is written imperatively rather than held in state. It updates ~4x
  // a second during playback and twice per pointermove while dragging (the
  // seek fires its own timeupdate), and none of the rest of this step — probe
  // chips, warnings, rail, both control columns — depends on it. Re-rendering
  // all of that to move one 1px line is waste on the one thread that is busy
  // decoding video.
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

  const duration = probe?.durationSeconds ?? 0;
  const start = startSeconds ?? 0;
  const end = endSeconds ?? duration;
  const selectedDuration = Math.max(0, end - start);
  const tooShort = duration > 0 && selectedDuration < minTrimSeconds;

  /** One frame, when we know the rate. Falls back to a reasonable nudge. */
  const frameStep = probe?.fps ? 1 / probe.fps : 0.1;

  const setPlayhead = useCallback(
    (time: number) => {
      playheadRef.current = time;
      const el = playheadElRef.current;
      if (el) el.style.left = duration > 0 ? `${(time / duration) * 100}%` : "0%";
    },
    [duration]
  );

  // The imperative style survives re-renders, so reset it when the source changes.
  useEffect(() => {
    setPlayhead(0);
  }, [objectUrl, setPlayhead]);

  const seekTo = useCallback(
    (time: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(duration, time));
    },
    [duration]
  );

  const positionFromEvent = useCallback(
    (clientX: number): number => {
      const rail = railRef.current;
      if (!rail || duration <= 0) return 0;
      const rect = rail.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration]
  );

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

  // Drag inputs go through a ref so the window subscription keys only on
  // `dragging`. Depending on start/end directly re-subscribed on every pointer
  // sample, since each move writes them back through onTrimChange.
  //
  // Written in an effect, not during render — a ref mutated while rendering is
  // unsafe when a render can be discarded or replayed. This effect is declared
  // before the drag effect below, and pointer events only fire after both have
  // committed, so onMove always sees current values.
  const dragCtx = useRef({ moveHandle, positionFromEvent });
  useEffect(() => {
    dragCtx.current = { moveHandle, positionFromEvent };
  });

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const { moveHandle: move, positionFromEvent: pos } = dragCtx.current;
      move(dragging, pos(e.clientX));
    };
    const onUp = () => setDragging(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  const nudge = useCallback(
    (handle: Handle, direction: -1 | 1) => {
      const from = handle === "start" ? start : end;
      moveHandle(handle, from + frameStep * direction);
    },
    [start, end, frameStep, moveHandle]
  );

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
              <p className="text-[11px] text-[#AAAAAA]">
                Reading resolution and frame rate. Nothing is uploading yet.
              </p>
            </div>
          ) : (
            <>
              <div className="flex size-12 items-center justify-center rounded-[10px] bg-[#3B82F6]">
                <Clapperboard className="size-5 text-white" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-[14px] font-medium text-[#0D0D0D]">
                {isOver ? "Drop it here" : "Drag & drop your match video"}
              </p>
              <p className="mt-1 text-[12px] text-[#888888]">
                We check it works before anything uploads
              </p>
              <Button
                onClick={() => document.getElementById("video-input-modal")?.click()}
                className={`${primaryBtnCls} mt-4`}
              >
                Browse files
              </Button>
              <input
                id="video-input-modal"
                type="file"
                accept={acceptString}
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
              <div className="mt-5 flex items-center gap-2">
                {requirementChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-[6px] bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA] border border-[#F3F3F3]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </>
          )}
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
          className={`shrink-0 ${dangerIconBtnCls()}`}
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

      {/* Player — local playback, no network */}
      <div className="overflow-hidden rounded-[10px] bg-[#0D0D0D]">
        {objectUrl ? (
          <video
            ref={videoRef}
            src={objectUrl}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
            className="max-h-[240px] w-full bg-black"
          />
        ) : null}
      </div>

      {/* Trim */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className={eyebrowLabelCls}>Trim to the match</span>
          <span className="text-[11px] tabular-nums text-[#888888]">
            {formatClipLength(selectedDuration)} selected
          </span>
        </div>

        {/* Rail. Click seeks; handles drag. */}
        <div
          ref={railRef}
          onPointerDown={(e) => seekTo(positionFromEvent(e.clientX))}
          className="relative h-9 cursor-pointer select-none rounded-[6px] bg-[#F3F3F3] touch-none"
        >
          {duration > 0 ? (
            <>
              {/* Selected region */}
              <div
                className="absolute inset-y-0 bg-[#3B82F6]/15"
                style={{
                  left: `${(start / duration) * 100}%`,
                  width: `${(selectedDuration / duration) * 100}%`,
                }}
              />
              {/* Playhead — position written imperatively, see setPlayhead */}
              <div
                ref={playheadElRef}
                className="pointer-events-none absolute inset-y-0 w-px bg-[#0D0D0D]"
                style={{ left: 0 }}
              />
              {/* Handles */}
              {HANDLES.map((handle) => {
                const value = handle === "start" ? start : end;
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
                      setDragging(handle);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        nudge(handle, -1);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        nudge(handle, 1);
                      }
                    }}
                    className={`absolute inset-y-0 -ml-1.5 w-3 cursor-ew-resize rounded-[3px] ${focusRingCls}`}
                    style={{ left: `${(value / duration) * 100}%` }}
                  >
                    <div className="mx-auto h-full w-[3px] rounded-full bg-[#3B82F6]" />
                  </div>
                );
              })}
            </>
          ) : null}
        </div>

        {/* Precise controls for each end */}
        <div className="grid grid-cols-2 gap-3">
          {HANDLES.map((handle) => {
            const value = handle === "start" ? start : end;
            return (
              <div key={handle} className="flex flex-col gap-1.5">
                <span className={eyebrowLabelCls}>
                  {handle === "start" ? "Start" : "End"}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="min-w-[58px] text-[14px] tabular-nums text-[#0D0D0D]">
                    {formatClock(value, { tenths: true })}
                  </span>
                  <button
                    onClick={() => nudge(handle, -1)}
                    aria-label={`Nudge ${handle} back one frame`}
                    className={iconBtnCls(6)}
                  >
                    <ChevronLeft className="size-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => nudge(handle, 1)}
                    aria-label={`Nudge ${handle} forward one frame`}
                    className={iconBtnCls(6)}
                  >
                    <ChevronRight className="size-3.5" strokeWidth={1.5} />
                  </button>
                  <Button
                    onClick={() => moveHandle(handle, playheadRef.current)}
                    className={`${ghostBtnCls} h-6 px-2 text-[11px]`}
                  >
                    Use playhead
                  </Button>
                </div>
              </div>
            );
          })}
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
          <p className="text-[12px] leading-[1.5] text-[#888888]">
            Set the start just before the first serve and the end just after the final
            point. The window must contain <span className="text-[#525252]">complete games</span>{" "}
            matching the score you enter next — cutting into the middle of a game throws off
            every point after it.
          </p>
        )}
      </div>
    </div>
  );
}

export const VideoStepContent = memo(VideoStepContentImpl);
