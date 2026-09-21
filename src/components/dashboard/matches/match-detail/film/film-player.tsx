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

import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { advButton } from "@/lib/ui/adv-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";

import { useFilmClockVars } from "./film-clock";
import { RepeatOff } from "./film-glyphs";
import type { Rect } from "./film-motion";
import { FILM_REFUSAL_COPY } from "./film-refusal-copy";
import { FilmTrack } from "./film-track";
import {
  REACHED_EPSILON_SECONDS,
  activeStopAt,
  setSegments,
  deadTimeJump,
  nextStop,
  prevStop,
  type FilmStop,
} from "./film-timeline";
import { PLAYBACK_RATES } from "./film-transport";
import type {
  AttachmentPlaybackProblem,
  AttachmentResumeIntent,
} from "./use-attachment-playback";

/**
 * The match video with the room's transport under it, in the tab.
 *
 * The control bar is the fullscreen room's (`film-transport.tsx`) minus what
 * only makes sense over a screenful — the title, the point position, exit:
 * the set-by-set track, then the control row — play, previous and next
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
 * ── The SAS expires, and only one lineage can do anything about it ──────────
 * `getMatchVideo()` mints a short-lived playback SAS on the server. Leave a
 * match page open past it and the next range request 403s, which the element
 * surfaces as a media error.
 *
 * For an ATTACHMENT that is now recoverable without losing the page:
 * `useAttachmentPlayback` (T25) holds the credential, refreshes it before
 * expiry and hands back a {@link AttachmentResumeIntent} saying where to land.
 * This component is the element half of that — it swaps `src`, lands, and
 * renders the hook's terminal {@link AttachmentPlaybackProblem} when there is
 * one. It decides nothing: no timer, no request and no retry budget lives here.
 *
 * For the **Advantage Intelligence lineage** nothing changed. That path has no
 * refresh endpoint (see the hook's docstring for why pointing it at one would
 * blank a film that plays perfectly well), so it still arrives as
 * `passthrough`, still surfaces a media error as `failed`, and still offers
 * the one action that works there: reload, which runs `getMatchVideo()` again.
 * That panel below is not dead code — it is the whole error story for every
 * match the video pipeline produced.
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
  /**
   * The credential to play — `AttachmentPlaybackApi.url`, not
   * `MatchVideo.url`, so a refreshed credential reaches the element without
   * the page reloading. `null` only once a problem is terminal, where the
   * panel renders instead of an element.
   */
  url: string | null;
  /**
   * The hook's reload key. It keys the `<video>`, so every installed
   * credential gets a fresh element rather than a mutated `src` — a swap
   * mid-stream otherwise leaves the old buffer's frames on screen.
   */
  generation: number;
  /**
   * Where to land after a swap, once the hook has resolved it. Applied when
   * the new element has metadata, whichever of the two arrives last.
   */
  resume: AttachmentResumeIntent | null;
  /** The hook's terminal state. Non-null means playback has stopped for good. */
  problem: AttachmentPlaybackProblem | null;
  /**
   * The Advantage Intelligence lineage, where none of the above applies and
   * the reload panel is still the error story.
   */
  passthrough: boolean;
  /**
   * The fullscreen room is mounted over this player.
   *
   * It keeps its playhead through a refresh but never takes the play intent —
   * two elements playing one match is two soundtracks — and stops reporting to
   * the hook, because while the room is up the room is what the viewer is
   * watching and its playhead is the one an alignment must be anchored to.
   */
  background: boolean;
  /**
   * The stops the prev/next buttons step through — the currently applied cut
   * on the film clock, so the buttons walk what the list is showing.
   */
  stops: FilmStop[];
  /** Every timed point, for the set-by-set track, loop and dead time. */
  allStops: FilmStop[];
  /** Whether the playing point is bookmarked; null when no point is playing. */
  saved: boolean | null;
  /** Fires on `timeupdate`/`seeked`; drives the point list's playing row. */
  onTimeChange: (seconds: number) => void;
  /** The playhead, for the hook's anchor. Suppressed while `background`. */
  onPlaybackTime: (seconds: number) => void;
  /** The play/pause intent, for the hook's resume. Suppressed while `background`. */
  onPlaybackPlaying: (playing: boolean) => void;
  /** The element could not fetch bytes. The hook decides what that means. */
  onLoadFailure: () => void;
  /** A rejected `play()` — autoplay policy, never an expired credential. */
  onPlayRejected: () => void;
  /** The terminal state's button, where the hook says one could help. */
  onRetry: () => void;
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

/**
 * A heading per terminal reason. The hook owns the sentence; the title is a
 * player's job, and "The film stopped loading" is not what a viewer who has
 * lost access needs to read.
 */
const PROBLEM_TITLES: Record<AttachmentPlaybackProblem["reason"], string> = {
  removed: "This video is no longer attached",
  denied: "You can no longer watch this video",
  unreachable: "The video could not be reached",
  unplayable: FILM_REFUSAL_COPY.loadFailure.heading,
};

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
      url,
      generation,
      resume,
      problem,
      passthrough,
      background,
      stops,
      allStops,
      saved,
      onTimeChange,
      onPlaybackTime,
      onPlaybackPlaying,
      onLoadFailure,
      onPlayRejected,
      onRetry,
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

    /**
     * Where a fresh element has to come back to: the last playhead and intent
     * this surface saw, overwritten by the hook's `resume` when the stops moved
     * under it. Kept in a ref rather than state because it is read from a media
     * event handler that must not wait for a render.
     */
    const landingRef = useRef({ time: 0, playing: false });
    /** Whether THIS element has metadata — reset by every generation. */
    const readyRef = useRef(false);
    /** The generation whose resume intent has already been taken. */
    const appliedRef = useRef(-1);
    /** The point the film was last inside, for Loop (see the file note). */
    const loopStopRef = useRef<FilmStop | null>(null);

    /** One place that moves the playhead everywhere it is read. */
    const pushTime = useCallback(
      (seconds: number) => {
        landingRef.current.time = seconds;
        setCurrentTime(seconds);
        onTimeChange(seconds);
        if (!background) onPlaybackTime(seconds);
        syncClock();
      },
      [background, onPlaybackTime, onTimeChange, syncClock],
    );

    const segments = useMemo(
      () => setSegments(allStops, duration),
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
        // Loop follows the viewer. Every seek is someone asking to be
        // somewhere — a point row, a shot row, the track, a step, an arrow —
        // so the loop's idea of "the point we are repeating" moves with them.
        //
        // Without this the ref still names the PREVIOUS point when the
        // `seeked` event reaches `onTime`, and a landing inside that point's
        // end window reads as "the loop came round" rather than "the viewer
        // jumped". The seek is then undone and they are thrown back, which for
        // two points a second apart makes the next row unreachable while Loop
        // is on. Looping itself still works: it seeks to the same point's
        // start, so this rewrites the ref with the point it already held.
        loopStopRef.current = activeStopAt(allStops, target)?.stop ?? null;
        pushTime(target);
      },
      [allStops, pushTime],
    );

    /**
     * Put the new element where the old one was.
     *
     * Called from both ends of the race — the element gaining metadata and the
     * resume intent arriving — because either can be last, and a swap that
     * lands nowhere is a viewer thrown back to the first frame.
     */
    const land = useCallback(() => {
      const el = videoRef.current;
      if (!el || !readyRef.current) return;
      const { time, playing: wasPlaying } = landingRef.current;
      const max =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : undefined;
      const target = Math.max(0, max ? Math.min(time, max) : time);
      // A seek to where the element already is — within a hundredth of a
      // second — is skipped, because `settle()` can run more than once for one
      // element and re-seeking a playing one stutters it for nothing. The
      // threshold stays far below the smallest real correction: an alignment
      // that moved by less than a frame is not one anybody asked for.
      if (Math.abs(el.currentTime - target) > 0.01) {
        el.currentTime = target;
        pushTime(target);
      }
      if (wasPlaying && !background && el.paused) {
        void el.play().catch(() => {
          setPlaying(false);
          onPlayRejected();
        });
      }
    }, [background, onPlayRejected, pushTime]);

    /** Metadata is in: take the duration and put the playhead back. */
    const settle = useCallback(() => {
      const el = videoRef.current;
      if (!el) return;
      setDuration(el.duration || 0);
      readyRef.current = true;
      // Generation zero is the server's own render: the element is already
      // where it should be, and seeking it would move a viewer who has not
      // asked for anything.
      if (generation > 0) land();
      // Paint the first frame. With `preload="metadata"` the element knows its
      // size but has decoded nothing, so the frame sits black until something
      // seeks it; a hair past zero makes the browser fetch and draw one frame
      // (the wizard's trim step does the same). Only at zero — a landing or a
      // deep-linked seek has already put a frame on screen.
      else if (el.currentTime === 0) el.currentTime = 0.001;
      syncClock();
    }, [generation, land, syncClock]);

    /**
     * Metadata, however it arrives.
     *
     * A new credential is a new element (`key={generation}`), so nothing is
     * loaded yet — usually. A swap onto a URL the browser still has buffered
     * can reach `readyState 1` before React has mounted the subtree, and then
     * the `loadedmetadata` the prop is waiting for has already happened; the
     * element would sit on frame one holding the viewer's place in a variable
     * nothing ever read. Asking the element is the reading that is true either
     * way. `playing` is deliberately NOT reset here: a silent refresh should be
     * invisible, and flashing the centre play glyph for the length of a
     * metadata fetch is the opposite of that.
     */
    useEffect(() => {
      const el = videoRef.current;
      if (!el) return;
      if (el.readyState >= 1) {
        settle();
        return;
      }
      readyRef.current = false;
      const onReady = () => settle();
      el.addEventListener("loadedmetadata", onReady);
      return () => el.removeEventListener("loadedmetadata", onReady);
    }, [generation, settle]);

    // Note 1 of T25's handoff: the intent has to be consumed, and the parent
    // is what consumes it — in its own effect, which React runs after this
    // one, so the copy below is already taken by then. What arrives here is a
    // plain value tied to one generation, and the guard
    // below is about a re-render, not about the hook re-offering it.
    useEffect(() => {
      if (!resume || appliedRef.current === generation) return;
      appliedRef.current = generation;
      landingRef.current = { time: resume.filmTime, playing: resume.playing };
      land();
    }, [resume, generation, land]);

    const togglePlay = useCallback(() => {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) {
        // A rejected promise here is autoplay policy or a load interrupted by
        // the next seek — never evidence that the file or its credential is
        // broken, which is why it goes to `onPlayRejected` and not to the
        // error panel. The fullscreen room has always swallowed it; this
        // surface used to raise "The film stopped loading" over a click the
        // browser simply declined.
        void el.play().catch(() => onPlayRejected());
      } else {
        el.pause();
      }
    }, [onPlayRejected]);

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

    /**
     * A playhead report, plus what Loop and Skip dead time do with it.
     *
     * The write itself goes through `pushTime`, never around it: that is also
     * where the landing ref and the hook's anchor are kept, and a playhead this
     * surface recorded without telling them is a swap that lands in the wrong
     * place — or an alignment anchored to a time nobody was watching.
     */
    const onTime = useCallback(
      (t: number) => {
        pushTime(t);
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
      [allStops, looping, skipDead, seekTo, pushTime],
    );

    // Element state React does not carry, restored in ONE place.
    //
    // `playbackRate` and `muted` are set imperatively on the element, and a
    // refreshed credential is a NEW element (`key={generation}`) that starts
    // at 1× and unmuted. Both are therefore silently lost on a swap the viewer
    // never asked for: half speed becomes full speed, and a muted film becomes
    // audible while the glyph still reads muted.
    //
    // Keyed on `generation` as well as the values, so this is also the "a rate
    // or mute chosen before the element existed" path. Anything else set
    // imperatively belongs here too rather than in an effect of its own — an
    // effect per property is how one of them gets forgotten.
    useEffect(() => {
      const el = videoRef.current;
      if (!el) return;
      el.playbackRate = rate;
      el.muted = muted;
    }, [rate, muted, generation]);

    // The hook's terminal state. It outranks the reload panel because it knows
    // something the panel is guessing at: whether the credential is even the
    // problem, and whether asking again could change the answer.
    if (problem) {
      return (
        <div
          role="alert"
          data-testid="film-playback-problem"
          data-film-problem={problem.reason}
          className="flex flex-col items-center justify-center gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-16 text-center"
        >
          <span className="text-title" style={{ fontSize: "16px" }}>
            {PROBLEM_TITLES[problem.reason]}
          </span>
          <span
            className="text-body-sm max-w-[380px] [text-wrap:pretty]"
            style={{ color: "var(--ink-600)" }}
          >
            {problem.reason === "unplayable"
              ? FILM_REFUSAL_COPY.loadFailure.body
              : problem.message}
          </span>
          {problem.canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={advButton("primary", "md")}
            >
              {FILM_REFUSAL_COPY.buttons.retry}
            </button>
          )}
        </div>
      );
    }

    // The Advantage Intelligence lineage's whole error story, unchanged: no
    // endpoint re-signs that URL, so reloading the page is the only repair.
    if (failed) {
      return (
        <div
          role="alert"
          data-testid="film-reload-panel"
          className="flex flex-col items-center justify-center gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-16 text-center"
        >
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
            // The reload key. A `src` swap on a live element can keep serving
            // the old buffer; a keyed remount cannot.
            key={generation}
            ref={videoRef}
            src={url ?? undefined}
            preload="metadata"
            playsInline
            data-testid="film-player-video"
            className="absolute inset-0 h-full w-full object-contain"
            onClick={togglePlay}
            onPlay={() => {
              setPlaying(true);
              landingRef.current.playing = true;
              if (!background) onPlaybackPlaying(true);
            }}
            onPause={() => {
              setPlaying(false);
              landingRef.current.playing = false;
              if (!background) onPlaybackPlaying(false);
            }}
            onLoadedMetadata={settle}
            onDurationChange={(e) => {
              setDuration(e.currentTarget.duration || 0);
              syncClock();
            }}
            onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
            onSeeked={(e) => onTime(e.currentTarget.currentTime)}
            onError={() => (passthrough ? setFailed(true) : onLoadFailure())}
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
