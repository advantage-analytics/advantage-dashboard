"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  shortMonthDate,
  formatClock,
} from "@/components/dashboard/matches/match-detail/format-clock";
import { advButton } from "@/lib/ui/adv-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useFilmClockVars } from "./film-clock";
import type { Rect } from "./film-motion";
import { nextStop, prevStop, type FilmStop } from "./film-timeline";
import type {
  AttachmentPlaybackProblem,
  AttachmentResumeIntent,
} from "./use-attachment-playback";

/**
 * The match video, with the 46c control bar over it (artboard lines 819–844).
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
 * ── Glyphs with nothing behind them ─────────────────────────────────────────
 * The artboard's bar carries three more controls (a timer, a loop, a kebab)
 * that no spec defines. They render — the bar is drawn 1:1 — but they are
 * inert and say so on hover, which is honest in a way that either guessing at
 * a behaviour or silently dropping them from the artboard is not.
 */

export interface FilmPlayerHandle {
  /** Jump playback to an absolute second inside the file. */
  seekTo: (seconds: number) => void;
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
  unplayable: "The film stopped loading",
};

const GLYPH =
  "block h-[15px] w-[15px] cursor-pointer text-white/85 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] rounded-[2px]";

/** An artboard glyph with no behaviour behind it yet — drawn, not wired. */
function InertGlyph({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `aria-disabled` rather than `disabled`: a disabled button swallows
            pointer events, and then the tooltip that explains why it does
            nothing never appears. */}
        <button
          type="button"
          aria-disabled="true"
          aria-label={`${label} — not available yet`}
          onClick={(e) => e.preventDefault()}
          className="block cursor-default rounded-[2px] opacity-45 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label} isn&rsquo;t wired up yet
      </TooltipContent>
    </Tooltip>
  );
}

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
      onTimeChange,
      onPlaybackTime,
      onPlaybackPlaying,
      onLoadFailure,
      onPlayRejected,
      onRetry,
      onEnterFullscreen,
      clockTargetRef,
    },
    ref,
  ) {
    const { match } = useMatchData();
    const videoRef = useRef<HTMLVideoElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);

    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [failed, setFailed] = useState(false);
    const [scrubbing, setScrubbing] = useState(false);

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
        pushTime(target);
      },
      [pushTime],
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

    useImperativeHandle(
      ref,
      () => ({
        seekTo,
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
      [seekTo],
    );

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

    const toggleMute = useCallback(() => {
      const el = videoRef.current;
      if (!el) return;
      el.muted = !el.muted;
      setMuted(el.muted);
    }, []);

    const seekFromPointer = useCallback(
      (clientX: number) => {
        const bar = barRef.current;
        const el = videoRef.current;
        if (!bar || !el) return;
        const rect = bar.getBoundingClientRect();
        if (rect.width === 0) return;
        const total = Number.isFinite(el.duration) ? el.duration : duration;
        if (!total) return;
        const fraction = Math.min(
          1,
          Math.max(0, (clientX - rect.left) / rect.width),
        );
        seekTo(fraction * total);
      },
      [duration, seekTo],
    );

    // Drag-to-scrub. The listeners live on the window so the pointer can leave
    // the 2px bar mid-drag without the scrub dying.
    useEffect(() => {
      if (!scrubbing) return;
      const move = (e: PointerEvent) => seekFromPointer(e.clientX);
      const up = () => setScrubbing(false);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      return () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
    }, [scrubbing, seekFromPointer]);

    const eventName = match.tournamentName?.trim() || null;

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
            {problem.message}
          </span>
          {problem.canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={advButton("primary", "md")}
            >
              Try again
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
            onTimeUpdate={(e) => pushTime(e.currentTarget.currentTime)}
            onSeeked={(e) => pushTime(e.currentTarget.currentTime)}
            onError={() => (passthrough ? setFailed(true) : onLoadFailure())}
          >
            Your browser cannot play this video.
          </video>

          {/* The artboard's centre play affordance — only while paused, so it
              never sits on top of live play. */}
          {!playing && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label="Play"
              className="absolute inset-0 flex cursor-pointer items-center justify-center"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-pill)] bg-white/[0.14]">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="block"
                >
                  <polygon points="7 4 20 12 7 20" fill="#FFFFFF" />
                </svg>
              </span>
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 flex-col justify-end bg-[linear-gradient(to_top,rgba(13,13,13,0.68)_0%,rgba(13,13,13,0)_100%)] px-5 pb-3">
            <div className="pointer-events-auto flex items-baseline gap-2">
              {eventName && (
                <span className="text-[11px] text-white/85">{eventName}</span>
              )}
              <span className="text-[10px] text-white/45">
                {shortMonthDate(match.date)}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-white/50">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>
            </div>

            <div
              ref={barRef}
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatClock(currentTime)} of ${formatClock(duration)}`}
              onPointerDown={(e) => {
                e.preventDefault();
                setScrubbing(true);
                seekFromPointer(e.clientX);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  seekTo(currentTime + 5);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  seekTo(currentTime - 5);
                }
              }}
              className="pointer-events-auto relative my-2 mb-2.5 h-0.5 cursor-pointer bg-white/[0.22] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <span
                className="absolute inset-y-0 left-0 bg-[var(--blue)]"
                style={{
                  width:
                    "clamp(0%, calc(var(--film-t, 0) / var(--film-d, 1) * 100%), 100%)",
                }}
              />
            </div>

            <div className="pointer-events-auto flex items-center gap-[18px]">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className={GLYPH}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="block h-full w-full"
                >
                  {playing ? (
                    <>
                      <rect
                        x="7"
                        y="4"
                        width="4"
                        height="16"
                        fill="currentColor"
                      />
                      <rect
                        x="14"
                        y="4"
                        width="4"
                        height="16"
                        fill="currentColor"
                      />
                    </>
                  ) : (
                    <polygon points="7 4 20 12 7 20" fill="currentColor" />
                  )}
                </svg>
              </button>

              <button
                type="button"
                onClick={() => step(-1)}
                disabled={stops.length === 0}
                aria-label="Previous point"
                className={cn(
                  GLYPH,
                  "disabled:cursor-default disabled:opacity-35",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="block h-full w-full"
                >
                  <polygon
                    points="18 5 8 12 18 19"
                    fill="currentColor"
                    stroke="none"
                  />
                  <line x1="5" y1="5" x2="5" y2="19" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => step(1)}
                disabled={stops.length === 0}
                aria-label="Next point"
                className={cn(
                  GLYPH,
                  "disabled:cursor-default disabled:opacity-35",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="block h-full w-full"
                >
                  <polygon
                    points="6 5 16 12 6 19"
                    fill="currentColor"
                    stroke="none"
                  />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </button>

              <div className="flex-1" />

              <InertGlyph label="Playback timer">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="block"
                >
                  <circle cx="12" cy="13" r="7" />
                  <line x1="12" y1="13" x2="12" y2="9" />
                  <line x1="12" y1="3" x2="12" y2="6" />
                </svg>
              </InertGlyph>

              <InertGlyph label="Loop">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="block"
                >
                  <polyline points="17 2 21 6 17 10" />
                  <path d="M3 12V9a3 3 0 0 1 3-3h15" />
                  <polyline points="7 22 3 18 7 14" />
                  <path d="M21 12v3a3 3 0 0 1-3 3H3" />
                </svg>
              </InertGlyph>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className={GLYPH}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="block h-full w-full"
                >
                  <polygon
                    points="3 9 7 9 12 5 12 19 7 15 3 15"
                    fill="currentColor"
                    stroke="none"
                  />
                  {muted ? (
                    <>
                      <line x1="16" y1="9" x2="22" y2="15" />
                      <line x1="22" y1="9" x2="16" y2="15" />
                    </>
                  ) : (
                    <>
                      <path d="M16 9a4 4 0 0 1 0 6" />
                      <path d="M19 6.5a8 8 0 0 1 0 11" />
                    </>
                  )}
                </svg>
              </button>

              <button
                type="button"
                onClick={onEnterFullscreen}
                aria-label="Open the film room fullscreen"
                className={GLYPH}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="block h-full w-full"
                >
                  <polyline points="4 9 4 4 9 4" />
                  <polyline points="20 9 20 4 15 4" />
                  <polyline points="4 15 4 20 9 20" />
                  <polyline points="20 15 20 20 15 20" />
                </svg>
              </button>

              <InertGlyph label="More playback options">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="block"
                >
                  <circle
                    cx="12"
                    cy="5"
                    r="1.4"
                    fill="rgba(255,255,255,0.85)"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="1.4"
                    fill="rgba(255,255,255,0.85)"
                  />
                  <circle
                    cx="12"
                    cy="19"
                    r="1.4"
                    fill="rgba(255,255,255,0.85)"
                  />
                </svg>
              </InertGlyph>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  },
);
