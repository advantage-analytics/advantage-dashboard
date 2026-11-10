"use client";

import { useState } from "react";

import type { OutcomeSide } from "@/components/dashboard/matches/match-detail/point-endings-body";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";

/**
 * The hover rule and wiring both Differential cards share: the match report's
 * (`differential-card.tsx`) and the team player profile's season card
 * (`team/player-profile/season-differential-card.tsx`), so the two cannot
 * drift apart. Neither the report's context nor its film cuts live here —
 * the season card must not reach them (`season-point-endings.spec.ts`).
 *
 * A target is named by its hover id: a bar half (`you-winners`), a figure
 * (`fig-you`) or a legend key (`key-winners`).
 */

/** The cards' hover/focus easing. */
export const EASE = "duration-200 ease-[var(--ease-primary)]";

/** Whether a legend key other than `half`'s is hovered (the keys fade). */
export function isKeyDimmed(hovered: string | null, half: string): boolean {
  return !!hovered?.startsWith("key-") && hovered !== `key-${half}`;
}

/**
 * Whether one half of one player's bar (and its count) fades while `hovered`
 * is the target under the cursor: another half, a figure (which keeps its own
 * row lit) or a legend key (which keeps that kind lit for both rows). Nothing
 * hovered, nothing fades.
 */
export function isDimmed<Half extends string>(
  hovered: string | null,
  side: OutcomeSide,
  half: Half,
): boolean {
  if (hovered === null) return false;
  if (hovered.startsWith("key-")) return hovered !== `key-${half}`;
  if (hovered.startsWith("fig-")) return hovered !== `fig-${side}`;
  return hovered !== `${side}-${half}`;
}

/**
 * The card's hover state plus the handlers each target spreads on: hover and
 * focus raise its readout, and a finger's tap selects it and holds the
 * readout until a tap lands outside the card (`useTouchReadout`). Put
 * `cardRef` on the card's `<section>`.
 */
export function useDifferentialHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  const clear = () => setHovered(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, clear);
  const fingerTap = useFingerTap();

  const hoverTarget = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (fingerTap.press(e, hovered === id)) setHovered(id);
    },
    onClick: () => fingerTap.click(undefined, clear),
    onMouseEnter: () => setHovered(id),
    onMouseLeave: clear,
    onFocus: () => setHovered(id),
    onBlur: clear,
  });

  return { hovered, cardRef, fingerTap, clear, hoverTarget };
}
