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
import type { ShotLoopWindow } from "./label-shot-loop";

/**
 * The console's video: the labelled job's own file, with the match Video
 * tab's fullscreen transport (`FilmTransport` — title, "Point N / total", the
 * set-by-set track, then the control row) riding over the film's foot.
 *
 * It owns its `<video>` rather than mounting the tab's `FilmPlayer`: that
 * player draws a control bar of its own and keeps rate, loop, sound and skip
 * dead time to itself, so the transport would have had nothing to read. The
 * playback rules are the tab's, from the same `film-timeline.ts` functions:
 *
 * - **The credential.** The signed URL `getLabelSession`'s `loadJobVideo`
 *   mints — the Advantage Intelligence lineage's contract: no refresh hook,
 *   and a media error raises "The film stopped loading · Reload", which is the
 *   right repair here too, since the page signs a fresh URL per render.
 *   `preload="metadata"`, for the tab's reason: these are multi-gigabyte
 *   files, and bytes should move when somebody presses play.
 * - **The stops.** The label points, on the console's playing rule
 *   (`label-film-stops.ts`), so Previous/Next point, Loop and Skip dead time
 *   walk exactly the spans the table lights up.
 * - **What the bar leaves off** ({@link HIDDEN}): no bookmarks here, the
 *   court is a card of its own, the dock's bar minimises, and "More" is inert.
 *   No scoreboard either — the table already shows the score.
 *
 * ── Loading ─────────────────────────────────────────────────────────────────
 * Until the element can play (`canplay`, or `readyState` ≥ 3) the frame shows
 * `FilmFramePending` over the element and the transport is `inert`. The frame
 * itself stays clickable and Space still reaches the handle, so a browser that
 * holds at metadata until asked to play can always be asked.
 *
 * ── Two clocks ──────────────────────────────────────────────────────────────
 * The element speaks FILE seconds; a label's `videoTime` is on the ANALYSIS
 * clock. `startTimeSeconds` is subtracted on the way in (`seekTo`) and added
 * back on the way out (`onTime`), here and nowhere else in the console.
 *
 * ── The clock, as CSS ───────────────────────────────────────────────────────
 * `useFilmClockVars` writes `--film-t` / `--film-d` (FILE seconds) onto the
 * frame every animation frame, for the transport's track. `clockTargetRef`
 * names a second element to write them onto — the console's root, so the
 * table's playing row can draw its progress rule from the same clock without
 * a render (`label-point-row.tsx`).
 *
 * ── The shot loop ───────────────────────────────────────────────────────────
 * `loopShot` is the table's shot click: one stroke's window (FILE seconds,
 * from `label-shot-loop.ts`), played round and round. It is a second window
 * beside the transport's Loop, and it outranks it — while it is held the
 * point loop and Skip dead time stand down, so nothing else moves the
 * playhead out from under it. It is held in a ref and shown nowhere: the
 * Loop button, `looping` and the `L` key still mean "loop the point".
 *
 * Anything that is the labeller asking to be somewhere else lets go of it:
 * play/pause (Space, the frame, the transport), a seek on the track, the
 * Previous/Next point glyphs and ← / →, and a point-row seek (`seekTo`).
 * Only the loop's own return to `start` keeps it, which is why that goes
 * through `moveTo` and everything else through `seek`.
 */
export interface LabelVideoHandle {
  /** Seek to a label's `videoTime` (analysis clock), converted to this file. */
  seekTo: (videoTime: number) => void;
  /** Seek to a second of the FILE — what the transport's track speaks. */
  seek: (seconds: number) => void;
  togglePlay: () => void;
  /** The previous (-1) or next (1) point, as the transport's glyphs step. */
  step: (direction: -1 | 1) => void;
  cycleRate: () => void;
  toggleLoop: () => void;
  toggleMute: () => void;
  toggleSkipDeadTime: () => void;
  /**
   * Replay one shot until told otherwise: seek to the window's `start`, play,
   * and return to `start` each time the playhead reaches `end` (FILE
   * seconds). `null` lets go of the window and leaves the playhead alone.
   */
  loopShot: (window: ShotLoopWindow | null) => void;
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
    /** The transport's title row. */
    readout?: LabelVideoReadout;
    /**
     * Where the file is, on the analysis clock (the offset added back), on
     * every `timeupdate` and `seeked` — the console's playing highlight. The
     * console decides what, if anything, to re-render.
     */
    onTime?: (videoTime: number) => void;
    /** Play and pause as the element reports them — the minimised pill's glyph. */
    onPlayingChange?: (playing: boolean) => void;
    /** Playable on first render — for specs. A real element starts pending. */
    initialReady?: boolean;
    /**
     * A second element to carry `--film-t` / `--film-d`, beside the frame —
     * an ancestor of whatever else draws from the film's clock.
     */
    clockTargetRef?: RefObject<HTMLElement | null>;
  }
>(function LabelVideoPlayer(
  {
    video,
    points,
    readout = NO_READOUT,
    onTime,
    onPlayingChange,
    initialReady = false,
    clockTargetRef,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** The point the film was last inside, for Loop (see `film-player.tsx`). */
  const loopStopRef = useRef<LabelFilmStop | null>(null);
  /** The shot being replayed (`loopShot`), in FILE seconds; null when none. */
  const shotLoopRef = useRef<ShotLoopWindow | null>(null);

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

  /** Move the playhead. The loops' own returns use this; people use `seek`. */
  const moveTo = useCallback(
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

  /** A seek somebody asked for: it also lets go of the shot being replayed. */
  const seek = useCallback(
    (seconds: number) => {
      shotLoopRef.current = null;
      moveTo(seconds);
    },
    [moveTo],
  );

  const togglePlay = useCallback(() => {
    // Space, the frame and the transport's glyph all end a shot loop: paused,
    // the film rests where it is; resumed, it plays on past the shot.
    shotLoopRef.current = null;
    const el = videoRef.current;
    if (!el) return;
    // A refused `play()` is autoplay policy or a load the next seek
    // interrupted — never a broken file — so nothing is raised for it.
    if (el.paused) void el.play().catch(noop);
    else el.pause();
  }, []);

  const step = useCallback(
    (direction: -1 | 1) => {
      shotLoopRef.current = null;
      const now = videoRef.current?.currentTime ?? 0;
      const stop =
        direction === 1 ? nextStop(stops, now) : prevStop(stops, now);
      if (stop) seek(stop.start);
    },
    [stops, seek],
  );

  const loopShot = useCallback(
    (window: ShotLoopWindow | null) => {
      const el = videoRef.current;
      if (!window || !el) {
        shotLoopRef.current = null;
        return;
      }
      // An `end` past the film's own would never be reached: the element
      // would stop on its last frame instead of coming back round.
      const end =
        Number.isFinite(el.duration) && el.duration > 0
          ? Math.min(window.end, el.duration)
          : window.end;
      shotLoopRef.current = { start: window.start, end };
      moveTo(window.start);
      if (el.paused) void el.play().catch(noop);
    },
    [moveTo],
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
      // The shot loop first, and alone: while a shot is held neither the
      // point loop nor Skip dead time may move the playhead. The return's own
      // `seeked` reports `start`, which is short of `end` by at least the
      // window's floor (`SHOT_LOOP_MIN_SECONDS`), so it cannot re-trigger.
      const shot = shotLoopRef.current;
      if (shot) {
        if (t >= shot.end - REACHED_EPSILON_SECONDS) moveTo(shot.start);
        return;
      }
      const previous = loopStopRef.current;
      if (
        looping &&
        previous &&
        t >= previous.end - REACHED_EPSILON_SECONDS &&
        t < previous.end + 1
      ) {
        moveTo(previous.start);
        return;
      }
      loopStopRef.current = activeStopAt(stops, t)?.stop ?? null;
      if (skipDead) {
        const jump = deadTimeJump(stops, t);
        if (jump !== null) moveTo(jump);
      }
    },
    [stops, looping, skipDead, moveTo, pushTime],
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
      if (
        target?.closest?.(
          "input, select, textarea, button, a, [role='button'], [role='menu'], [role='dialog'], [role='alertdialog'], [contenteditable='true']",
        )
      ) {
        return;
      }
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
      seek,
      togglePlay,
      step,
      cycleRate,
      toggleLoop,
      toggleMute,
      toggleSkipDeadTime,
      loopShot,
    }),
    [
      offset,
      seek,
      togglePlay,
      step,
      cycleRate,
      toggleLoop,
      toggleMute,
      toggleSkipDeadTime,
      loopShot,
    ],
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
          onPlay={() => {
            setPlaying(true);
            onPlayingChange?.(true);
          }}
          onPause={() => {
            setPlaying(false);
            onPlayingChange?.(false);
          }}
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

        {/* Over the element, never instead of it, and `pointer-events-none`:
            a click still reaches the element, so a slow load never traps one. */}
        {!ready && (
          <div
            data-label-video-pending=""
            className="pointer-events-none absolute inset-0"
          >
            <FilmFramePending overlay />
          </div>
        )}

        {/* The centre play affordance — only while paused and playable. */}
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

        {/* The room's scrim, at dock scale: the transport has no ground of
            its own. */}
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
