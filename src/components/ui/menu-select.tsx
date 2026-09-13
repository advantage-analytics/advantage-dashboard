"use client";

import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { cn } from "@/lib/utils";

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  /** One line on what choosing it means. The reason this is not a native select. */
  description?: string;
}

/**
 * The select. There is no other: a native `<select>` cannot carry a second
 * line per option, and its underline on a radiused box is how a hairline
 * came to curl at both ends. Built on `FloatMenu`, so a select and an action
 * menu on the same page are visibly one family.
 *
 * Two triggers. `underline` is a form field — full width, the caption's
 * hairline beneath, no radius. `pill` is the control beside a
 * `SettingsCardRow` label — 30px, bordered. Both turn their edge Signal Blue
 * while open.
 */
export function MenuSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  variant = "pill",
  note,
  disabled = false,
  className,
  width,
  placeholder,
}: {
  /** Accessible name — the visible caption or row label sits beside it. */
  label: string;
  /**
   * `undefined` is a real, renderable state — an unanswered required field —
   * not a bug. It draws no row as chosen and shows `placeholder` in the
   * empty-field ink, rather than guessing an option or falling back to
   * printing the raw value. Callers that can pass `undefined` must supply
   * `placeholder`.
   */
  value: T | undefined;
  options: readonly MenuOption<T>[];
  onChange: (next: T) => void;
  variant?: "pill" | "underline";
  /** Sentence under a hairline at the menu's foot. */
  note?: string;
  disabled?: boolean;
  /** Extra trigger classes — a row control narrower than the default, say. */
  className?: string;
  /** Menu width. Defaults to the trigger's width for `underline`, 232px for `pill`. */
  width?: number | "trigger";
  /** Shown, in the empty-field ink, when `value` is unset. */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  // One handler for every row rather than a closure per option per render;
  // the row passes its own value back.
  const pick = useCallback(
    (next: T) => {
      setOpen(false);
      if (next !== value) onChange(next);
    },
    // `value` may be `undefined`; `next !== value` is still exactly the
    // "did this actually change" check.
    [onChange, value],
  );

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      // The underline trigger is drawn as a field — a hairline in a row of
      // underline inputs — so it answers focus the way they do: the rule goes
      // 2px blue, and that is the only mark. The button ring on top of it was
      // a second one. `focus.css` honours this attribute on actionables for
      // exactly this case; the pill keeps its ring, since its border does not
      // change on focus and a box with no change would be a box with no mark.
      data-focus-ring={variant === "underline" ? "none" : undefined}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 text-left transition-colors duration-150",
        "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        variant === "underline"
          ? // 34px, the underline family's one height (`advField("underline")`,
            // `SettingsUnderlineInput`): this trigger sat at 32 and read as a
            // 2px mistake beside any underline input in the same row.
            "h-[34px] w-full rounded-none border-b bg-transparent text-[13px] text-[var(--ink-900)] focus-visible:border-b-2 focus-visible:border-[var(--blue)]"
          : "h-[30px] shrink-0 rounded-[6px] border bg-[var(--surface-card)] px-3 text-[12px] text-[var(--ink-900)] hover:bg-[var(--surface-subtle)]",
        open
          ? variant === "underline"
            ? "border-b-2 border-[var(--blue)]"
            : "border-[var(--blue)]"
          : "border-[var(--border-field)]",
        className,
      )}
    >
      <span className={cn("truncate", !current && "text-[var(--ink-400)]")}>
        {current ? current.label : (placeholder ?? value)}
      </span>
      <ChevronDown
        className="size-3 shrink-0 text-[var(--ink-500)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      label={label}
      align={variant === "underline" ? "start" : "end"}
      width={width ?? (variant === "underline" ? "trigger" : 232)}
    >
      {options.map((option) => (
        <MenuSelectRow
          key={option.value}
          option={option}
          chosen={option.value === value}
          onPick={pick}
        />
      ))}
      {note ? <FloatMenuNote>{note}</FloatMenuNote> : null}
    </FloatMenu>
  );
}

/**
 * A row that knows its own value, so the parent needs one stable `onPick`
 * rather than a fresh arrow per option on every render.
 */
function MenuSelectRow<T extends string>({
  option,
  chosen,
  onPick,
}: {
  option: MenuOption<T>;
  chosen: boolean;
  onPick: (value: T) => void;
}) {
  const select = useCallback(
    () => onPick(option.value),
    [onPick, option.value],
  );
  return (
    <FloatMenuItem
      label={option.label}
      description={option.description}
      chosen={chosen}
      onSelect={select}
    />
  );
}
