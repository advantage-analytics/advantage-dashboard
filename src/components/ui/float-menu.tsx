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
 * what it means, a blue check when it is the chosen one) and `FloatMenuNote`
 * (the sentence under a hairline at the foot, for the one thing the menu
 * will not do). `MenuSelect` composes them into a select; a command menu or
 * a row's action menu composes them the same way.
 *
 * Geometry is the Teams design's: 10px radius, 5px inset, 7px-radius rows,
 * `--surface-subtle` for hover and for the chosen row, Signal Blue only on
 * the check — it is the one colour that means "chosen". Nothing here is a
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
 * One row. `chosen` draws the check and the wash; `description` is the
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
  /** A 12px leading glyph for action menus; a select uses the check slot instead. */
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
        "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
        chosen && "bg-[var(--surface-subtle)]",
        className,
      )}
    >
      <span className="mt-[3px] w-3 shrink-0 text-[var(--blue)]">
        {icon ? (
          icon
        ) : chosen ? (
          <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[12px] text-[var(--ink-900)]">{label}</span>
        {description ? (
          <span className="mt-0.5 text-[11px] leading-[1.4] text-[var(--ink-500)]">
            {description}
          </span>
        ) : null}
      </span>
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
