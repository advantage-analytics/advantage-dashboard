"use client";

import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The product's float menu — the one every dropdown draws from.
 *
 * Three parts and no more: `FloatMenu` (the surface, anchored to whatever
 * trigger it wraps), `FloatMenuItem` (one row: label, optional second line on
 * what it means, a blue `ChosenCheck` at the right edge when it is the chosen
 * one) and `FloatMenuNote`
 * (the sentence under a hairline at the foot, for the one thing the menu
 * will not do). `MenuSelect` composes them into a select; a command menu or
 * a row's action menu composes them the same way.
 *
 * Geometry is the Teams design's: 10px radius, 5px inset, 7px-radius rows,
 * `--surface-subtle` for an unchosen row's hover or either row's keyboard
 * focus, never as a chosen-row fill; Signal Blue only on the check — it is
 * the one colour that means "chosen". Nothing here is a
 * native `<select>`: the browser's popup cannot carry a second line, and the
 * native control's underline on a radiused box is how a hairline came to
 * curl at both ends once already.
 */
export function FloatMenu({
  open,
  onOpenChange,
  trigger,
  align = "end",
  sideOffset = 4,
  width = 232,
  label,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opens it. Rendered as-is (`asChild`); give it `aria-expanded`. */
  trigger: React.ReactElement;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** A pixel width, or `"trigger"` to match the element it opens from. */
  width?: number | "trigger";
  /** Accessible name for the menu. */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]",
          width === "trigger" &&
            "w-[var(--radix-popover-trigger-width)] min-w-[212px]",
          className,
        )}
        style={typeof width === "number" ? { width } : undefined}
      >
        <div role="menu" aria-label={label} className="flex flex-col">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The mark on the chosen row of any menu, picker or selectable list — a 13px
 * Signal Blue check in its own 13px slot at the row's RIGHT edge, after any
 * pill or meta. The slot renders on every row, chosen or not, so a check
 * appearing never moves the text.
 *
 * Right, never left (2026-09-13): the leading slot belongs to what the row is
 * — an action icon, an avatar, a workspace crest — and a check can't share it.
 * The one way to draw "chosen"; a hand-built menu renders this rather than its
 * own `<Check>`.
 */
export function ChosenCheck({
  chosen,
  className,
}: {
  chosen: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex w-[13px] shrink-0 justify-center", className)}
    >
      {chosen ? (
        <Check className="size-[13px] text-[var(--blue)]" strokeWidth={2} />
      ) : null}
    </span>
  );
}

/**
 * One row. `chosen` draws the check at the right edge; `description` is the
 * second line — use it when the label alone would not tell a coach what
 * they are choosing ("Staff"), and leave it off when it would ("Clay").
 */
export function FloatMenuItem({
  label,
  description,
  chosen = false,
  onSelect,
  icon,
  className,
}: {
  label: string;
  description?: string;
  chosen?: boolean;
  onSelect: () => void;
  /** A 12px leading glyph for action menus, which have no chosen row. */
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role={icon ? "menuitem" : "menuitemradio"}
      aria-checked={icon ? undefined : chosen}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100",
        "focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
        !chosen && "hover:bg-[var(--surface-subtle)]",
        className,
      )}
    >
      {icon ? (
        <span className="mt-[3px] w-3 shrink-0 text-[var(--blue)]">{icon}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] text-[var(--ink-900)]">{label}</span>
        {description ? (
          <span className="mt-0.5 text-[11px] leading-[1.4] text-[var(--ink-500)]">
            {description}
          </span>
        ) : null}
      </span>
      {/* Pinned to the label's line, not centred on a two-line row. */}
      {icon ? null : <ChosenCheck chosen={chosen} className="mt-[2px]" />}
    </button>
  );
}

/** The closing sentence — what this menu deliberately cannot do. */
export function FloatMenuNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-1 mt-1 border-t border-[var(--border-hairline)] px-1.5 pt-2 pb-1 text-[11px] leading-[1.5] text-[var(--ink-400)]">
      {children}
    </p>
  );
}

/** A hairline between groups of items. */
export function FloatMenuDivider() {
  return <div className="mx-2 my-1 h-px bg-[var(--border-hairline)]" />;
}
