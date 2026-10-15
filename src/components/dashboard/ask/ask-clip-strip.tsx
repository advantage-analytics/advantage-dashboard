"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FilmClock } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import {
  clockOf,
  fetchPlaybackSource,
} from "@/components/dashboard/matches/match-detail/film/use-attachment-playback";
import { expiredBodyCopy } from "@/lib/match-video/film-entry";
import type {
  AskShowFilm,
  AskShowPoint,
} from "@/lib/services/ask/show-response";
import { cn } from "@/lib/utils";

import {
  clipAdvance,
  clipPositionLabel,
  clipWindows,
} from "./ask-clip-sequence";

/**
 * The inline clip strip (roadmap 6.1): for a small point set, the points
 * played one after another inside the answer, with the dead time between
 * them skipped.
 *
 * It is a `<video>` on the match's read-only playback URL and the film
 * room's own seek arithmetic (`ask-clip-sequence.ts` → `film-timeline.ts`,
 * the trim offset included), not a second player: one element, three
 * controls, a counter. An attachment's URL comes from
 * `GET /api/matches/[id]/video` (the credential-refresh route, through the
 * same `fetchPlaybackSource` the film room uses); the Advantage Intelligence
 * lineage has no refresh route and plays the URL `/api/ask/show` resolved.
 *
 * Retention: a video that expired is the Video tab's expired state in short
 * — the same heading and sentence `film-expired-state.tsx` prints — never a
 * player with nothing to load. A credential the route no longer answers
 * (`removed`, `denied`, `unavailable`) or an element that fails to load says
 * so in one line and hands over to the film room.
 *
 * Keep this file's imports clear of `next/navigation` and `next/image`: it
 * is rendered by an offline component harness (`tests/ask-clip-strip.spec.ts`).
 */

/** Points beyond this many get the list and the link, not an inline player. */
export const ASK_CLIP_STRIP_MAX = 8;

export const ASK_CLIP_EXPIRED_TITLE = "This video was removed";
export const ASK_CLIP_REMOVED_MESSAGE =
  "This video is no longer attached to the match.";
export const ASK_CLIP_UNAVAILABLE_MESSAGE =
  "The video could not be loaded. Open the film room to try again.";

const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

export interface AskClipStripProps {
  matchId: string;
  /** In match order; untimed points are skipped. */
  points: readonly AskShowPoint[];
  film: AskShowFilm;
  /** The film room on these points: the strip's way out. */
  href: string;
  /** A spec's recording `fetch`. */
  fetchImpl?: typeof fetch;
}

type Source =
  | { kind: "loading" }
  | { kind: "ready"; url: string; clock: FilmClock }
  | { kind: "removed" }
  | { kind: "unavailable" };

/** "Set 1 · Game 4 · 30-15 · Forehand winner" — what is playing. */
function pointLine(point: AskShowPoint | undefined): string {
  if (!point) return "";
  const parts: string[] = [];
  if (point.setNumber !== null && point.gameNumber !== null) {
    parts.push(`Set ${point.setNumber} · Game ${point.gameNumber}`);
  }
  if (point.pointScore) parts.push(point.pointScore);
  if (point.resultType) parts.push(point.resultType);
  return parts.join(" · ");
}

/**
 * The Video tab's expired state, in the answer's own small card: the same
 * heading and body as `FilmExpiredState`, without the offer — adding a video
 * is the match page's to offer, with the quota it knows.
 */
export function AskClipExpired({
  expiredAt,
  href,
}: {
  expiredAt: string | null;
  href: string;
}) {
  return (
    <div
      data-ask-clip-expired=""
      role="status"
      className="surface-card flex max-w-[420px] flex-col gap-1 px-4 py-3"
    >
      <p className="text-[13px] text-[var(--ink-900)]">
        {ASK_CLIP_EXPIRED_TITLE}
      </p>
      <p className="text-micro max-w-[52ch] [text-wrap:pretty]">
        {expiredBodyCopy(expiredAt ?? "")}
      </p>
      <Link
        href={href}
        className="text-micro w-fit transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
      >
        Open the match
      </Link>
    </div>
  );
}

export function AskClipStrip({
  matchId,
  points,
  film,
  href,
  fetchImpl,
}: AskClipStripProps) {
  if (film.state === "expired") {
    return <AskClipExpired expiredAt={film.expiredAt} href={href} />;
  }
  if (film.state !== "ready") return null;
  return (
    <AskClipPlayer
      matchId={matchId}
      points={points}
      film={film}
      href={href}
      fetchImpl={fetchImpl}
    />
  );
}

function AskClipPlayer({
  matchId,
  points,
  film,
  href,
  fetchImpl,
}: Omit<AskClipStripProps, "film"> & {
  film: Extract<AskShowFilm, { state: "ready" }>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The job lineage's URL is the route's answer; an attachment's is fetched
  // fresh below, the way the film room fetches its first renewal.
  const [source, setSource] = useState<Source>(() =>
    film.source === "job"
      ? {
          kind: "ready",
          url: film.playback.url,
          clock: {
            offset: film.playback.offsetSeconds,
            duration: film.playback.durationSeconds,
          },
        }
      : { kind: "loading" },
  );
  useEffect(() => {
    if (film.source !== "attachment") return;
    const controller = new AbortController();
    const send = fetchImpl ?? fetch;
    void fetchPlaybackSource(matchId, send, controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.kind === "attachment") {
          setSource({
            kind: "ready",
            url: outcome.source.url,
            clock: clockOf(outcome.source),
          });
        } else if (outcome.kind === "removed") {
          setSource({ kind: "removed" });
        } else {
          setSource({ kind: "unavailable" });
        }
      },
    );
    return () => controller.abort();
  }, [matchId, film.source, fetchImpl]);

  const windows = useMemo(
    () => (source.kind === "ready" ? clipWindows(points, source.clock) : []),
    [points, source],
  );
  const byNumber = useMemo(
    () => new Map(points.map((point) => [point.pointNumber, point])),
    [points],
  );

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  const seekToWindow = useCallback(
    (at: number) => {
      const el = videoRef.current;
      const window_ = windows[at];
      if (!el || !window_) return;
      el.currentTime = window_.start;
    },
    [windows],
  );

  const onTime = useCallback(() => {
    const el = videoRef.current;
    if (!el || windows.length === 0) return;
    const next = clipAdvance(windows, index, el.currentTime);
    if (next === null) return;
    if (next === "end") {
      el.pause();
      setEnded(true);
      return;
    }
    setIndex(next);
    el.currentTime = windows[next].start;
  }, [windows, index]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (ended) {
      setEnded(false);
      setIndex(0);
      seekToWindow(0);
    }
    void el.play().catch(() => setPlaying(false));
  }, [ended, seekToWindow]);

  const step = useCallback(
    (direction: -1 | 1) => {
      const at = Math.min(Math.max(index + direction, 0), windows.length - 1);
      if (at === index) return;
      setEnded(false);
      setIndex(at);
      seekToWindow(at);
    },
    [index, windows.length, seekToWindow],
  );

  if (source.kind === "loading") {
    return (
      <p role="status" data-ask-clip-loading="" className="text-body-sm">
        Loading the film
      </p>
    );
  }
  if (source.kind !== "ready" || windows.length === 0) {
    return (
      <p
        role="status"
        data-ask-clip-unavailable={
          source.kind === "ready" ? "untimed" : source.kind
        }
        className="text-body-sm flex flex-wrap items-center gap-x-2"
      >
        <span>
          {source.kind === "removed"
            ? ASK_CLIP_REMOVED_MESSAGE
            : ASK_CLIP_UNAVAILABLE_MESSAGE}
        </span>
        <Link
          href={href}
          className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Open the film room
        </Link>
      </p>
    );
  }

  const current = windows[index];
  const point = byNumber.get(current?.pointNumber ?? -1);
  const total = windows.length;

  return (
    <TooltipProvider>
      <div
        data-ask-clip-strip=""
        className="surface-card flex max-w-[420px] flex-col gap-2 p-2"
      >
        {/* A fresh element per credential (`key`), as the film room keys its
            `<video>` on the generation: a swapped `src` keeps the old
            buffer's frames on screen. */}
        <video
          key={source.url}
          ref={videoRef}
          src={source.url}
          preload="metadata"
          playsInline
          aria-label={`Point ${current.pointNumber}`}
          className="aspect-video w-full rounded-[var(--radius-element)] bg-black"
          onLoadedMetadata={() => seekToWindow(index)}
          onTimeUpdate={onTime}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setSource({ kind: "unavailable" })}
        />
        <div className="flex items-center gap-1 px-0.5">
          <ChromeTooltip label="Previous point" side="top">
            <button
              type="button"
              aria-label="Previous point"
              disabled={index === 0}
              onClick={() => step(-1)}
              className={ICON_BUTTON}
            >
              <SkipBack
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
          <ChromeTooltip label={playing ? "Pause" : "Play"} side="top">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              aria-pressed={playing}
              onClick={togglePlay}
              className={ICON_BUTTON}
            >
              {playing ? (
                <Pause
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <Play
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
            </button>
          </ChromeTooltip>
          <ChromeTooltip label="Next point" side="top">
            <button
              type="button"
              aria-label="Next point"
              disabled={index >= total - 1}
              onClick={() => step(1)}
              className={ICON_BUTTON}
            >
              <SkipForward
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
          <span
            data-ask-clip-position=""
            className="mono tabular pl-1.5 text-[10px] whitespace-nowrap text-[var(--ink-500)]"
          >
            {clipPositionLabel(index, total)}
          </span>
          <span
            data-ask-clip-point=""
            className={cn(
              "text-micro min-w-0 flex-1 truncate pl-2",
              !point && "hidden",
            )}
          >
            {pointLine(point)}
          </span>
          <Link
            href={href}
            className="text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Film room
          </Link>
        </div>
      </div>
    </TooltipProvider>
  );
}
