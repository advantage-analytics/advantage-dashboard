"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { formatClock } from "@/components/dashboard/schedule/upload/types";

/**
 * The trim window, per file.
 *
 * Not cosmetic and not a preview control: `startSeconds`/`endSeconds` become
 * the vendor's StartTime/EndTime *and* `billable_seconds`, which is what the
 * monthly cap is charged against. A file nobody trims bills for its whole
 * length, which is why the pool readout above it counts untrimmed files in
 * full.
 *
 * Trim near the start of the match if you can. The camera-end answer describes
 * frame zero, and a window that begins several games in leaves it ambiguous
 * whether ends had already changed — an open question with the vendor, recorded
 * in `docs/ui-revamp-guardrails.md` §4.
 */
export function TrimRail({
  file,
  durationSeconds,
  startSeconds,
  endSeconds,
  onChange,
}: {
  file: File;
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  onChange: (startSeconds: number, endSeconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(startSeconds);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const duration = durationSeconds || 1;
  const startPct = (startSeconds / duration) * 100;
  const endPct = (endSeconds / duration) * 100;

  useEffect(() => {
    if (!dragging) return;

    function seconds(clientX: number): number {
      const rail = railRef.current;
      if (!rail) return 0;
      const box = rail.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      return ratio * duration;
    }

    function onMove(event: PointerEvent) {
      const at = seconds(event.clientX);
      if (dragging === "start") onChange(Math.min(at, endSeconds - 1), endSeconds);
      else onChange(startSeconds, Math.max(at, startSeconds + 1));
    }

    function onUp() {
      setDragging(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, duration, startSeconds, endSeconds, onChange]);

  function nudge(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(duration, Math.max(0, video.currentTime + seconds));
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="relative h-[236px] overflow-hidden rounded-[10px] bg-[#0D0D0D]">
        <video
          ref={videoRef}
          src={url}
          className="size-full object-contain"
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        <span
          className="tabular absolute left-3.5 top-3 font-mono text-[11px]"
          style={{ color: "rgba(255,255,255,.6)" }}
        >
          {formatClock(position)}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/55 to-transparent pb-2.5 pt-7">
          <button
            type="button"
            onClick={() => nudge(-10)}
            className="tabular inline-flex h-6 cursor-pointer items-center rounded-[6px] bg-white/10 px-2.5 text-[11px] font-medium text-white/85"
          >
            −10s
          </button>
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) void video.play();
              else video.pause();
            }}
            className="inline-flex h-6 w-11 cursor-pointer items-center justify-center rounded-[6px] bg-[#3B82F6] text-white transition-colors duration-[var(--duration-hover)] hover:bg-[#2563EB]"
          >
            {playing ? (
              <Pause strokeWidth={2} className="size-3 fill-current" />
            ) : (
              <Play strokeWidth={2} className="size-3 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={() => nudge(10)}
            className="tabular inline-flex h-6 cursor-pointer items-center rounded-[6px] bg-white/10 px-2.5 text-[11px] font-medium text-white/85"
          >
            +10s
          </button>
        </div>
      </div>

      <div className="relative">
        <div ref={railRef} className="relative h-11 rounded-[8px] bg-[#0D0D0D]">
          <div
            className="absolute inset-y-0 left-0 rounded-l-[8px] bg-[rgba(250,250,250,0.78)]"
            style={{ width: `${startPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 rounded-r-[8px] bg-[rgba(250,250,250,0.78)]"
            style={{ width: `${100 - endPct}%` }}
          />
          <div
            className="absolute top-0 h-0.5 bg-[#3B82F6]"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          <div
            className="absolute bottom-0 h-0.5 bg-[#3B82F6]"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          <Handle
            pct={startPct}
            label="Trim start"
            onGrab={() => setDragging("start")}
            onNudge={(delta) =>
              onChange(
                Math.min(Math.max(0, startSeconds + delta), endSeconds - 1),
                endSeconds
              )
            }
          />
          <Handle
            pct={endPct}
            label="Trim end"
            onGrab={() => setDragging("end")}
            onNudge={(delta) =>
              onChange(
                startSeconds,
                Math.max(Math.min(duration, endSeconds + delta), startSeconds + 1)
              )
            }
          />
        </div>

        <div className="relative mt-2 h-[18px]">
          <Stamp pct={startPct} label="Start" value={formatClock(startSeconds)} />
          <Stamp pct={endPct} label="End" value={formatClock(endSeconds)} />
        </div>
      </div>
    </div>
  );
}

function Handle({
  pct,
  label,
  onGrab,
  onNudge,
}: {
  pct: number;
  label: string;
  onGrab: () => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onGrab}
      onKeyDown={(event) => {
        // Keyboard trimming in ten-second steps. A handle that only responds to
        // a pointer makes the billable window unreachable without a mouse.
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onNudge(-10);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onNudge(10);
        }
      }}
      className="absolute -bottom-1.5 -top-1.5 z-[3] -ml-[7px] flex w-3.5 cursor-ew-resize items-center justify-center outline-none focus-visible:shadow-[var(--focus-ring)]"
      style={{ left: `${pct}%` }}
    >
      <span className="h-[calc(100%-4px)] w-[5px] rounded-full bg-[#3B82F6] shadow-[0_0_0_1.5px_#FFFFFF]" />
    </button>
  );
}

function Stamp({
  pct,
  label,
  value,
}: {
  pct: number;
  label: string;
  value: string;
}) {
  return (
    <span
      className="absolute inline-flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap"
      style={{ left: `${pct}%` }}
    >
      <span
        className="text-[9px] font-medium uppercase tracking-[1.5px]"
        style={{ color: "#AAAAAA" }}
      >
        {label}
      </span>
      <span
        className="tabular text-[12px] font-medium"
        style={{ color: "#0D0D0D" }}
      >
        {value}
      </span>
    </span>
  );
}
