"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { cn } from "@/lib/utils";

import {
  laneFraction,
  PREVIEW_FADE_MS,
  PREVIEW_FRAME,
  PREVIEW_HANG_PX,
  PREVIEW_OVERHANG_PX,
  previewBoxWidth,
  previewLeft,
  trackRunGradient,
  type PreviewSize,
} from "./film-seek-preview";
import type { TrackSegment } from "./film-timeline";
import { useSeekPreview } from "./use-seek-preview";

/**
 * The fullscreen scrub track (handoff F1): 3px runs split by set
 * with 5px gaps, Signal Blue behind the playhead, 22% white ahead of it, an
 * 11px white playhead. The 16px hit area is the whole row; the runs are
 * decoration inside it. Blue here is one of the three places the fullscreen
 * uses it at all.
 *
 * `role="slider"`, and keyboard-seekable like one: ← / → move 5 seconds,
 * Home and End go to the ends.
 *
 * With `preview`, the lane also floats a frame preview (handoff T2) over the
 * pointer: a mouse or pen hovering the lane, or any pointer scrubbing it —
 * a touch only while dragging, and nothing on keyboard focus. Every pointer
 * move writes `--film-hover` (seconds), `--film-hover-x` (lane px) and
 * `data-film-hover` straight onto the slider, and moves the box and its
 * clock through refs — no React state per move. Without `preview` none of
 * that is wired and the lane behaves exactly as it did.
 */
export function FilmTrack({
  segments,
  duration,
  currentTime,
  onSeek,
  preview,
  className,
}: {
  segments: TrackSegment[];
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
  preview?: { url: string | null; generation: number; size: PreviewSize };
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  // Mirrors of state the pointer handlers read without re-subscribing.
  const scrubbingRef = useRef(false);
  const scrubPointerRef = useRef<string>("mouse");
  const overRef = useRef(false);

  const hasPreview = preview !== undefined;
  const previewSize = preview?.size ?? "report";
  const seekPreview = useSeekPreview({
    url: preview?.url ?? null,
    generation: preview?.generation ?? 0,
  });
  const { hover: previewHover, scrub: previewScrub } = seekPreview;
  const previewClose = seekPreview.close;

  /**
   * The lane time under `clientX`, written onto the slider and the box. Returns
   * null (and writes nothing) when there is no lane to measure or no film.
   */
  const trackHover = useCallback(
    (clientX: number): number | null => {
      const bar = barRef.current;
      if (!hasPreview || !bar || !(duration > 0)) return null;
      const rect = bar.getBoundingClientRect();
      if (rect.width === 0) return null;
      const fraction = laneFraction(clientX, rect.left, rect.width);
      const seconds = fraction * duration;
      const x = fraction * rect.width;
      bar.style.setProperty("--film-hover", String(seconds));
      bar.style.setProperty("--film-hover-x", `${x}px`);
      bar.setAttribute("data-film-hover", "");
      const box = boxRef.current;
      if (box) {
        box.style.left = `${previewLeft({
          pointerX: x,
          laneWidth: rect.width,
          boxWidth: previewBoxWidth(previewSize),
          overhang: PREVIEW_OVERHANG_PX[previewSize],
        })}px`;
      }
      if (timeRef.current) timeRef.current.textContent = formatClock(seconds);
      return seconds;
    },
    [hasPreview, duration, previewSize],
  );

  const clearHover = useCallback(() => {
    const bar = barRef.current;
    if (bar) {
      bar.style.removeProperty("--film-hover");
      bar.style.removeProperty("--film-hover-x");
      bar.removeAttribute("data-film-hover");
    }
    previewClose();
  }, [previewClose]);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || !(duration > 0)) return;
      const rect = bar.getBoundingClientRect();
      if (rect.width === 0) return;
      onSeek(laneFraction(clientX, rect.left, rect.width) * duration);
    },
    [duration, onSeek],
  );

  // Window-level listeners so the pointer can leave the 3px runs mid-drag.
  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: PointerEvent) => {
      seekFromPointer(e.clientX);
      // Anchored to the thumb for the whole drag, wherever the pointer went.
      const seconds = trackHover(e.clientX);
      if (seconds !== null) previewScrub(seconds);
    };
    const up = () => {
      scrubbingRef.current = false;
      setScrubbing(false);
      // A mouse released over the lane is hovering it again; anything else —
      // a touch, or a mouse released off the lane — closes the preview.
      if (scrubPointerRef.current === "touch" || !overRef.current) clearHover();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [scrubbing, seekFromPointer, trackHover, previewScrub, clearHover]);

  const pct = (s: number) => (duration > 0 ? (s / duration) * 100 : 0);
  const last = segments.length - 1;

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatClock(currentTime)} of ${formatClock(duration)}`}
      onPointerDown={(e) => {
        e.preventDefault();
        scrubbingRef.current = true;
        scrubPointerRef.current = e.pointerType;
        setScrubbing(true);
        seekFromPointer(e.clientX);
        const seconds = trackHover(e.clientX);
        if (seconds !== null) previewScrub(seconds);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") overRef.current = true;
      }}
      onPointerMove={(e) => {
        // A touch shows the preview only while dragging (the window handler
        // above); a scrub's own moves are that handler's too.
        if (!hasPreview || e.pointerType === "touch" || scrubbingRef.current)
          return;
        overRef.current = true;
        const seconds = trackHover(e.clientX);
        if (seconds !== null) previewHover(seconds);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        overRef.current = false;
        if (!scrubbingRef.current) clearHover();
      }}
      // A focused slider seeks, which is what a slider does — arrows move the
      // playhead 5s, Home and End go to the ends. Both hosts step points with
      // the same arrows page-wide, so the track claims them back while it has
      // focus: `data-film-own-keys` is the room's guard, and the Video tab's
      // window handler already bails on `[role=slider]`. Without that the
      // arrow both seeked and stepped a point.
      data-film-own-keys=""
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (!(duration > 0)) return;
        const at = Math.min(Math.max(currentTime, 0), duration);
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            onSeek(Math.max(0, at - 5));
            break;
          case "ArrowRight":
            e.preventDefault();
            onSeek(Math.min(duration, at + 5));
            break;
          case "Home":
            e.preventDefault();
            onSeek(0);
            break;
          case "End":
            e.preventDefault();
            onSeek(duration);
            break;
        }
      }}
      className={cn(
        "group/lane relative flex h-4 cursor-pointer items-center rounded-[2px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        className,
      )}
    >
      {segments.map((seg, i) => {
        const leftPad = i === 0 ? 0 : 2.5;
        const rightPad = i === last ? 0 : 2.5;
        // The watched share of this run, from `--film-t` — repainted every
        // frame by the room's clock rather than on `timeupdate` — plus the
        // hover lift up to `--film-hover`, which collapses to nothing while
        // the variable is unset.
        const background = trackRunGradient(seg);
        return (
          <span
            key={`${seg.start}-${seg.end}`}
            aria-hidden="true"
            className="absolute h-[3px] rounded-[var(--radius-pill)]"
            style={{
              left: `calc(${pct(seg.start)}% + ${leftPad}px)`,
              width: `calc(${pct(seg.end - seg.start)}% - ${leftPad + rightPad}px)`,
              background,
            }}
          />
        );
      })}
      {/* A full-width carrier translated by the watched fraction, so the
          playhead moves on the compositor every frame. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-full will-change-transform"
        style={{
          transform: `translateX(calc(clamp(0, var(--film-t, 0) / var(--film-d, 1), 1) * 100%))`,
        }}
      >
        <span className="absolute top-1/2 left-0 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-pill)] bg-white" />
      </span>
      {preview && (
        <>
          {/* The hover marker: shown only while the slider carries
              `data-film-hover`, so it costs no render per move. */}
          <span
            aria-hidden="true"
            data-testid="film-seek-hover-marker"
            className="pointer-events-none absolute top-1/2 hidden h-[9px] w-px -translate-x-1/2 -translate-y-1/2 bg-white/70 group-data-[film-hover]/lane:block"
            style={{ left: "var(--film-hover-x)" }}
          />
          <div
            ref={boxRef}
            aria-hidden="true"
            data-testid="film-seek-preview"
            data-state={seekPreview.open ? seekPreview.state : "closed"}
            className="pointer-events-none absolute z-10 rounded-[12px] bg-[var(--ink-900)] p-1"
            style={{
              bottom: `calc(100% + ${PREVIEW_HANG_PX}px)`,
              width: previewBoxWidth(previewSize),
              opacity: seekPreview.open ? 1 : 0,
              visibility: seekPreview.visible ? "visible" : "hidden",
              boxShadow:
                "var(--shadow-dropdown), inset 0 0 0 1px rgba(255,255,255,0.08)",
              transition: `opacity ${PREVIEW_FADE_MS}ms var(--ease-primary)`,
            }}
          >
            <div
              data-testid="film-seek-preview-frame"
              className={cn(
                "overflow-hidden rounded-[8px]",
                seekPreview.state === "empty" && "bg-white/[0.06]",
              )}
              style={{
                width: PREVIEW_FRAME[previewSize].width,
                height: PREVIEW_FRAME[previewSize].height,
              }}
            >
              {seekPreview.video && (
                <video
                  key={seekPreview.videoKey}
                  {...seekPreview.video}
                  className={cn(
                    seekPreview.video.className,
                    "transition-opacity duration-200 ease-[var(--ease-primary)]",
                    seekPreview.state === "empty" && "opacity-0",
                    seekPreview.state === "held" && "opacity-60",
                    seekPreview.state === "live" && "opacity-100",
                  )}
                />
              )}
            </div>
            <div
              ref={timeRef}
              data-testid="film-seek-preview-time"
              className="mono tabular mt-1 flex h-4 items-center justify-center text-[11px] text-white/90"
            />
          </div>
        </>
      )}
    </div>
  );
}
