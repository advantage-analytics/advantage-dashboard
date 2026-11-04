"use client";

import { useEffect, useRef } from "react";
import {
  shouldBeat,
  WORK_BEAT_INTERVAL,
} from "@/lib/services/labels/work-beats";

/**
 * The least gap between two beats from this tab. A little under the tick, so
 * a timer that fires a few ms early (they do) does not skip every other
 * minute; a visibility tick landing just before the timer is still caught —
 * the two land in different minutes or the database keeps one.
 */
const BEAT_GAP = WORK_BEAT_INTERVAL - 5_000;

/**
 * The console's active-time heartbeat: once a tick (every minute), post one
 * beat for `sessionId` when `shouldBeat` (work-beats.ts) says the labeller is
 * working — the tab in front and a key or pointer down recently. Input is
 * watched on `document` in the capture phase, so a control that stops
 * propagation still counts. Returning to the tab ticks at once, so the minute
 * the labeller comes back is not lost to the interval.
 *
 * `record` is a server action; a failed beat is a minute the list does not
 * count, nothing more, so it is never retried or shown.
 */
export function useWorkBeat(
  sessionId: string,
  record: ((sessionId: string) => Promise<unknown>) | undefined | null,
): void {
  const latest = useRef(record);
  useEffect(() => {
    latest.current = record;
  }, [record]);
  const enabled = Boolean(record);

  useEffect(() => {
    if (!enabled) return;
    let lastInputAt: number | null = null;
    let lastBeatAt: number | null = null;

    const tick = () => {
      const now = Date.now();
      const visible = document.visibilityState === "visible";
      const state = { now, visible, lastInputAt, lastBeatAt };
      if (!shouldBeat(state, { interval: BEAT_GAP })) return;
      const send = latest.current;
      if (!send) return;
      lastBeatAt = now;
      void Promise.resolve()
        .then(() => send(sessionId))
        .catch(() => {});
    };
    const onInput = () => {
      lastInputAt = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("keydown", onInput, true);
    document.addEventListener("pointerdown", onInput, true);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(tick, WORK_BEAT_INTERVAL);
    return () => {
      document.removeEventListener("keydown", onInput, true);
      document.removeEventListener("pointerdown", onInput, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, sessionId]);
}
