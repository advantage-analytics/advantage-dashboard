"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackMetadataResult } from "@/lib/match-video/types";
import { START_ART } from "./start-cards";

/** How far into the match the still is taken: past the warm-up, on a point. */
const STILL_AT_SECONDS = 90;

/**
 * One still from a match's video, for the Home highlight.
 *
 * No still is stored anywhere, so this does what the film room's seek preview
 * does: a second muted `<video>` on the match's own short-lived playback URL,
 * `preload="metadata"`, seeked once and never played. A match with no video
 * (a SwingVision import) keeps the court drawing.
 */
export function MatchFrame({ matchId, alt }: { matchId: string; alt: string }) {
  const [video, setVideo] = useState<{
    url: string;
    at: number;
    minutes: number | null;
  } | null>(null);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/matches/${matchId}/video`, { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: PlaybackMetadataResult | null) => {
        const attachment = result?.attachment;
        if (!attachment?.playbackUrl) return;
        const duration = attachment.durationSeconds ?? null;
        const offset = attachment.offsetSeconds ?? 0;
        setVideo({
          url: attachment.playbackUrl,
          at: offset + Math.min(STILL_AT_SECONDS, (duration ?? 0) / 4),
          minutes: duration ? Math.round(duration / 60) : null,
        });
      })
      .catch(() => {});
    return () => abort.abort();
  }, [matchId]);

  return (
    <div className="relative aspect-video w-[224px] shrink-0 overflow-hidden rounded-[var(--radius-element)] bg-[var(--surface-subtle)]">
      {/* The court drawing holds the well for a match with no video, and under
          the still until it has seeked. */}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center [&>svg]:h-auto [&>svg]:w-[58%]"
      >
        {START_ART.court}
      </span>
      {video ? (
        <video
          ref={ref}
          src={video.url}
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          tabIndex={-1}
          onLoadedMetadata={() => {
            if (ref.current) ref.current.currentTime = video.at;
          }}
          onSeeked={() => setShown(true)}
          className="pointer-events-none relative size-full object-cover transition-opacity duration-300"
          style={{ opacity: shown ? 1 : 0 }}
        />
      ) : null}
      {video?.minutes ? (
        <span className="tabular absolute right-2 bottom-2 h-[18px] rounded-[var(--radius-cell)] bg-[rgba(13,13,13,0.6)] px-1.5 text-[10px] leading-[18px] text-white">
          {video.minutes}m
        </span>
      ) : null}
    </div>
  );
}
