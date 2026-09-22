"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether the film is still catching up with a seek the chrome has already
 * made (T16). Display state only — it moves no playhead.
 *
 * Both players move their chrome on the click: the room's `seek` marks the
 * target and writes `--film-t`, the report player's `seekTo` pushes it, so the
 * lit row, the board, the transport and `savePoint` name the new point at
 * once (option A — the viewer's own placement leads). The element, though,
 * keeps the old point's last frame until `seeked`, which on an unbuffered
 * keyframe-sparse recording is over a second away, and Chrome fires no
 * `waiting` for a paused seek. This hook is how the frame admits it: wire
 * `onSeeking` / `onSeeked` to the `<video>` and dim it while `seeking` is
 * true.
 *
 * - **A grace before it says anything.** `seeking` turns true only once a
 *   seek has been in flight for `graceMs` without a `seeked`: a buffered jump
 *   lands in ~10 ms and the shell's mount nudge is instant, and neither may
 *   flash. A second `seeking` inside the grace keeps the first timer — the
 *   seek has been in flight since then.
 * - **`seeked` clears it**, pending timer included.
 * - **A new `generation` resets it.** The element is keyed on the generation,
 *   so the old one can never fire the `seeked` that would have cleared it.
 * - **Unmount clears the timer.**
 *
 * A second listener beside the T14 trace's, never a replacement for it.
 */
export function useSeekSettling({
  graceMs,
  generation,
}: {
  graceMs: number;
  generation: number;
}) {
  const [seeking, setSeeking] = useState(false);
  // The generation `seeking` belongs to. Compared during render, so a stranded
  // `true` from the old element is never painted on the new one.
  const [seekingGeneration, setSeekingGeneration] = useState(generation);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (seekingGeneration !== generation) {
    setSeekingGeneration(generation);
    setSeeking(false);
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onSeeking = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSeeking(true);
    }, graceMs);
  }, [graceMs]);

  const onSeeked = useCallback(() => {
    clearTimer();
    setSeeking(false);
  }, [clearTimer]);

  // Runs on a generation change (the old element's pending grace must not
  // light the new one) and on unmount.
  useEffect(() => clearTimer, [generation, clearTimer]);

  return { seeking, onSeeking, onSeeked };
}
