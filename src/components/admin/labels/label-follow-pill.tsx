"use client";

import { cn } from "@/lib/utils";
import type { FollowAffordance } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import type { RailTone } from "./label-rail-tone";

/**
 * The pill's shadow and ink on each ground. Dark: the room's inset hairline.
 * Light: the floating shadow, and its words read `--rail-on-accent`
 * (label-rail-tone.ts).
 */
const TONE: Record<RailTone, { shadow: string; ink: string }> = {
  dark: {
    shadow: "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]",
    ink: "text-white",
  },
  light: {
    shadow: "shadow-[var(--shadow-floating)]",
    ink: "text-[var(--rail-on-accent)]",
  },
};

/**
 * The film room's return pill (point-list.tsx `FollowPill`): the way back to
 * following once the labeller has held the rail. Pinned to the top-centre of
 * the rail's scroller, over its rows. The caller renders it only while there is
 * an affordance to show.
 */
export function LabelFollowPill({
  affordance,
  onFollow,
  tone = "dark",
}: {
  affordance: FollowAffordance;
  onFollow: () => void;
  tone?: RailTone;
}) {
  const at = TONE[tone];
  return (
    <button
      type="button"
      data-label-follow-pill=""
      aria-label={affordance.ariaLabel}
      onClick={onFollow}
      className={cn(
        "absolute top-3 left-1/2 z-10 inline-flex h-7 -translate-x-1/2 cursor-pointer items-center rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap",
        at.ink,
        at.shadow,
        "transition-[background-color,transform] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]",
        // Pinned top, so it drops in (the keyframe reads the sign).
        "film-follow-pill-in [--film-pill-rise:-4px]",
      )}
    >
      {affordance.label}
    </button>
  );
}
