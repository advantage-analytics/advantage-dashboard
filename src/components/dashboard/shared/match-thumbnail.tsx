"use client";

import { useState, type ReactNode } from "react";

/**
 * A match video's stored still, for a list row.
 *
 * A plain lazy `<img>` with fixed dimensions: no video element, no request
 * to this app. `src` is the signed URL the server loader made
 * (`src/lib/data/match-thumbnails-server.ts`); it is null for a match with no
 * thumbnail, and then — or when the image fails to load — `fallback` is drawn
 * in the same box instead, so a row never shows a broken picture and never
 * changes size.
 *
 * Decorative: the row already names the match, so the image carries no alt
 * text for a screen reader to repeat.
 */
export function MatchThumbnail({
  src,
  width,
  height,
  fallback,
  className,
}: {
  src: string | null | undefined;
  width: number;
  height: number;
  fallback: ReactNode;
  className?: string;
}) {
  // Keyed by the URL that failed, so a new URL gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL: the image optimizer would re-fetch it server-side and cache it past its expiry
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={className}
      style={{ objectFit: "cover" }}
      data-match-thumbnail=""
    />
  );
}
