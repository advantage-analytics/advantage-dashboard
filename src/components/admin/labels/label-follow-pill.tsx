"use client";

import { cn } from "@/lib/utils";
import type { FollowAffordance } from "@/components/dashboard/matches/match-detail/film/film-timeline";

/**
 * Where the pill is pinned, and the one class each needs there. The console
 * (`page`) pins it over the page under the header, above the dock layer
 * (`z-40`), with the floating shadow since it sits over the light page; the
 * black rail (`rail`) pins it over the scroller's rows, with the room's inset
 * hairline since the rail is as dark as the room.
 */
const PLACEMENT = {
  page: {
    top: "top-12",
    z: "z-50",
    shadow: "shadow-[var(--shadow-floating)]",
  },
  rail: {
    top: "top-3",
    z: "z-10",
    shadow: "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]",
  },
} as const;

/**
 * The film room's return pill (point-list.tsx `FollowPill`) in the room's own
 * dark recipe — the way back to following once the labeller has held the
 * list. Top-centre of whatever it is pinned to; no chevron, since the lit row
 * is wherever the list is. The caller renders it only while there is an
 * affordance to show.
 */
export function LabelFollowPill({
  affordance,
  onFollow,
  placement,
}: {
  affordance: FollowAffordance;
  onFollow: () => void;
  placement: keyof typeof PLACEMENT;
}) {
  const at = PLACEMENT[placement];
  return (
    <button
      type="button"
      data-label-follow-pill=""
      aria-label={affordance.ariaLabel}
      onClick={onFollow}
      className={cn(
        `absolute ${at.top} left-1/2 ${at.z} inline-flex h-7 -translate-x-1/2 cursor-pointer items-center rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap text-white ${at.shadow} transition-[background-color,transform] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]`,
        // Pinned top, so it drops in (the keyframe reads the sign).
        "film-follow-pill-in [--film-pill-rise:-4px]",
      )}
    >
      {affordance.label}
    </button>
  );
}
