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

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchVideo } from "@/lib/data/match-video-server";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { shortMonthDate, formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { advButton } from "@/lib/ui/adv-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The match video, with the 46c control bar over it (artboard lines 819–844).
 *
 * ── Called the match video, deliberately ────────────────────────────────────
 * The file is the `StartTime`/`EndTime` window from our own job request,
 * re-encoded — not dead time removed, no annotations, no rally-only cut
 * (`ui-revamp-guardrails.md` §1, written after somebody watched it). For a
 * player who trimmed nothing it is their own upload at a lower bitrate, so no
 * string in this subtree calls it a highlight or a condensed match.
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
 * ── Glyphs with nothing behind them ─────────────────────────────────────────
 * The artboard's bar carries three more controls (a timer, a loop, a kebab)
 * that no spec defines. They render — the bar is drawn 1:1 — but they are
 * inert and say so on hover, which is honest in a way that either guessing at
 * a behaviour or silently dropping them from the artboard is not.
 */

export interface FilmPlayerHandle {
  /** Jump playback to an absolute second inside the file. */
  seekTo: (seconds: number) => void;
}

interface FilmPlayerProps {
  video: MatchVideo;
  /**
   * The points the prev/next buttons step through — the currently applied cut,
   * so the buttons walk what the list is showing.
   */
  points: MatchPoint[];
  /** Fires on `timeupdate`/`seeked`; drives the point list's playing row. */
  onTimeChange: (seconds: number) => void;
}

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
      <TooltipContent side="top">{label} isn&rsquo;t wired up yet</TooltipContent>
    </Tooltip>
  );
}

export const FilmPlayer = forwardRef<FilmPlayerHandle, FilmPlayerProps>(
  function FilmPlayer({ video, points, onTimeChange }, ref) {
    const { match } = useMatchData();
    const videoRef = useRef<HTMLVideoElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [failed, setFailed] = useState(false);
    const [scrubbing, setScrubbing] = useState(false);

    const seekTo = useCallback(
      (seconds: number) => {
        const el = videoRef.current;
        if (!el) return;
        const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
        const target = Math.max(0, max ? Math.min(seconds, max) : seconds);
        el.currentTime = target;
        setCurrentTime(target);
        onTimeChange(target);
      },
      [onTimeChange],
    );

    useImperativeHandle(ref, () => ({ seekTo }), [seekTo]);

    // Points carrying a `videoTime`, in film order — the prev/next targets.
    // Memoized because `currentTime`/`timeupdate` state changes re-render this
    // component at the video's native tick rate, and `points` itself changes
    // far less often (only when the film filter is applied).
    const stops = useMemo(
      () =>
        points
          .map((p) => p.videoTime)
          .filter((t): t is number => typeof t === "number")
          .sort((a, b) => a - b),
      [points],
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
        if (stops.length === 0) return;
        const now = videoRef.current?.currentTime ?? 0;
        // A half-second cushion so "previous" on a point you just jumped to
        // goes back a point rather than re-seeking the one you are on.
        const target =
          direction === 1
            ? stops.find((t) => t > now + 0.5)
            : [...stops].reverse().find((t) => t < now - 0.5);
        if (typeof target === "number") seekTo(target);
      },
      [stops, seekTo],
    );

    const toggleMute = useCallback(() => {
      const el = videoRef.current;
      if (!el) return;
      el.muted = !el.muted;
      setMuted(el.muted);
    }, []);

    const toggleFullscreen = useCallback(() => {
      const frame = frameRef.current;
      if (!frame) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      } else {
        void frame.requestFullscreen?.().catch(() => {});
      }
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
        const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
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

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const eventName = match.tournamentName?.trim() || null;

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
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setCurrentTime(t);
              onTimeChange(t);
            }}
            onSeeked={(e) => {
              const t = e.currentTarget.currentTime;
              setCurrentTime(t);
              onTimeChange(t);
            }}
            onError={() => setFailed(true)}
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
              className="pointer-events-auto relative my-2 mb-2.5 h-0.5 cursor-pointer bg-white/[0.22] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <span
                className="absolute inset-y-0 left-0 bg-[var(--blue)]"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <div className="pointer-events-auto flex items-center gap-[18px]">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className={GLYPH}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="block h-full w-full">
                  {playing ? (
                    <>
                      <rect x="7" y="4" width="4" height="16" fill="currentColor" />
                      <rect x="14" y="4" width="4" height="16" fill="currentColor" />
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
                className={cn(GLYPH, "disabled:cursor-default disabled:opacity-35")}
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
                  <polygon points="18 5 8 12 18 19" fill="currentColor" stroke="none" />
                  <line x1="5" y1="5" x2="5" y2="19" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => step(1)}
                disabled={stops.length === 0}
                aria-label="Next point"
                className={cn(GLYPH, "disabled:cursor-default disabled:opacity-35")}
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
                  <polygon points="6 5 16 12 6 19" fill="currentColor" stroke="none" />
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
                onClick={toggleFullscreen}
                aria-label="Fullscreen"
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
                  <circle cx="12" cy="5" r="1.4" fill="rgba(255,255,255,0.85)" />
                  <circle cx="12" cy="12" r="1.4" fill="rgba(255,255,255,0.85)" />
                  <circle cx="12" cy="19" r="1.4" fill="rgba(255,255,255,0.85)" />
                </svg>
              </InertGlyph>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  },
);
