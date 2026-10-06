"use client";

import type { ButtonHTMLAttributes } from "react";
import { railAmber } from "./label-rail-tone";

/**
 * The pieces the black view's rows share (board 08l / 08m): a text action in
 * the dark tone, the dashed amber slot's class, and the amber the frame draws
 * both with.
 *
 * The amber is the rail's (`--rail-amber` and its washes, set per ground in
 * `label-rail-tone.ts`: the frame's amber on black, the warning triple on
 * white). An ink a row sets by style is that variable at an alpha; inside a
 * Tailwind class it has to be a whole literal so the class is generated —
 * those live in the class constants below.
 */

/** The slot's leading glyph — the frame's `.fx-slot .bk-pl`. */
export const AMBER_SLOT_ICON_INK = railAmber(0.8);
/** A suggested stroke's own ink — the frame's `.fx-sug .bk-n, .bk-tm, .bk-pl`. */
export const AMBER_SUGGESTION_INK = railAmber(0.75);

/**
 * A text action's resting ink: amber for the slot's one answer, quiet white
 * for its other answers, plain white for Undo / Show / Hide. Every one goes
 * full white on hover — "white" being the rail's ink, so the page's ink on a
 * light ground.
 */
export type BlackTextActionInk = "amber" | "quiet" | "plain";

const TEXT_ACTION_INK: Record<BlackTextActionInk, string> = {
  amber: "text-[var(--rail-amber)]",
  quiet: "text-white/50",
  plain: "text-white/70",
};

/**
 * A text action on black — the light table's blue words in the room's white
 * (or the slot's amber), to full white on hover. Its `onClick` is the
 * caller's own, so a click that must not reach the row under it stops
 * propagation there, where a spec can see it.
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
      className={`shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap ${TEXT_ACTION_INK[ink]} transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`}
    />
  );
}

/**
 * Undo, on black: the light table's blue words are the room's white ones —
 * 70% to full on hover, as every text action in the dark tone. It never
 * reaches the row under it.
 */
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
 * The dashed amber slot a question sits in, between two rows (board 08m §5's
 * suggested point, the game that runs over): a glyph on the number track, a
 * title over its reason and the answers at the right. The two slots keep
 * their own markup — a spec reads each by walking its element tree, which
 * stops at a component boundary — and share the frame's one class.
 */
export const BLACK_SLOT =
  "mx-2 my-0.5 grid min-h-[44px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-[10px] rounded-lg border border-dashed border-[var(--rail-amber-line)] bg-[var(--rail-amber-wash-faint)] py-1.5 pr-[10px] pl-1.5";
