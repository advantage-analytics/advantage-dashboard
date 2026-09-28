"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { VideoOff } from "lucide-react";
import type { LabelVideo } from "@/lib/services/labels/session";

/**
 * The console's video: the labelled job's own file in a plain `<video>`,
 * on the film tab's dark stage. The frame is 16:9 at whatever width the
 * console gives it — the band's small, fixed 384px, so the points table gets
 * the screen — with the court card's radius, so the band's two halves read
 * as a pair.
 *
 * Not `FilmPlayer`. That component is the film tab's — its props are the
 * attachment-refresh hook's state, the tab's point stops on the film clock
 * (built from `MatchPoint`s, which a label session does not have), and
 * bookmark and fullscreen callbacks that would be dead controls here.
 * Embedding it would mean faking a `MatchPoint` per label point and wiring
 * glyphs to nothing, so this takes the same signed URL (`getLabelSession`'s
 * `loadJobVideo`, the same `choosePlaybackFile` + `mintPlaybackSas` the film
 * tab's loader uses) and the browser's own controls instead. The one thing
 * the console needs from it — landing on a stroke — is `seekTo`.
 *
 * No SAS refresh: the credential lasts `PLAYBACK_SAS_TTL_SECONDS`, and a
 * labeller whose session outlives it reloads the page, which is what the
 * provider-job lineage of the film tab does too.
 */
export interface LabelVideoHandle {
  /** Seek to a label's `videoTime` (analysis clock), converted to this file. */
  seekTo: (videoTime: number) => void;
}

export const LabelVideoPlayer = forwardRef<
  LabelVideoHandle,
  {
    video: LabelVideo | null;
    /**
     * Where the file is, on the analysis clock (the offset added back), on
     * every `timeupdate` and every `seeking` step — the console's playing
     * highlight. The console decides what, if anything, to re-render.
     */
    onTime?: (videoTime: number) => void;
  }
>(function LabelVideoPlayer({ video, onTime }, ref) {
  const element = useRef<HTMLVideoElement>(null);
  const report = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (video)
      onTime?.(event.currentTarget.currentTime + video.startTimeSeconds);
  };

  useImperativeHandle(
    ref,
    () => ({
      seekTo(videoTime) {
        const el = element.current;
        if (!el || !video) return;
        el.currentTime = Math.max(0, videoTime - video.startTimeSeconds);
      },
    }),
    [video],
  );

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-[#1A1A1C]">
      {video ? (
        <video
          ref={element}
          src={video.url}
          controls
          preload="metadata"
          playsInline
          onTimeUpdate={report}
          onSeeking={report}
          className="absolute inset-0 block h-full w-full"
        />
      ) : (
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
      )}
    </div>
  );
});
