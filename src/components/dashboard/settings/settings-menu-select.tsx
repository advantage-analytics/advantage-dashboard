"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  /** One line on what choosing it means. The reason this is not a native select. */
  description?: string;
}

/**
 * A select whose menu is the product's own — the float menu from the Teams
 * design: 10px radius, 5px inset, one row per option with a line beneath
 * saying what it means, the chosen one carrying the blue check, and an
 * optional closing note for the thing the menu will not do.
 *
 * Two triggers. `underline` is a form field: full width, the caption's
 * hairline beneath, no radius (the earlier native select drew its rule on a
 * 6px-radius box, so the line curled at both ends). `pill` is the row control
 * beside a `SettingsCardRow` label — 30px, bordered, the geometry
 * `SettingsInlineSelect` has. Both turn their edge blue while open, which is
 * the one colour that means "chosen".
 *
 * `SettingsInlineSelect` (a native select over a pill) remains for pages that
 * have not moved; the two share their trigger geometry so a page mixing them
 * for a release does not look like it did.
 */
export function SettingsMenuSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  variant = "pill",
  note,
  disabled = false,
  className,
  menuClassName,
}: {
  /** Accessible name — the visible caption or row label sits beside it. */
  label: string;
  value: T;
  options: readonly MenuOption<T>[];
  onChange: (next: T) => void;
  variant?: "pill" | "underline";
  /** Sentence under a hairline at the menu's foot. */
  note?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "flex cursor-pointer items-center justify-between gap-2 text-left transition-colors duration-150",
            "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
            variant === "underline"
              ? cn(
                  "h-8 w-full rounded-none border-b bg-transparent text-[13px] text-[var(--ink-900)]",
                  open ? "border-[var(--blue)]" : "border-[var(--border-field)]"
                )
              : cn(
                  "h-[30px] shrink-0 rounded-[6px] border bg-[var(--surface-card)] px-3 text-[12px] text-[var(--ink-900)] hover:bg-[var(--surface-subtle)]",
                  open ? "border-[var(--blue)]" : "border-[var(--border-field)]"
                ),
            className
          )}
        >
          <span className="truncate">{current?.label ?? value}</span>
          <ChevronDown
            className="size-3 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={variant === "underline" ? "start" : "end"}
        sideOffset={4}
        className={cn(
          "rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]",
          variant === "underline"
            ? "w-[var(--radix-popover-trigger-width)] min-w-[212px]"
            : "w-[232px]",
          menuClassName
        )}
      >
        <div role="menu" aria-label={label} className="flex flex-col">
          {options.map((option) => {
            const chosen = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                onClick={() => {
                  setOpen(false);
                  if (!chosen) onChange(option.value);
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100",
                  "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
                  chosen && "bg-[var(--surface-subtle)]"
                )}
              >
                <span className="mt-[3px] w-3 shrink-0 text-[var(--blue)]">
                  {chosen && (
                    <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[12px] text-[var(--ink-900)]">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 text-[11px] leading-[1.4] text-[var(--ink-500)]">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {note && (
            <p className="mx-1 mt-1 border-t border-[var(--border-hairline)] px-1.5 pb-1 pt-2 text-[11px] leading-[1.5] text-[var(--ink-400)]">
              {note}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
