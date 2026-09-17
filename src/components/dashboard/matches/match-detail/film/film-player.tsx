"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  Maximize,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Timer,
  TimerOff,
  Volume2,
  VolumeOff,
} from "lucide-react";

import type { MatchVideo } from "@/lib/data/match-video-server";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { advButton } from "@/lib/ui/adv-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";

import { useFilmClockVars } from "./film-clock";
import { RepeatOff } from "./film-glyphs";
import type { Rect } from "./film-motion";
import { FilmTrack } from "./film-track";
import {
  REACHED_EPSILON_SECONDS,
  activeStopAt,
  breakSegments,
  deadTimeJump,
  nextStop,
  prevStop,
  type FilmStop,
} from "./film-timeline";
import { PLAYBACK_RATES } from "./film-transport";

/**
 * The match video with the room's transport under it, in the tab.
 *
 * The control bar is the fullscreen room's (`film-transport.tsx`) minus what
 * only makes sense over a screenful — the title, the point position, exit:
 * the break-of-serve track, then the control row — play, previous and next
 * point, the clock — and on the right Save point (filled once saved), skip
 * dead time, speed, loop, sound and fullscreen, in the room's order. The
 * same glyphs at the tab's scale: 13px on a 32px row 14px apart, where the
 * room draws 15px on 40px 18px apart — a 353px frame has no room for the
 * room's bar. Every glyph is Lucide at 1.6, and every toggle reads its state the same
 * way — the plain glyph when on, Lucide's slashed variant when off
 * (`TimerOff`, `VolumeOff`, and `RepeatOff` in `film-glyphs.tsx` for the one
 * the library lacks). Save fills once the point is saved; nothing else is filled.
 *
 * ── Called the match video, deliberately ────────────────────────────────────
 * The file is the athlete's own upload, cut to the window they selected (or,
 * on older matches, the vendor's re-encode of that window) — no dead time
 * removed, no annotations, no rally-only cut (`ui-revamp-guardrails.md` §1).
 * So no string in this subtree calls it a highlight or a condensed match.
 *
 * ── `preload="metadata"` ────────────────────────────────────────────────────
 * Not `auto`. These are multi-gigabyte files streamed from Azure at roughly
 * $0.087/GB, and `auto` starts paying that for everyone who opens the tab and
 * scrolls past. Metadata is enough for the duration and the scrubber; bytes
 * move when somebody presses play.
 *
 * ── The SAS expires ─────────────────────────────────────────────────────────
 * `getMatchVideo()` mints a short-lived playback SAS on the server. Leave a
 * match page open past it and the next range request 403s, which the element
 * surfaces as a media error. There is nothing a client can do to re-sign, so
 * the error state offers the one action that works: reload, which runs
 * `getMatchVideo()` again.
 *
 * ── Loop and skip dead time ─────────────────────────────────────────────────
 * Both walk `allStops` — every timed point, not the cut — exactly as the room
 * does: the playhead is inside some point whether or not the filter admits
 * it. Loop remembers the point the film was last inside rather than asking
 * `activeStopAt` at the end of a window, for the reason the room's note gives:
 * a window clamped to the next one's start hands over just before its own
 * end, so "past the end of the active point" would never be true.
 */

export interface FilmPlayerHandle {
  /** Jump playback to an absolute second inside the file. */
  seekTo: (seconds: number) => void;
  /** Move the playhead by `delta` seconds, either way. */
  seekBy: (delta: number) => void;
  togglePlay: () => void;
  /** Jump to the previous (-1) or next (1) point in the applied cut. */
  step: (direction: -1 | 1) => void;
  pause: () => void;
  /** Where the player is right now — what the fullscreen room opens from. */
  snapshot: () => { time: number; playing: boolean };
  /** The frame's box on screen, for the room's grow and shrink. */
  frameRect: () => Rect | null;
}

interface FilmPlayerProps {
  video: MatchVideo;
  /**
   * The stops the prev/next buttons step through — the currently applied cut
   * on the film clock, so the buttons walk what the list is showing.
   */
  stops: FilmStop[];
  /** Every timed point, for the break-of-serve track, loop and dead time. */
  allStops: FilmStop[];
  /** Whether the playing point is bookmarked; null when no point is playing. */
  saved: boolean | null;
  /** Fires on `timeupdate`/`seeked`; drives the point list's playing row. */
  onTimeChange: (seconds: number) => void;
  /** Bookmark or un-bookmark the playing point. */
  onToggleSaved: () => void;
  /** The fullscreen glyph. Entered by user action only, never automatically. */
  onEnterFullscreen: () => void;
  /**
   * Where `--film-t` is written, so the point list beside the player can read
   * it too. Defaults to the frame.
   */
  clockTargetRef?: React.RefObject<HTMLElement | null>;
}

const GLYPH =
  "block h-[13px] w-[13px] cursor-pointer rounded-[2px] text-white/85 transition-opacity duration-200 hover:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:opacity-35";

/**
 * An icon-only control: `aria-label` plus the design system's dark tooltip
 * (`ChromeTooltip`, the one every icon-only control in the shell answers
 * hover with), always — with the key that does the same thing where there
 * is one.
 */
function Glyph({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ChromeTooltip label={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(GLYPH, pressed && "text-white")}
      >
        {children}
      </button>
    </ChromeTooltip>
  );
}

const ICON = { className: "h-full w-full", strokeWidth: 1.6 } as const;

export const FilmPlayer = forwardRef<FilmPlayerHandle, FilmPlayerProps>(
  function FilmPlayer(
    {
      video,
      stops,
      allStops,
      saved,
      onTimeChange,
      onToggleSaved,
      onEnterFullscreen,
      clockTargetRef,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);

    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [rate, setRate] = useState<number>(1);
    const [looping, setLooping] = useState(false);
    const [skipDead, setSkipDead] = useState(false);
    const [failed, setFailed] = useState(false);

    const syncClock = useFilmClockVars(
      videoRef,
      clockTargetRef ?? frameRef,
      playing,
    );

    const segments = useMemo(
      () => breakSegments(allStops, duration),
      [allStops, duration],
    );

    const seekTo = useCallback(
      (seconds: number) => {
        const el = videoRef.current;
        if (!el) return;
        const max =
          Number.isFinite(el.duration) && el.duration > 0
            ? el.duration
            : undefined;
        const target = Math.max(0, max ? Math.min(seconds, max) : seconds);
        el.currentTime = target;
        setCurrentTime(target);
        onTimeChange(target);
        syncClock();
      },
      [onTimeChange, syncClock],
    );

    const togglePlay = useCallback(() => {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) {
        void el.play().catch(() => setFailed(true));
      } else {
        el.pause();
      }
    }, []);

    const step = useCallback(
      (direction: -1 | 1) => {
        const now = videoRef.current?.currentTime ?? 0;
        const stop =
          direction === 1 ? nextStop(stops, now) : prevStop(stops, now);
        if (stop) seekTo(stop.start);
      },
      [stops, seekTo],
    );

    useImperativeHandle(
      ref,
      () => ({
        seekTo,
        seekBy: (delta) => seekTo((videoRef.current?.currentTime ?? 0) + delta),
        togglePlay,
        step,
        pause: () => videoRef.current?.pause(),
        snapshot: () => {
          const el = videoRef.current;
          return {
            time: el?.currentTime ?? 0,
            playing: el ? !el.paused : false,
          };
        },
        frameRect: () => {
          const r = frameRef.current?.getBoundingClientRect();
          return r
            ? { left: r.left, top: r.top, width: r.width, height: r.height }
            : null;
        },
      }),
      [seekTo, togglePlay, step],
    );

    const toggleMute = useCallback(() => {
      const el = videoRef.current;
      if (!el) return;
      el.muted = !el.muted;
      setMuted(el.muted);
    }, []);

    const cycleRate = useCallback(() => {
      const el = videoRef.current;
      const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
      const next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
      if (el) el.playbackRate = next;
      setRate(next);
    }, [rate]);

    // The point the film was last inside, for Loop (see the file note).
    const loopStopRef = useRef<FilmStop | null>(null);

    const onTime = useCallback(
      (t: number) => {
        setCurrentTime(t);
        onTimeChange(t);
        syncClock();
        const now = activeStopAt(allStops, t);
        const previous = loopStopRef.current;
        if (
          looping &&
          previous &&
          t >= previous.end - REACHED_EPSILON_SECONDS &&
          t < previous.end + 1
        ) {
          seekTo(previous.start);
          return;
        }
        loopStopRef.current = now?.stop ?? null;
        if (skipDead) {
          const jump = deadTimeJump(allStops, t);
          if (jump !== null) seekTo(jump);
        }
      },
      [allStops, looping, skipDead, seekTo, onTimeChange, syncClock],
    );

    // A rate chosen before the element existed still applies once it does.
    useEffect(() => {
      const el = videoRef.current;
      if (el) el.playbackRate = rate;
    }, [rate]);

    if (failed) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-16 text-center">
          <span className="text-title" style={{ fontSize: "16px" }}>
            The film stopped loading
          </span>
          <span
            className="text-body-sm max-w-[380px]"
            style={{ color: "var(--ink-600)" }}
          >
            Playback links are signed for a short window and this one has run
            out. Reloading the page signs a fresh one.
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
          className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-[#1A1A1C]"
        >
          <video
            ref={videoRef}
            src={video.url}
            preload="metadata"
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              e.currentTarget.playbackRate = rate;
              syncClock();
            }}
            onDurationChange={(e) => {
              setDuration(e.currentTarget.duration || 0);
              syncClock();
            }}
            onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
            onSeeked={(e) => onTime(e.currentTarget.currentTime)}
            onError={() => setFailed(true)}
          >
            Your browser cannot play this video.
          </video>

          {/* The centre play affordance — only while paused, so it never
              sits on top of live play. */}
          {!playing && (
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

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end gap-1.5 bg-[linear-gradient(to_top,rgba(13,13,13,0.68)_0%,rgba(13,13,13,0)_100%)] px-4 pt-7 pb-2">
            <FilmTrack
              className="pointer-events-auto"
              segments={segments}
              duration={duration}
              currentTime={currentTime}
              onSeek={seekTo}
            />

            <div className="pointer-events-auto flex h-8 items-center gap-3.5">
              <Glyph
                label={playing ? "Pause" : "Play"}
                shortcut="space"
                onClick={togglePlay}
              >
                {playing ? (
                  <Pause {...ICON} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play {...ICON} fill="currentColor" aria-hidden="true" />
                )}
              </Glyph>
              <Glyph
                label="Previous point"
                shortcut="←"
                disabled={stops.length === 0}
                onClick={() => step(-1)}
              >
                <SkipBack {...ICON} fill="currentColor" aria-hidden="true" />
              </Glyph>
              <Glyph
                label="Next point"
                shortcut="→"
                disabled={stops.length === 0}
                onClick={() => step(1)}
              >
                <SkipForward {...ICON} fill="currentColor" aria-hidden="true" />
              </Glyph>
              <span className="mono tabular text-[10px] text-white/75">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>

              <div className="flex-1" />

              <Glyph
                label={saved ? "Saved — remove bookmark" : "Save point"}
                shortcut="S"
                pressed={saved === true}
                disabled={saved === null}
                onClick={onToggleSaved}
              >
                <Bookmark
                  {...ICON}
                  aria-hidden="true"
                  fill={saved ? "currentColor" : "none"}
                />
              </Glyph>

              <Glyph
                label={
                  skipDead ? "Skip dead time — on" : "Skip dead time — off"
                }
                pressed={skipDead}
                onClick={() => setSkipDead((v) => !v)}
              >
                {skipDead ? (
                  <Timer {...ICON} aria-hidden="true" />
                ) : (
                  <TimerOff {...ICON} aria-hidden="true" />
                )}
              </Glyph>

              <ChromeTooltip label="Playback speed" side="top">
                <button
                  type="button"
                  aria-label={`Playback speed, ${rate}×`}
                  onClick={cycleRate}
                  className="mono cursor-pointer rounded-[2px] text-[10px] font-medium text-white/85 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  {rate}×
                </button>
              </ChromeTooltip>

              <Glyph
                label={
                  looping ? "Loop this point — on" : "Loop this point — off"
                }
                pressed={looping}
                onClick={() => setLooping((v) => !v)}
              >
                {looping ? (
                  <Repeat {...ICON} aria-hidden="true" />
                ) : (
                  <RepeatOff {...ICON} aria-hidden="true" />
                )}
              </Glyph>

              <Glyph
                label={muted ? "Sound — off" : "Sound — on"}
                pressed={!muted}
                onClick={toggleMute}
              >
                {muted ? (
                  <VolumeOff {...ICON} aria-hidden="true" />
                ) : (
                  <Volume2 {...ICON} aria-hidden="true" />
                )}
              </Glyph>

              <Glyph
                label="Open the film room fullscreen"
                onClick={onEnterFullscreen}
              >
                <Maximize {...ICON} aria-hidden="true" />
              </Glyph>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  },
);
