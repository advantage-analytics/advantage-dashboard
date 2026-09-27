/**
 * Pure helpers behind the seek-lane hover preview (handoff T1): the design's
 * numbers, the geometry that turns a pointer position into a lane fraction
 * and a floating preview box's left edge, the run gradient's hover "lift",
 * and a coalescer that keeps a preview `<video>`'s seeks from piling up
 * while the pointer moves across the lane.
 *
 * No React, no DOM — the hook that owns the `<video>` element is T2's
 * `use-seek-preview.ts`, and the markup lives in `film-track.tsx`.
 */

/** The preview box's 16:9 frame, by which lane it belongs to. */
export const PREVIEW_FRAME = {
  report: { width: 160, height: 90 },
  room: { width: 256, height: 144 },
} as const;

/**
 * How far the box may hang past the lane's own edges. The report lane sits
 * 16px inside its frame, so the box can reach 8px past the lane and still
 * land inside the frame; the room lane sits on the 24px gutter with nowhere
 * to overhang into, so it stays inside the lane entirely.
 */
export const PREVIEW_OVERHANG_PX = {
  report: 8,
  room: 0,
} as const;

export const PREVIEW_PAD_PX = 4;
export const PREVIEW_HANG_PX = 6;
export const PREVIEW_REST_MS = 150;
export const PREVIEW_FADE_MS = 200;
/**
 * The floor between successive seeks issued to the preview element. Matches
 * the seek-settling grace already used in this subtree
 * (`use-seek-settling.ts`'s `graceMs`) — not load-bearing, just a number the
 * author picked to tune later.
 */
export const PREVIEW_SEEK_INTERVAL_MS = 120;

export type PreviewSize = keyof typeof PREVIEW_FRAME;

/** The preview box's own width: its frame plus padding on both sides. */
export function previewBoxWidth(size: PreviewSize): number {
  return PREVIEW_FRAME[size].width + 2 * PREVIEW_PAD_PX;
}

/**
 * The preview box's left edge, in the lane's own pixels, for a pointer at
 * `pointerX`. Centred on the pointer, then clamped to
 * `[-overhang, laneWidth - boxWidth + overhang]` so the box can hang past
 * the lane by `overhang` px at either end but no further.
 *
 * When the lane is narrower than the box (the upper bound falls below the
 * lower one), the lower bound wins — the box pins to the lane's near edge
 * rather than snapping to whichever bound the clamp order would otherwise
 * prefer.
 */
export function previewLeft({
  pointerX,
  laneWidth,
  boxWidth,
  overhang,
}: {
  pointerX: number;
  laneWidth: number;
  boxWidth: number;
  overhang: number;
}): number {
  const min = -overhang;
  const max = laneWidth - boxWidth + overhang;
  if (max < min) return min;
  const centered = pointerX - boxWidth / 2;
  const clamped = Math.min(Math.max(centered, min), max);
  // `-overhang` is `-0` when `overhang` is 0 (the room lane); normalise so
  // callers never see a `-0` left edge.
  return clamped === 0 ? 0 : clamped;
}

/**
 * The lane fraction (0..1) for a pointer at `clientX`, given the lane's own
 * `getBoundingClientRect().left` and `.width`. Mirrors `FilmTrack`'s
 * `seekFromPointer` arithmetic exactly, except a zero-width lane — which
 * `seekFromPointer` simply bails out of — returns 0 here instead of NaN,
 * since this is a pure function with no early-return-and-do-nothing option.
 */
export function laneFraction(
  clientX: number,
  laneLeft: number,
  laneWidth: number,
): number {
  if (laneWidth === 0) return 0;
  return Math.min(1, Math.max(0, (clientX - laneLeft) / laneWidth));
}

/**
 * The run's `background`: `film-track.tsx`'s existing two-stop gradient —
 * `var(--blue)` up to a `--film-t`-driven split, then a flat trailing colour
 * — extended with a third "lift" band between that split and a second split
 * built identically from `--film-hover`, the CSS variable the lane writes on
 * hover.
 *
 * With no hover in progress `--film-hover` defaults to -1, so its split
 * clamps to 0% — at or before the watched split for any run that has played
 * at all. CSS's rule that a gradient's color-stop positions never decrease
 * bumps a stop that lands before an earlier one up to match it, so the lift
 * band's start and end collapse onto the same point and it paints with zero
 * width. The lift only opens once `--film-hover` moves past this run's own
 * `start`.
 */
export function trackRunGradient({
  start,
  end,
}: {
  start: number;
  end: number;
}): string {
  const span = Math.max(end - start, 0.001);
  const split = (cssVar: string) =>
    `clamp(0%, calc((${cssVar} - ${start}) / ${span} * 100%), 100%)`;
  const watchedSplit = split("var(--film-t, 0)");
  const hoverSplit = split("var(--film-hover, -1)");
  return (
    `linear-gradient(to right, var(--blue) 0 ${watchedSplit}, ` +
    `rgba(255,255,255,0.34) ${watchedSplit} ${hoverSplit}, ` +
    `rgba(255,255,255,0.22) ${hoverSplit} 100%)`
  );
}

/**
 * Coalesces a stream of wanted seek times into as few actual `seek(t)` calls
 * as a `minIntervalMs` floor allows, always keeping only the single most
 * recent wanted time rather than a queue.
 *
 * - `request(t)` — issues `seek(t)` at once if nothing is in flight and at
 *   least `minIntervalMs` has passed since the last issue; otherwise holds
 *   `t` as the wanted time, replacing whatever was held before.
 * - `landed()` — the caller's signal that the in-flight seek has completed
 *   (e.g. the preview element's `seeked` event). Clears in-flight and, if a
 *   wanted time is held and the interval has also elapsed, issues it.
 * - `cancel()` — drops the wanted time and any pending timer. Does not
 *   affect a seek already in flight.
 *
 * Both `landed()` and the interval timer converge on the same `flush()`:
 * it issues the wanted time only once both conditions hold (nothing in
 * flight, interval elapsed), and otherwise arms a timer for whichever
 * condition is still outstanding. `flush()` never arms a second timer while
 * one is already pending.
 */
export function createSeekCoalescer({
  seek,
  minIntervalMs,
  now,
  schedule,
}: {
  seek: (t: number) => void;
  minIntervalMs: number;
  now: () => number;
  /** Returns a cancel handle, the way `setTimeout` + `clearTimeout` would. */
  schedule: (fn: () => void, ms: number) => () => void;
}): { request: (t: number) => void; landed: () => void; cancel: () => void } {
  let inFlight = false;
  let lastIssueAt = -Infinity;
  let wanted: number | null = null;
  let cancelTimer: (() => void) | null = null;

  function clearTimer() {
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
  }

  function issue(t: number) {
    wanted = null;
    clearTimer();
    inFlight = true;
    lastIssueAt = now();
    seek(t);
  }

  function flush() {
    if (wanted === null || inFlight) return;
    const elapsed = now() - lastIssueAt;
    if (elapsed >= minIntervalMs) {
      issue(wanted);
      return;
    }
    if (cancelTimer) return;
    cancelTimer = schedule(() => {
      cancelTimer = null;
      flush();
    }, minIntervalMs - elapsed);
  }

  return {
    request(t: number) {
      if (!inFlight && now() - lastIssueAt >= minIntervalMs) {
        issue(t);
        return;
      }
      wanted = t;
      flush();
    },
    landed() {
      inFlight = false;
      flush();
    },
    cancel() {
      wanted = null;
      clearTimer();
    },
  };
}
