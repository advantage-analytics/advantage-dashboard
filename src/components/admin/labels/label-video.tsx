"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { VideoOff } from "lucide-react";
import {
  FilmPlayer,
  type FilmPlayerHandle,
} from "@/components/dashboard/matches/match-detail/film/film-player";
import type { LabelPoint, LabelVideo } from "@/lib/services/labels/session";
import { labelFilmStops } from "./label-film-stops";

/**
 * The console's video: the labelled job's own file in the match film tab's
 * player — `FilmPlayer`, the same frame, set-by-set track, seek preview and
 * transport — so a labeller watches the match exactly as an athlete does.
 *
 * What the tab wires to it, and what this wires instead:
 *
 * - **The credential.** The same signed URL (`getLabelSession`'s
 *   `loadJobVideo`, the same `choosePlaybackFile` + `mintPlaybackSas` the
 *   tab's loader uses), passed as `passthrough` — the Advantage Intelligence
 *   lineage's contract: no refresh hook, generation 0, and a media error
 *   raises the player's own "The film stopped loading · Reload" panel. That
 *   is the right repair here too: the page signs a fresh URL per render.
 * - **The stops.** The label points, on the console's playing rule
 *   (`label-film-stops.ts`), so Previous/Next point, Loop and Skip dead time
 *   walk exactly the spans the table lights up.
 * - **No bookmarks, no film room.** `showSave` and `showFullscreen` are off;
 *   their callbacks are never reached.
 *
 * ── Two clocks ──────────────────────────────────────────────────────────────
 * The player speaks FILE seconds; a label's `videoTime` is on the ANALYSIS
 * clock. `startTimeSeconds` is subtracted on the way in (`seekTo`) and added
 * back on the way out (`onTime`), here and nowhere else in the console.
 */
export interface LabelVideoHandle {
  /** Seek to a label's `videoTime` (analysis clock), converted to this file. */
  seekTo: (videoTime: number) => void;
  togglePlay: () => void;
  /** The previous (-1) or next (1) point, as the transport's glyphs step. */
  step: (direction: -1 | 1) => void;
}

const noop = () => {};

export const LabelVideoPlayer = forwardRef<
  LabelVideoHandle,
  {
    video: LabelVideo | null;
    /** The session's rows, for the player's point stops. */
    points: readonly LabelPoint[];
    /**
     * Where the file is, on the analysis clock (the offset added back), on
     * every `timeupdate` and `seeked` — the console's playing highlight. The
     * console decides what, if anything, to re-render.
     */
    onTime?: (videoTime: number) => void;
    /** Play and pause as the element reports them — the minimised pill's glyph. */
    onPlayingChange?: (playing: boolean) => void;
  }
>(function LabelVideoPlayer({ video, points, onTime, onPlayingChange }, ref) {
  const player = useRef<FilmPlayerHandle>(null);
  const offset = video?.startTimeSeconds ?? 0;
  const stops = useMemo(() => labelFilmStops(points, offset), [points, offset]);

  const onTimeChange = useCallback(
    (seconds: number) => onTime?.(seconds + offset),
    [onTime, offset],
  );
  const onPlaybackPlaying = useCallback(
    (playing: boolean) => onPlayingChange?.(playing),
    [onPlayingChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      seekTo(videoTime) {
        player.current?.seekTo(Math.max(0, videoTime - offset));
      },
      togglePlay() {
        player.current?.togglePlay();
      },
      step(direction) {
        player.current?.step(direction);
      },
    }),
    [offset],
  );

  if (!video) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-[#1A1A1C]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <VideoOff
            className="size-8 text-white/50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-[13px] text-white/70">
            No video for this job
          </span>
        </div>
      </div>
    );
  }

  return (
    <FilmPlayer
      ref={player}
      url={video.url}
      generation={0}
      resume={null}
      problem={null}
      passthrough
      background={false}
      stops={stops}
      allStops={stops}
      saved={null}
      showSave={false}
      showFullscreen={false}
      onTimeChange={onTimeChange}
      onPlaybackTime={noop}
      onPlaybackPlaying={onPlaybackPlaying}
      onLoadFailure={noop}
      onPlayRejected={noop}
      onRetry={noop}
      onToggleSaved={noop}
      onEnterFullscreen={noop}
    />
  );
});
