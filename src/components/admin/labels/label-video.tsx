"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Play, VideoOff } from "lucide-react";
import { FilmFramePending } from "@/components/dashboard/loading/film-frame-pending";
import { useFilmClockVars } from "@/components/dashboard/matches/match-detail/film/film-clock";
import {
  REACHED_EPSILON_SECONDS,
  activeStopAt,
  deadTimeJump,
  nextStop,
  prevStop,
  setSegments,
} from "@/components/dashboard/matches/match-detail/film/film-timeline";
import {
  FilmTransport,
  PLAYBACK_RATES,
  type FilmTransportControl,
} from "@/components/dashboard/matches/match-detail/film/film-transport";
import { useSeekSettling } from "@/components/dashboard/matches/match-detail/film/use-seek-settling";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LabelPoint, LabelVideo } from "@/lib/services/labels/session";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { labelFilmStops, type LabelFilmStop } from "./label-film-stops";
import { KEY_OWNER_SELECTOR } from "./label-layout";

/**
 * The console's video: the labelled job's own file, with the Video tab's
 * full-screen transport (`FilmTransport`) over its foot.
 *
 * It owns its `<video>` rather than mounting `FilmPlayer`, whose own control
 * bar and rate/loop/skip state would leave the transport nothing to read.
 * Playback rules are the tab's (`film-timeline.ts`).
 *
 * - Credential: the signed URL from `loadJobVideo`; a media error shows
 *   "Reload", which re-signs. `preload="metadata"`, since files are
 *   multi-gigabyte.
 * - Stops: label points on the console's playing rule (`label-film-stops.ts`),
 *   so Previous/Next, Loop and Skip dead time walk the spans the rail lights.
 * - Left off the bar (`HIDDEN`): bookmarks, scoreboard, layout exit, "More".
 * - Loading: `FilmFramePending` over the element and an `inert` transport until
 *   `canplay`; the frame stays clickable so a browser that waits for play can
 *   be asked.
 * - Clocks: see video-clock.ts; `startTimeSeconds` is subtracted in `seekTo`
 *   and added back in `onTime`, here only.
 * - `useFilmClockVars` writes `--film-t` / `--film-d`; `clockTargetRef` names a
 *   second element (the console root) so the rail shares the clock. `square`
 *   flushes the frame to a black stage.
 */
export interface LabelVideoHandle {
  /** Seek to a label's `videoTime` (analysis clock), converted to this file. */
  seekTo: (videoTime: number) => void;
  togglePlay: () => void;
  /** Whether the film is running — read before a remount that would stop it. */
  isPlaying: () => boolean;
  /** Start the film; a no-op while it plays. */
  play: () => void;
  /** The previous (-1) or next (1) point, as the transport's glyphs step. */
  step: (direction: -1 | 1) => void;
}

/** What the transport's title row says about the playing point. */
export interface LabelVideoReadout {
  title: string;
  subtitle: string | null;
  position: { index: number; total: number } | null;
}

const HIDDEN: readonly FilmTransportControl[] = [
  "saved",
  "court",
  "exit",
  "more",
];

const NO_READOUT: LabelVideoReadout = {
  title: "Video",
  subtitle: null,
  position: null,
};

const noop = () => {};

/** No second clock target: `useFilmClockVars` writes nothing through it. */
const NULL_REF: RefObject<HTMLElement | null> = { current: null };

export const LabelVideoPlayer = forwardRef<
  LabelVideoHandle,
  {
    video: LabelVideo | null;
    /** The session's rows, for the player's point stops. */
    points: readonly LabelPoint[];
    readout?: LabelVideoReadout;
    /** The file's position on the analysis clock, on every report. */
    onTime?: (videoTime: number) => void;
    /** Playable on first render — for specs. A real element starts pending. */
    initialReady?: boolean;
    /**
     * A second element to carry `--film-t` / `--film-d` (the console root).
     */
    clockTargetRef?: RefObject<HTMLElement | null>;
    /** Square corners throughout, for a frame flush to the black stage. */
    square?: boolean;
  }
>(function LabelVideoPlayer(
  {
    video,
    points,
    readout = NO_READOUT,
    onTime,
    initialReady = false,
    clockTargetRef,
    square = false,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** The point the film was last inside, for Loop (see `film-player.tsx`). */
  const loopStopRef = useRef<LabelFilmStop | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [looping, setLooping] = useState(false);
  const [skipDead, setSkipDead] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(initialReady);

  const settling = useSeekSettling({ graceMs: 120, generation: 0 });
  const syncFrameClock = useFilmClockVars(videoRef, frameRef, playing);
  const syncTargetClock = useFilmClockVars(
    videoRef,
    clockTargetRef ?? NULL_REF,
    playing,
  );
  const syncClock = useCallback(() => {
    syncFrameClock();
    syncTargetClock();
  }, [syncFrameClock, syncTargetClock]);

  const offset = video?.startTimeSeconds ?? 0;
  const stops = useMemo(() => labelFilmStops(points, offset), [points, offset]);
  const segments = useMemo(
    () => setSegments(stops, duration),
    [stops, duration],
  );

  /** One place that moves the playhead everywhere it is read. */
  const pushTime = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      onTime?.(seconds + offset);
      syncClock();
    },
    [onTime, offset, syncClock],
  );

  const seek = useCallback(
    (seconds: number) => {
      const el = videoRef.current;
      if (!el) return;
      const max =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : undefined;
      const target = Math.max(0, max ? Math.min(seconds, max) : seconds);
      el.currentTime = target;
      // Loop follows the viewer: every seek is someone asking to be somewhere,
      // so the point being repeated moves with them (`film-player.tsx`).
      loopStopRef.current = activeStopAt(stops, target)?.stop ?? null;
      pushTime(target);
    },
    [stops, pushTime],
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    // A refused `play()` is autoplay policy or a load the next seek
    // interrupted — never a broken file — so nothing is raised for it.
    if (el.paused) void el.play().catch(noop);
    else el.pause();
  }, []);

  const step = useCallback(
    (direction: -1 | 1) => {
      const now = videoRef.current?.currentTime ?? 0;
      const stop =
        direction === 1 ? nextStop(stops, now) : prevStop(stops, now);
      if (stop) seek(stop.start);
    },
    [stops, seek],
  );

  const cycleRate = useCallback(() => {
    setRate((current) => {
      const i = PLAYBACK_RATES.indexOf(
        current as (typeof PLAYBACK_RATES)[number],
      );
      return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
    });
  }, []);
  const toggleLoop = useCallback(() => setLooping((v) => !v), []);
  const toggleMute = useCallback(() => setMuted((v) => !v), []);
  const toggleSkipDeadTime = useCallback(() => setSkipDead((v) => !v), []);

  // Element state React does not carry, written in one place.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = rate;
    el.muted = muted;
  }, [rate, muted]);

  /** A playhead report, plus what Loop and Skip dead time do with it. */
  const onPlayhead = useCallback(
    (t: number) => {
      pushTime(t);
      const previous = loopStopRef.current;
      if (
        looping &&
        previous &&
        t >= previous.end - REACHED_EPSILON_SECONDS &&
        t < previous.end + 1
      ) {
        seek(previous.start);
        return;
      }
      loopStopRef.current = activeStopAt(stops, t)?.stop ?? null;
      if (skipDead) {
        const jump = deadTimeJump(stops, t);
        if (jump !== null) seek(jump);
      }
    },
    [stops, looping, skipDead, seek, pushTime],
  );

  /** Metadata is in: take the duration and paint the first frame. */
  const settle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration || 0);
    // With `preload="metadata"` nothing is decoded yet, so the frame sits
    // black until something seeks it; a hair past zero draws one frame.
    if (el.currentTime === 0) el.currentTime = 0.001;
    syncClock();
  }, [syncClock]);

  /** Playable: `canplay`, or any later event that finds `readyState` ≥ 3. */
  const checkReady = useCallback(() => {
    const el = videoRef.current;
    if (el && el.readyState >= 3) setReady(true);
  }, []);

  // An element the browser had cached can be past both events before React
  // attaches a listener; asking it is the reading that is true either way.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.readyState >= 1) settle();
    checkReady();
  }, [settle, checkReady]);

  // D, L and M — the keys the transport's tooltips name. Space and ← / → are
  // the console's (it owns the handle); these three are the player's own
  // state. On the console's terms: never from inside a control or an editor.
  useEffect(() => {
    if (!video) return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "d" && key !== "l" && key !== "m") return;
      const target = event.target as Element | null;
      if (target?.closest?.(KEY_OWNER_SELECTOR)) return;
      event.preventDefault();
      if (key === "d") toggleSkipDeadTime();
      else if (key === "l") toggleLoop();
      else toggleMute();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [video, toggleSkipDeadTime, toggleLoop, toggleMute]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(videoTime) {
        seek(Math.max(0, videoTime - offset));
      },
      togglePlay,
      isPlaying() {
        const el = videoRef.current;
        return el !== null && !el.paused && !el.ended;
      },
      play() {
        const el = videoRef.current;
        if (el?.paused) void el.play().catch(noop);
      },
      step,
    }),
    [offset, seek, togglePlay, step],
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

  // No endpoint re-signs this URL, so reloading the page is the only repair.
  if (failed) {
    return (
      <div
        role="alert"
        data-testid="film-reload-panel"
        className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[var(--surface-card)] px-6 text-center"
      >
        <span className="text-title" style={{ fontSize: "16px" }}>
          The film stopped loading
        </span>
        <span
          className="text-body-sm max-w-[380px]"
          style={{ color: "var(--ink-600)" }}
        >
          Playback links are signed for a short window and this one has run out.
          Reloading the page signs a fresh one.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={advButton("primary", "md")}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        ref={frameRef}
        data-label-video-frame=""
        data-video-ready={ready ? "true" : "false"}
        className="relative aspect-video w-full overflow-hidden bg-[#1A1A1C]"
      >
        <video
          ref={videoRef}
          src={video.url}
          preload="metadata"
          playsInline
          data-testid="label-video"
          data-film-seeking={settling.seeking ? "true" : undefined}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
            settling.seeking ? "opacity-60" : "opacity-100",
          )}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={settle}
          onLoadedData={() => {
            settling.onLoadedData();
            checkReady();
          }}
          onCanPlay={() => setReady(true)}
          onPlaying={() => setReady(true)}
          onDurationChange={(e) => {
            setDuration(e.currentTarget.duration || 0);
            syncClock();
          }}
          onTimeUpdate={(e) => onPlayhead(e.currentTarget.currentTime)}
          onSeeking={settling.onSeeking}
          onSeeked={(e) => {
            settling.onSeeked();
            checkReady();
            onPlayhead(e.currentTarget.currentTime);
          }}
          onError={() => setFailed(true)}
        >
          Your browser cannot play this video.
        </video>

        {/* Over the element and `pointer-events-none`: a click still
            reaches the element, so a slow load never traps one. */}
        {!ready && (
          <div
            data-label-video-pending=""
            className={cn(
              "pointer-events-none absolute inset-0",
              square && "[&_*]:rounded-none",
            )}
          >
            <FilmFramePending overlay />
          </div>
        )}

        {!playing && ready && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play"
            className="absolute inset-0 flex cursor-pointer items-center justify-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)] bg-white/[0.14]">
              <Play
                className="ml-0.5 h-[15px] w-[15px] fill-white text-white"
                strokeWidth={0}
                aria-hidden="true"
              />
            </span>
          </button>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] bg-[linear-gradient(180deg,rgba(13,13,13,0)_0%,rgba(13,13,13,0.78)_70%,rgba(13,13,13,0.88)_100%)]"
        />

        <FilmTransport
          className="gap-[7px] px-4 pb-1.5"
          hide={HIDDEN}
          disabled={!ready}
          title={readout.title}
          subtitle={readout.subtitle}
          position={readout.position}
          segments={segments}
          duration={duration}
          currentTime={currentTime}
          playing={playing}
          muted={muted}
          rate={rate}
          looping={looping}
          skippingDeadTime={skipDead}
          saved={null}
          canStep={stops.length > 0}
          courtOn={false}
          previewSource={{ url: video.url, generation: 0 }}
          onSeek={seek}
          onTogglePlay={togglePlay}
          onStep={step}
          onToggleSaved={noop}
          onToggleSkipDeadTime={toggleSkipDeadTime}
          onCycleRate={cycleRate}
          onToggleLoop={toggleLoop}
          onToggleMute={toggleMute}
          onToggleCourt={noop}
          onExit={noop}
        />
      </div>
    </TooltipProvider>
  );
});
