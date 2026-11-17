/**
 * The opponent's hand and backhand at the moment their name is settled.
 *
 * Hand and Backhand used to stay locked until a name was added, so the only
 * answers they could hold on naming were a previous opponent's — and naming
 * someone new cleared them. They are open from the start now (a parent on
 * 2026-11-15 typed a name, never pressed Enter, and stopped at two locked
 * selects), so a coach can answer them first. Those answers belong to the
 * person about to be named and must survive the naming.
 *
 * - **Answered before any name** (`enteredBeforeName`): each answer stands,
 *   and a remembered value fills only a field still blank. What the coach
 *   chose on screen beats what an older match recorded.
 * - **Otherwise** (a new name replacing an old one, or a first name with no
 *   answers yet): the remembered values, or blanks. A style left over from
 *   the previous opponent is never carried to the next one.
 *
 * `source` is "history" only when a remembered value is actually shown, so
 * the read-back's "from your last match" never describes a coach's own answer.
 *
 * Pure, no React: every way a name is settled (Enter, leaving the field, a
 * pick from the menu) goes through it, so they cannot disagree.
 */

import type { Backhand, Hand } from "@/lib/matches/patch-match";

export type OpponentStyle = {
  hand: Hand | undefined;
  backhand: Backhand | undefined;
  source: "history" | undefined;
};

export function asHand(value: unknown): Hand | undefined {
  return value === "right" || value === "left" ? value : undefined;
}

export function asBackhand(value: unknown): Backhand | undefined {
  return value === "one-handed" || value === "two-handed" ? value : undefined;
}

export function opponentStyleOnNaming(input: {
  /** What the form holds right now. */
  current: { hand: Hand | undefined; backhand: Backhand | undefined };
  /** True when the form has no settled opponent and the answers are the coach's. */
  enteredBeforeName: boolean;
  /** What the last match against this person recorded, when there is one. */
  remembered?: { hand?: unknown; backhand?: unknown };
}): OpponentStyle {
  const rememberedHand = asHand(input.remembered?.hand);
  const rememberedBackhand = asBackhand(input.remembered?.backhand);

  if (input.enteredBeforeName) {
    const hand = input.current.hand ?? rememberedHand;
    const backhand = input.current.backhand ?? rememberedBackhand;
    const usedMemory =
      (!input.current.hand && rememberedHand !== undefined) ||
      (!input.current.backhand && rememberedBackhand !== undefined);
    return { hand, backhand, source: usedMemory ? "history" : undefined };
  }

  return {
    hand: rememberedHand,
    backhand: rememberedBackhand,
    source: rememberedHand || rememberedBackhand ? "history" : undefined,
  };
}
