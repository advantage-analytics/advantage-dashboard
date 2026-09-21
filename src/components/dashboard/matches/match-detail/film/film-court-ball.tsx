"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { ballAt, type BallPoint, type FilmBallPath } from "./film-ball";
import { toCourtPercent } from "./film-court";
import { reducedMotionNow } from "./film-motion";

/**
 * The ball itself, moving over `FilmCourt`'s court box (T22).
 *
 * ── Why this drives itself ──────────────────────────────────────────────────
 *
 * `timeupdate` fires about four times a second. A mark that appears and fades
 * over seconds is fine at that cadence; a ball is not — at 4 Hz a serve
 * crosses the card in three jumps. So this reads `video.currentTime` on every
 * animation frame while the film plays and writes the result straight onto its
 * own two elements, exactly as `film-clock.ts`'s `useFilmClockVars` writes the
 * clock variables: a loop while playing, one sync when not, and NO React state
 * per frame. (It is a sibling pattern, not an extension of that hook — the
 * clock hook writes two CSS variables on an ancestor, this positions two
 * elements from a pure lookup.)
 *
 * Geometry is `toCourtPercent` and nothing else. `youLow` is always true
 * because the ball is only ever offered in the CAMERA view, where the stored
 * frame is the frame the film shows — the same call `pointMarks` makes for
 * `view: "camera"`.
 *
 * Neither element is focusable, neither is a button, and both take no pointer
 * events: the marks stay the only interactive things in the court box, and a
 * ball passing over one cannot steal the hover its readout depends on.
 *
 * Height (`z`) is carried through `film-ball.ts` but is not drawn.
 */

/** The dot, in pixels of the 152×227 court box. */
const BALL_SIZE = 5;
/**
 * How many trail segments are ever in the DOM. The tail is about 0.4 s of
 * roughly 10 Hz samples, so four or five points — six segments is headroom,
 * and a fixed count means the per-frame work is attribute writes on refs that
 * already exist, never a mount.
 */
const MAX_TAIL_SEGMENTS = 6;

/** Faintest and brightest a trail segment gets; older is fainter. */
const TAIL_MIN_ALPHA = 0.1;
const TAIL_MAX_ALPHA = 0.55;

const segmentIndexes = Array.from({ length: MAX_TAIL_SEGMENTS }, (_, i) => i);

/**
 * `prefers-reduced-motion: reduce`, read through the store hook rather than
 * state-in-an-effect: the media query IS an external store, and this way the
 * first client render already knows the answer instead of mounting the tail
 * and taking it away again.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The server has no media queries, and animation is the default answer. */
const reducedMotionOnServer = (): boolean => false;

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    reducedMotionNow,
    reducedMotionOnServer,
  );
}

export interface FilmCourtBallProps {
  /** The match's paths on the film clock, ascending by `contactTime`. */
  paths: readonly FilmBallPath[];
  /** The room's `<video>` — the only clock precise enough to drive this. */
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
}

export function FilmCourtBall({
  paths,
  videoRef,
  playing,
}: FilmCourtBallProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<SVGSVGElement>(null);
  const segmentRefs = useRef<(SVGLineElement | null)[]>([]);
  const reduced = usePrefersReducedMotion();

  /**
   * One frame's worth of work: look the ball up and write it onto the two
   * elements. Refs are only ever touched from here, which is called from an
   * effect or an event — never during render.
   */
  const draw = useCallback(() => {
    const dot = dotRef.current;
    const video = videoRef.current;
    if (!dot) return;

    const at = video ? ballAt(paths, video.currentTime) : null;
    if (!at) {
      dot.style.visibility = "hidden";
      if (tailRef.current) tailRef.current.style.visibility = "hidden";
      return;
    }

    const head = toCourtPercent(at.x, at.y, true);
    dot.style.left = `${head.x}%`;
    dot.style.top = `${head.y}%`;
    dot.style.visibility = "visible";

    const tail = tailRef.current;
    if (!tail) return;
    // Oldest first, so the last segment is the one touching the ball.
    const points: BallPoint[] = at.tail.map((p) =>
      toCourtPercent(p.x, p.y, true),
    );
    const count = Math.max(0, Math.min(points.length - 1, MAX_TAIL_SEGMENTS));
    // Keep the newest segments when a path ever samples faster than expected.
    const first = points.length - 1 - count;
    tail.style.visibility = count > 0 ? "visible" : "hidden";
    for (let i = 0; i < MAX_TAIL_SEGMENTS; i += 1) {
      const line = segmentRefs.current[i];
      if (!line) continue;
      if (i >= count) {
        line.style.display = "none";
        continue;
      }
      const a = points[first + i];
      const b = points[first + i + 1];
      line.style.display = "";
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
      const share = count === 1 ? 1 : i / (count - 1);
      const alpha = TAIL_MIN_ALPHA + (TAIL_MAX_ALPHA - TAIL_MIN_ALPHA) * share;
      line.style.opacity = String(Math.round(alpha * 100) / 100);
    }
  }, [paths, videoRef]);

  useEffect(() => {
    if (!playing) {
      // Paused or scrubbing: one position now, and one more after every seek.
      draw();
      const video = videoRef.current;
      if (!video) return;
      video.addEventListener("seeked", draw);
      return () => video.removeEventListener("seeked", draw);
    }
    let frame = 0;
    const tick = () => {
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, playing, videoRef]);

  return (
    <>
      {reduced ? null : (
        <svg
          ref={tailRef}
          aria-hidden="true"
          data-film-ball-tail
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
          style={{ visibility: "hidden" }}
        >
          {segmentIndexes.map((i) => (
            <line
              key={i}
              ref={(node) => {
                segmentRefs.current[i] = node;
              }}
              stroke="#FFFFFF"
              strokeWidth={1.4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ display: "none", opacity: 0 }}
            />
          ))}
        </svg>
      )}
      <div
        ref={dotRef}
        aria-hidden="true"
        data-film-ball
        className="pointer-events-none absolute z-[2]"
        style={{
          width: BALL_SIZE,
          height: BALL_SIZE,
          borderRadius: "var(--radius-pill)",
          background: "#FFFFFF",
          transform: "translate(-50%,-50%)",
          visibility: "hidden",
        }}
      />
    </>
  );
}
