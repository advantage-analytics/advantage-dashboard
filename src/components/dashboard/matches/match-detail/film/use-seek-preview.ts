"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from "react";

import {
  createSeekCoalescer,
  PREVIEW_FADE_MS,
  PREVIEW_REST_MS,
  PREVIEW_SEEK_INTERVAL_MS,
} from "./film-seek-preview";
import { useSeekSettling } from "./use-seek-settling";

export type SeekPreviewState = "empty" | "held" | "live";

export type SeekPreviewVideoProps = ComponentPropsWithRef<"video"> & {
  "data-testid": string;
};

/**
 * The seek lane's hover frame (handoff T2): a second, muted `<video>` on the
 * same credential as the player — this hook owns its props, its seeks and
 * its lifetime; `film-track.tsx` spreads them onto the element — seeked to wherever the pointer is over the
 * lane, so the viewer sees the frame before committing to it.
 *
 * - **Nothing at page load.** The element mounts on the lane's first
 *   non-touch hover or first scrub (`hover` / `scrub`), never before, and
 *   never while `url` is null. On a moov-at-tail cut every fresh element
 *   range-requests the tail before it can seek, so a lane nobody hovers
 *   must cost nothing. Once mounted it stays mounted across open/close.
 * - **The identical `src`.** Same string as the player's element, so the
 *   browser can share its media cache for the range requests, and no
 *   cross-origin attribute — playback never consults CORS and this element is no
 *   exception. `preload="metadata"` plus a seek is what paints a frame.
 * - **Keyed on `generation`**, like the player: a refreshed credential is a
 *   remount, never a `src` swap on a live element.
 * - **Seeks are coalesced** (`createSeekCoalescer`): one in flight, the
 *   latest wanted time remembered, at most one issue per
 *   `PREVIEW_SEEK_INTERVAL_MS`; `seeked` is the landing. Nothing is issued
 *   before the element has metadata — an earlier request waits as the
 *   wanted time and goes out on `loadedmetadata`.
 * - **`state`**: `empty` until this generation's first frame has landed,
 *   `held` while a newer seek has been in flight past the 120 ms grace
 *   (`useSeekSettling`), `live` otherwise.
 * - **`open`**: a hover opens after `PREVIEW_REST_MS` of rest on entering
 *   the lane, so a pointer crossing the lane on its way to the buttons
 *   below never flashes a box; a scrub opens at once. `visible` trails
 *   `open` by `PREVIEW_FADE_MS` on the way out, so the box can finish its
 *   fade before it is `visibility: hidden`.
 *
 * `hover` is called on every pointer move and sets React state only on the
 * transitions (first mount, open) — never per move.
 */
export function useSeekPreview({
  url,
  generation,
}: {
  url: string | null;
  generation: number;
}): {
  open: boolean;
  visible: boolean;
  state: SeekPreviewState;
  hover: (seconds: number) => void;
  scrub: (seconds: number) => void;
  close: () => void;
  video: SeekPreviewVideoProps | null;
  videoKey: number;
} {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  // The generation whose first frame has landed; -1 until any has.
  const [landedGeneration, setLandedGeneration] = useState(-1);
  const settling = useSeekSettling({
    graceMs: PREVIEW_SEEK_INTERVAL_MS,
    generation,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);
  const armedRef = useRef(false);
  const openRef = useRef(false);
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Asked for before the element had metadata; issued on `loadedmetadata`. */
  const wantedRef = useRef<number | null>(null);
  /** The latest time asked for, carried to a remounted element. */
  const lastRef = useRef<number | null>(null);

  const makeCoalescer = useCallback(
    () =>
      createSeekCoalescer({
        seek: (t) => {
          const el = videoRef.current;
          if (el) el.currentTime = t;
        },
        minIntervalMs: PREVIEW_SEEK_INTERVAL_MS,
        now: () => performance.now(),
        schedule: (fn, ms) => {
          const id = setTimeout(fn, ms);
          return () => clearTimeout(id);
        },
      }),
    [],
  );
  const coalescerRef = useRef<ReturnType<typeof createSeekCoalescer> | null>(
    null,
  );

  // One coalescer per element: a new generation is a new `<video>`, and the
  // old one can never fire the `seeked` that would clear its in-flight seek.
  // The last wanted time is carried over so the new element paints the frame
  // the viewer is still pointing at.
  useEffect(() => {
    coalescerRef.current = makeCoalescer();
    wantedRef.current = lastRef.current;
    return () => {
      coalescerRef.current?.cancel();
      coalescerRef.current = null;
    };
  }, [generation, makeCoalescer]);

  useEffect(
    () => () => {
      if (restTimerRef.current !== null) clearTimeout(restTimerRef.current);
      if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current);
    },
    [],
  );

  const request = useCallback((t: number) => {
    lastRef.current = t;
    const el = videoRef.current;
    const coalescer = coalescerRef.current;
    if (!el || !coalescer || el.readyState < 1) {
      wantedRef.current = t;
      return;
    }
    wantedRef.current = null;
    coalescer.request(t);
  }, []);

  const arm = useCallback(() => {
    if (armedRef.current) return;
    armedRef.current = true;
    setArmed(true);
  }, []);

  const show = useCallback(() => {
    if (restTimerRef.current !== null) {
      clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (openRef.current) return;
    openRef.current = true;
    setVisible(true);
    setOpen(true);
  }, []);

  const hover = useCallback(
    (seconds: number) => {
      if (url === null) return;
      arm();
      request(seconds);
      if (openRef.current || restTimerRef.current !== null) return;
      restTimerRef.current = setTimeout(() => {
        restTimerRef.current = null;
        show();
      }, PREVIEW_REST_MS);
    },
    [url, arm, request, show],
  );

  const scrub = useCallback(
    (seconds: number) => {
      if (url === null) return;
      arm();
      request(seconds);
      show();
    },
    [url, arm, request, show],
  );

  const close = useCallback(() => {
    if (restTimerRef.current !== null) {
      clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
    coalescerRef.current?.cancel();
    wantedRef.current = null;
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      setVisible(false);
    }, PREVIEW_FADE_MS);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const wanted = wantedRef.current;
    if (wanted === null) return;
    wantedRef.current = null;
    coalescerRef.current?.request(wanted);
  }, []);

  const { onSeeking, onSeeked: settleSeeked } = settling;
  const onSeeked = useCallback(() => {
    settleSeeked();
    setLandedGeneration(generation);
    coalescerRef.current?.landed();
  }, [settleSeeked, generation]);

  const state: SeekPreviewState =
    landedGeneration !== generation
      ? "empty"
      : settling.seeking
        ? "held"
        : "live";

  // The element's props, spread onto the `<video>` inside the preview frame
  // (`film-track.tsx`); null until the lane has been hovered or scrubbed, and
  // while there is no credential. `key` is separate so the caller can pass it
  // to JSX directly — a refreshed credential is a remount.
  const video: SeekPreviewVideoProps | null =
    armed && url !== null
      ? {
          ref: setVideo,
          src: url,
          muted: true,
          playsInline: true,
          preload: "metadata",
          "aria-hidden": true,
          tabIndex: -1,
          "data-testid": "film-seek-preview-video",
          className: "h-full w-full object-cover",
          onLoadedMetadata,
          onSeeking,
          onSeeked,
        }
      : null;

  return {
    open,
    visible,
    state,
    hover,
    scrub,
    close,
    video,
    videoKey: generation,
  };
}
