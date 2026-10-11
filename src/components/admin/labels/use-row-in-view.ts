"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether the point row `pointId` shows any part of itself inside the rail's
 * scroller. Null `pointId`, or no scroller, reads as out of view, so whatever
 * waits on it still shows.
 */
export function useRowInView(
  scrollerRef: RefObject<HTMLDivElement | null> | undefined,
  pointId: string | null,
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef?.current ?? null;
    const row =
      pointId === null || scroller === null
        ? null
        : scroller.querySelector<HTMLElement>(
            `[data-row="point"][data-point-id="${CSS.escape(pointId)}"]`,
          );
    if (!row || typeof IntersectionObserver === "undefined") {
      setInView(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { root: scroller },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [scrollerRef, pointId]);

  return pointId === null ? false : inView;
}
