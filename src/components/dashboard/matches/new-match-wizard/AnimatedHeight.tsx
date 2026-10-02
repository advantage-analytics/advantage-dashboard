"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Lets the page below a notice glide rather than jump when the notice changes
 * size — a three-answer question collapsing to one settled line, or a question
 * appearing and going away.
 *
 * Without it the content under the notice snaps up ~80px on the click while
 * the new line is still fading in, which is the part of the collapse that read
 * as broken. Height is the one property here that isn't transform or opacity,
 * so it stays short; the first measurement sets the height without animating.
 *
 * Clipped with `overflow: clip` and a 4px clip margin: a resize never shows
 * the taller state spilling over the content below, while a focus ring and
 * the notice's 4px entrance drop still fit.
 *
 * Timing: 220ms on `--ease-out-expo`, the strong ease-out — a response to a
 * click, so it moves at once and settles. Reduced motion jumps straight there.
 */
export function AnimatedHeight({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.borderBoxSize?.[0]?.blockSize ?? inner.offsetHeight);
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={height === null ? undefined : { height }}
      className={
        height === null
          ? undefined
          : "overflow-clip transition-[height] duration-[220ms] ease-[var(--ease-out-expo)] [overflow-clip-margin:4px] motion-reduce:transition-none"
      }
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
