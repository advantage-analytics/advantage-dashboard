"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatProbeFps } from "@/lib/services/upload/validators/splitstep-validator";
import type { VideoProbeSummary } from "./types";
import { formatResolution, formatTimecode } from "./utils";

/**
 * A file the wizard has checked, as a row: a 40px lead, the 14px name, and a
 * mono line of facts.
 *
 * One component because two steps draw it. The file step shows it under the
 * drop zone with Replace and Remove; the Details step shows the same video
 * again above Save match, with no actions, so the person recognises what is
 * about to upload as the file they picked two steps earlier.
 *
 * `children` are the trailing actions. The hairline underneath belongs to the
 * file step's layout, so it is the caller's to ask for.
 */
export function CheckedFileRow({
  lead,
  name,
  facts,
  ruled = false,
  children,
}: {
  lead: ReactNode;
  name: string | undefined;
  facts: string;
  /** Hairline under the row — the file step's, where more follows it. */
  ruled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4",
        ruled && "border-b border-[var(--border-hairline)] pb-4",
      )}
    >
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[14px] leading-5 text-[var(--ink-900)]">
          {name}
        </span>
        <span className="mono tabular text-micro leading-4">{facts}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * The video row's lead: a still from the file on the dark tile, or the film
 * glyph when the wizard no longer holds the file (a restored draft).
 */
export function VideoFileLead({
  file,
  durationSeconds,
}: {
  file: File | null | undefined;
  durationSeconds: number;
}) {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-button)] bg-[var(--ink-900)]">
      {file ? (
        <VideoStill file={file} durationSeconds={durationSeconds} />
      ) : (
        <Film
          className="size-4 text-white/70"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

/**
 * What the local probe read off a video, as the row's facts line:
 * "1:12:16 · 1080p · 30 fps · 3.80 GB". Null without a probe.
 *
 * `tail` is the file step's closing word ("checked"); the Details step, two
 * steps past the check, leaves it off.
 */
export function videoFileFacts(
  probe: VideoProbeSummary | null,
  size: string | undefined,
  tail?: string,
): string | null {
  if (!probe) return null;
  return [
    formatTimecode(probe.durationSeconds),
    formatResolution(probe.width, probe.height),
    formatProbeFps(probe),
    size,
    tail,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A still from the file, as the row's 40px lead.
 *
 * Its own object URL rather than the trim step's: that one is created when the
 * player mounts, two steps from here. A few seconds in rather than frame zero,
 * which on a phone recording is usually the ground.
 */
function VideoStill({
  file,
  durationSeconds,
}: {
  file: File;
  durationSeconds: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // URL created and revoked in the same effect, src set from it — see the
  // same note in TrimStepContent: a memoised URL revoked from a cleanup is
  // dead by the time development's second effect run looks for it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => {
      // Detach before revoking — Safari otherwise keeps the handle alive.
      el.pause();
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const at = Math.min(5, durationSeconds * 0.05) || 0.001;
  return (
    <video
      ref={ref}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      onLoadedMetadata={(e) => {
        if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = at;
      }}
      className="size-10 object-cover opacity-90"
    />
  );
}
