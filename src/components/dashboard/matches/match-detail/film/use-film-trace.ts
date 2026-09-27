"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { createFilmTrace, readTraceFlag, type FilmTrace } from "./film-trace";

/**
 * T14: the seek trace is opt-in (`localStorage["film-room:trace"]`), read
 * once. Off, the ref stays null — no listener, no `performance` call.
 *
 * Follows each element a player mounts. Keyed on `generation` so a remount
 * mid-seek is recorded on that seek; the trace itself outlives it. Both the
 * room and the report player call this the same way and keep their own
 * `traceRef.current?.seek(el, target)` line where they seek.
 */
export function useFilmTrace(
  videoRef: RefObject<HTMLVideoElement | null>,
  generation: number,
  surface: "room" | "report",
): RefObject<FilmTrace | null> {
  const [traceOn] = useState(readTraceFlag);
  const traceRef = useRef<FilmTrace | null>(null);

  useEffect(() => {
    if (!traceOn) return;
    const el = videoRef.current;
    if (!el) return;
    traceRef.current ??= createFilmTrace(surface);
    return traceRef.current.attach(el, generation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceOn, generation]);
  useEffect(() => () => traceRef.current?.dispose(), []);

  return traceRef;
}
