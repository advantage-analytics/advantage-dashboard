import { useEffect } from "react";
import type { MatchPoint } from "@/lib/data/match-points-server";

const AUTO_ADVANCE_DELAY = 1; // seconds pause at 100% before advancing

interface UseAutoAdvanceOptions {
  activePointId: string | null;
  setActivePointId: (id: string | null) => void;
  displayPoints: MatchPoint[];
  getSeekOffsetSeconds: (videoTime: number) => number;
  seekEvent: string;
}

export function useAutoAdvance({
  activePointId,
  setActivePointId,
  displayPoints,
  getSeekOffsetSeconds,
  seekEvent,
}: UseAutoAdvanceOptions) {
  // Seek video when active point changes
  useEffect(() => {
    if (!activePointId) return;
    const active = displayPoints.find((p) => p.id === activePointId);
    if (!active?.videoTime && active?.videoTime !== 0) return;

    const offset = getSeekOffsetSeconds(active.videoTime);
    const targetTime = Math.max(0, active.videoTime - offset);

    window.dispatchEvent(
      new CustomEvent(seekEvent, { detail: { time: targetTime } }),
    );
  }, [activePointId, displayPoints, getSeekOffsetSeconds, seekEvent]);

  // Auto-advance to next playable point when duration elapses
  useEffect(() => {
    if (!activePointId) return;
    const idx = displayPoints.findIndex((p) => p.id === activePointId);
    if (idx === -1) return;

    const active = displayPoints[idx];
    const seconds = active.duration ?? 5;
    const offset =
      active.videoTime != null ? getSeekOffsetSeconds(active.videoTime) : 0;
    const effectiveSeconds = seconds + offset;

    const timer = setTimeout(
      () => {
        const next = displayPoints
          .slice(idx + 1)
          .find((p) => p.videoTime != null);
        setActivePointId(next ? next.id : null);
      },
      (effectiveSeconds + AUTO_ADVANCE_DELAY) * 1000,
    );

    return () => clearTimeout(timer);
  }, [activePointId, displayPoints, getSeekOffsetSeconds, setActivePointId]);
}
