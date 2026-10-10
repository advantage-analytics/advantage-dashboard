"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";
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
 * other answers, plain for Undo / Show / Hide, muted for a stroke's Delete in
 * its tray. Every one goes to full strength on hover.
 */
export type BlackTextActionInk = "amber" | "quiet" | "plain" | "muted";

const TEXT_ACTION_INK: Record<BlackTextActionInk, string> = {
  amber: "text-[var(--rail-amber)]",
  quiet: "text-white/50",
  plain: "text-white/70",
  muted: "text-white/55",
};

/**
 * A text action in the rail. Its `onClick` is the caller's own, so a click that
 * must not reach the row under it stops propagation there, where a spec can see
 * it. With `icon`, an 11px glyph leads the words, 5px before them; with
 * `shrinks`, the button gives way in a crowded row and its words truncate.
 */
export function BlackTextAction({
  ink,
  icon: Icon,
  shrinks = false,
  small = false,
  children,
  ...props
}: {
  ink: BlackTextActionInk;
  icon?: LucideIcon;
  shrinks?: boolean;
  /** 10px type and icon, for the shot tray's quieter actions. */
  small?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        shrinks ? "min-w-0" : "shrink-0",
        Icon && "inline-flex items-center gap-[5px]",
        "cursor-pointer rounded-[var(--radius-button)] px-1 font-medium whitespace-nowrap hover:text-white focus-visible:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        small ? "text-[10px]" : "text-[11px]",
        TEXT_ACTION_INK[ink],
        RAIL_PRESS,
      )}
    >
      {Icon ? (
        <>
          <Icon
            className={cn("shrink-0", small ? "size-[10px]" : "size-[11px]")}
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Undo, in the rail. It never reaches the row under it. With `count`, "Undo
 * N": one click puts that many rows back.
 */
export function BlackUndoButton({
  label,
  count,
  onClick,
}: {
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <BlackTextAction
      ink="plain"
      data-undo-delete=""
      data-undo-count={count}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {count === undefined ? "Undo" : `Undo ${count}`}
    </BlackTextAction>
  );
}

/**
 * The dashed amber slot a question sits in, between two rows: a glyph on the
 * number track, a title over its reason and the answers at the right. The two
 * game slots draw it through `gameSlot`; the suggested point keeps its own
 * markup and shares this class.
 */
export const BLACK_SLOT =
  "mx-2 my-0.5 grid min-h-[44px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-[10px] rounded-lg border border-dashed border-[var(--rail-amber-line)] bg-[var(--rail-amber-wash-faint)] py-1.5 pr-[10px] pl-1.5";

/** "Players switch on 1 point" — a tooltip detail of a move or a pull. */
export function playersSwitchDetail(count: number): string {
  return count === 1
    ? "Players switch on 1 point"
    : `Players switch on ${count} points`;
}

/**
 * A game slot's markup (the one that runs over, the one that ends short): the
 * amber slot with a glyph, a title over its reason and the one answer at the
 * right, whose tooltip carries `details` when there are any. `row` names it
 * (`data-row`, and its `data-{row}-title` / `-detail` / `-actions` hooks);
 * `anchor` is the `data-{row}` value and `rootData` any further root hooks.
 *
 * A plain function, not a component: the specs read each slot by walking its
 * element tree, which stops at a component boundary.
 */
export function gameSlot({
  icon: Icon,
  row,
  anchor,
  rootData,
  title,
  reason,
  action,
  actionLabel,
  details,
}: {
  icon: LucideIcon;
  row: "game-overflow" | "game-underflow";
  anchor: string;
  rootData?: Record<string, string>;
  title: string;
  reason: string;
  /** The answer's button; null draws no actions column. */
  action: ReactNode | null;
  /** The button's words, for its tooltip. */
  actionLabel: string;
  details: readonly string[];
}) {
  return (
    <div
      data-row={row}
      {...{ [`data-${row}`]: anchor }}
      {...rootData}
      className={BLACK_SLOT}
    >
      <Icon
        className="size-3"
        style={{ color: AMBER_SLOT_ICON_INK }}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col gap-px">
        <span
          {...{ [`data-${row}-title`]: "" }}
          className="truncate text-[12px] font-medium text-white"
        >
          {title}
        </span>
        <ChromeTooltip label={reason} side="top" wrap>
          <span
            {...{ [`data-${row}-detail`]: "" }}
            className="truncate text-[11px] text-white/50"
          >
            {reason}
          </span>
        </ChromeTooltip>
      </span>
      {action ? (
        <span
          {...{ [`data-${row}-actions`]: "" }}
          className="flex shrink-0 items-center justify-end"
        >
          {details.length > 0 ? (
            <ChromeTooltip
              label={actionLabel}
              detail={details.join(" · ")}
              side="top"
              align="end"
              wrap
            >
              {action}
            </ChromeTooltip>
          ) : (
            action
          )}
        </span>
      ) : null}
    </div>
  );
}
