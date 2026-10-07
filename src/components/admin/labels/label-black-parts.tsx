"use client";

import type { ButtonHTMLAttributes } from "react";
import { railAmber } from "./label-rail-tone";

/**
 * The pieces the rail's rows share: a text action, the dashed amber slot's
 * class and the rail's amber (`--rail-amber`, label-rail-tone.ts). Inside a
 * Tailwind class an ink has to be a whole literal so the class is generated;
 * those live in the class constants below.
 */

/**
 * A rail control's pressed state: the button dips to 0.96 under the pointer,
 * 100ms in and 200ms back out. It stands in for `transition-colors` (one
 * `transition-property` per element) and names `scale` because that is the
 * property Tailwind's `scale-*` sets. Reduced motion drops the dip. Whole
 * literals: the classes are read off this string.
 */
export const RAIL_PRESS =
  "transition-[color,background-color,scale] duration-200 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100";

export const AMBER_SLOT_ICON_INK = railAmber(0.8);
export const AMBER_SUGGESTION_INK = railAmber(0.75);

/**
 * A text action's resting ink: amber for the slot's one answer, quiet for its
 * other answers, plain for Undo / Show / Hide. Every one goes to full strength
 * on hover.
 */
export type BlackTextActionInk = "amber" | "quiet" | "plain";

const TEXT_ACTION_INK: Record<BlackTextActionInk, string> = {
  amber: "text-[var(--rail-amber)]",
  quiet: "text-white/50",
  plain: "text-white/70",
};

/**
 * A text action in the rail. Its `onClick` is the caller's own, so a click that
 * must not reach the row under it stops propagation there, where a spec can see
 * it.
 */
export function BlackTextAction({
  ink,
  ...props
}: { ink: BlackTextActionInk } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "className"
>) {
  return (
    <button
      type="button"
      {...props}
      className={`shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap ${TEXT_ACTION_INK[ink]} ${RAIL_PRESS} hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`}
    />
  );
}

/** Undo, in the rail. It never reaches the row under it. */
export function BlackUndoButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <BlackTextAction
      ink="plain"
      data-undo-delete=""
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      Undo
    </BlackTextAction>
  );
}

/**
 * The dashed amber slot a question sits in, between two rows: a glyph on the
 * number track, a title over its reason and the answers at the right. The two
 * slots keep their own markup (a spec reads each by walking its element tree,
 * which stops at a component boundary) and share this one class.
 */
export const BLACK_SLOT =
  "mx-2 my-0.5 grid min-h-[44px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-[10px] rounded-lg border border-dashed border-[var(--rail-amber-line)] bg-[var(--rail-amber-wash-faint)] py-1.5 pr-[10px] pl-1.5";
