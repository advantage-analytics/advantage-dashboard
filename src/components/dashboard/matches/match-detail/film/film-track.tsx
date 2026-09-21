"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { cn } from "@/lib/utils";

import type { TrackSegment } from "./film-timeline";

/**
 * The fullscreen scrub track (handoff F1): 3px runs split at breaks of serve
 * with 5px gaps, Signal Blue behind the playhead, 22% white ahead of it, an
 * 11px white playhead. The 16px hit area is the whole row; the runs are
 * decoration inside it. Blue here is one of the three places the fullscreen
 * uses it at all.
 */
export function FilmTrack({
  segments,
  duration,
  currentTime,
  onSeek,
  className,
}: {
  segments: TrackSegment[];
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || !(duration > 0)) return;
      const rect = bar.getBoundingClientRect();
      if (rect.width === 0) return;
      const fraction = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      onSeek(fraction * duration);
    },
    [duration, onSeek],
  );

  // Window-level listeners so the pointer can leave the 3px runs mid-drag.
  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: PointerEvent) => seekFromPointer(e.clientX);
    const up = () => setScrubbing(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [scrubbing, seekFromPointer]);

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
        setScrubbing(true);
        seekFromPointer(e.clientX);
      }}
      // No keys of its own: the view that holds the track — the room, or the
      // Video tab — answers the arrows page-wide (← ↑ / → ↓ step points, J / L move
      // 5 seconds), and a second handler here made a focused track seek
      // twice.
      className={cn(
        "relative flex h-4 cursor-pointer items-center rounded-[2px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        className,
      )}
    >
      {segments.map((seg, i) => {
        const leftPad = i === 0 ? 0 : 2.5;
        const rightPad = i === last ? 0 : 2.5;
        // The watched share of this run, from `--film-t` — repainted every
        // frame by the room's clock rather than on `timeupdate`.
        const span = Math.max(seg.end - seg.start, 0.001);
        const split = `clamp(0%, calc((var(--film-t, 0) - ${seg.start}) / ${span} * 100%), 100%)`;
        const background = `linear-gradient(to right, var(--blue) 0 ${split}, rgba(255,255,255,0.22) ${split} 100%)`;
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
    </div>
  );
}
