"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchStillResult } from "@/app/api/matches/[matchId]/video/still/route";
import { cn } from "@/lib/utils";
import { START_ART } from "./start-cards";

/** How far into the match the still is taken: past the warm-up, on a point. */
const STILL_AT_SECONDS = 90;

type Still = NonNullable<MatchStillResult["still"]>;

/**
 * Each still is a muted `<video preload="metadata">` on the match's own
 * short-lived playback URL (`/api/matches/[id]/video/still`, which covers
 * attached recordings and Advantage Intelligence videos alike), opened at one
 * moment and never played — the film room's seek-preview technique, since no
 * still is stored anywhere.
 *
 * Two waits are kept apart. Asking where a match's video is goes to this
 * app, so every row asks at once and the answer is remembered for the visit.
 * Opening the video goes to one storage host, where Safari allows about six
 * connections, so only {@link VIDEO_SLOTS} are open at a time.
 */
const VIDEO_SLOTS = 3;
/** Well inside the URL's own lifetime (hours). */
const SOURCE_TTL_MS = 30 * 60 * 1000;

const sources = new Map<string, { at: number; still: Promise<Still | null> }>();
function stillFor(matchId: string): Promise<Still | null> {
  const known = sources.get(matchId);
  if (known && Date.now() - known.at < SOURCE_TTL_MS) return known.still;
  const still = fetch(`/api/matches/${matchId}/video/still`)
    .then((response) => (response.ok ? response.json() : null))
    .then((result: MatchStillResult | null) => result?.still ?? null)
    .catch(() => {
      // A failed ask is not an answer: the next row to mount asks again.
      sources.delete(matchId);
      return null;
    });
  sources.set(matchId, { at: Date.now(), still });
  return still;
}

let freeSlots = VIDEO_SLOTS;
const waiting: (() => void)[] = [];
/** Resolves with the slot's release, which is safe to call more than once. */
function takeSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        const next = waiting.shift();
        if (next) next();
        else freeSlots += 1;
      });
    };
    if (freeSlots > 0) {
      freeSlots -= 1;
      grant();
    } else {
      waiting.push(grant);
    }
  });
}

const SIZES = {
  row: "h-[44px] w-[78px] rounded-[6px]",
} as const;

/**
 * A 16:9 still from a match's video. A match with no video (a SwingVision
 * import), or one whose still has not arrived, shows the court drawing.
 */
export function MatchFrame({
  matchId,
  alt,
  size = "row",
}: {
  matchId: string;
  alt: string;
  size?: keyof typeof SIZES;
}) {
  const [video, setVideo] = useState<{ url: string; at: number } | null>(null);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const release = useRef<() => void>(() => {});

  useEffect(() => {
    let live = true;
    let giveUp = 0;
    stillFor(matchId)
      .then((still) => {
        if (!live || !still) return;
        return takeSlot().then((done) => {
          if (!live) return done();
          release.current = done;
          // Never hold a slot for a still that is slow or broken.
          giveUp = window.setTimeout(done, 8000);
          setVideo({
            url: still.url,
            at: still.leadSeconds + STILL_AT_SECONDS,
          });
        });
      })
      .catch(() => {});
    return () => {
      live = false;
      window.clearTimeout(giveUp);
      release.current();
    };
  }, [matchId]);

  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden bg-[var(--surface-subtle)]",
        SIZES[size],
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center [&>svg]:h-auto [&>svg]:w-[58%]"
      >
        {START_ART.court}
      </span>
      {video ? (
        <video
          ref={ref}
          // The media fragment opens the file at the moment itself, saving the
          // round trip of loading the start and then seeking away from it.
          src={`${video.url}#t=${video.at}`}
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          tabIndex={-1}
          onLoadedMetadata={() => {
            const element = ref.current;
            if (!element) return;
            // Never past a short clip's midpoint; and only seek when the
            // fragment did not already put the file there.
            const length = Number.isFinite(element.duration)
              ? element.duration
              : Infinity;
            const at = Math.min(video.at, length / 2);
            if (Math.abs(element.currentTime - at) > 1) {
              element.currentTime = at;
            }
          }}
          onLoadedData={() => {
            setShown(true);
            release.current();
          }}
          onSeeked={() => {
            setShown(true);
            release.current();
          }}
          onError={() => release.current()}
          className="pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-300"
          style={{ opacity: shown ? 1 : 0 }}
        />
      ) : null}
    </span>
  );
}
