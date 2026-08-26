"use client";

import { cn } from "@/lib/utils";

/**
 * The card the round-4 settings pages are built from: hairline border, card
 * radius, resting shadow, 24px of horizontal padding.
 *
 * Card-wrapped rather than flat on purpose. CLAUDE.md's "widgetless by default"
 * is about page layout; these pages are lists of unrelated groups — a quota
 * meter, a roster, three toggles — and a hairline rule between them reads as
 * "still the same thing", which is exactly wrong.
 */
export function SettingsCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[14px] border border-[var(--border-card)] px-6 py-[18px] shadow-[var(--shadow-card)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** The card's own heading: 13px medium, with optional trailing content. */
export function SettingsCardTitle({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="text-[13px] font-medium text-[var(--ink-900)]">
        {children}
      </span>
      {trailing && (
        <div className="flex flex-1 items-center justify-end gap-2.5">
          {trailing}
        </div>
      )}
    </div>
  );
}

/**
 * One row inside a card — label and optional description on the left, control
 * on the right, hairline above.
 *
 * `align` exists because a two-line row with a radio stack beside it has to
 * align to the top, while a one-line row with a toggle has to align to centre;
 * getting that wrong is the difference between a settings page and a ransom
 * note.
 */
export function SettingsCardRow({
  label,
  description,
  control,
  align = "center",
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-6 border-t border-[var(--border-hairline)] py-3",
        align === "start" ? "items-start" : "items-center",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-[var(--ink-900)]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
            {description}
          </div>
        )}
      </div>
      {control}
    </div>
  );
}

/** The closing note some cards carry: 11px, muted, above a hairline. */
export function SettingsCardFootnote({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="mt-3.5 border-t border-[var(--border-hairline)] pt-3.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
      {children}
    </span>
  );
}

/**
 * A numbered page section heading — `01 · General information`.
 *
 * Profile, Account and Plan each grew their own copy of this when
 * `settings-section.tsx` was deleted; profile's was the superset, so this is
 * that one, exported.
 */
export function SettingsSectionHeading({
  number,
  title,
  note,
}: {
  number: string;
  title: string;
  /** Right-aligned aside, e.g. "Only your name is visible to teammates". */
  note?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="mono text-[11px] text-[var(--ink-400)]">{number}</span>
      <span className="text-[14px] text-[var(--ink-900)]">{title}</span>
      {note && (
        <span className="ml-auto text-[11px] text-[var(--ink-500)]">
          {note}
        </span>
      )}
    </div>
  );
}

/**
 * The round-4 form field: 11px caption over an underlined control.
 *
 * Takes its control as children so one wrapper serves inputs and selects
 * alike — Profile and Team had four near-identical copies of this label/rule
 * pair between them, already differing by 2px of input height.
 */
export function SettingsField({
  label,
  hint,
  marker,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  /** Right of the caption, e.g. the blue MISSING tag on an empty field. */
  marker?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--ink-600)]">{label}</span>
        {marker}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--ink-500)]">{hint}</span>}
    </label>
  );
}

/**
 * The underline input itself. Separate from `SettingsField` because the Team
 * page pairs the same rule with a `<select>`, and a wrapper that owned the
 * input could not do that.
 */
export function SettingsUnderlineInput({
  mono,
  emphasis,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
  /** Swap the hairline for a 2px blue rule — a field the page is asking for. */
  emphasis?: boolean;
}) {
  return (
    <input
      data-focus-ring="none" /* the border-b above carries focus */
      className={cn(
        "h-[34px] bg-transparent text-[13px] text-[var(--ink-900)] outline-none transition-colors",
        "placeholder:text-[var(--ink-400)] focus:border-[var(--blue)]",
        emphasis
          ? "border-b-2 border-[var(--blue)]"
          : "border-b border-[var(--border-field)]",
        mono && "mono",
        className
      )}
      {...props}
    />
  );
}
