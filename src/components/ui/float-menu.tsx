"use client";

import { createContext, useContext } from "react";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Phase 2A: the dark scope the fullscreen court viewer draws its chrome on
 * (`viz-fullscreen.tsx`, not built by this file). `tone` lives on `FloatMenu`
 * itself and is threaded to every row/label/divider/note it renders via
 * context, rather than a `tone` prop repeated on each of those — a menu's
 * rows never mix tones, so there is nothing for a per-row prop to express
 * that the surface's own tone doesn't already say. Default `"light"`
 * everywhere; light output is unchanged.
 */
export type FloatMenuTone = "light" | "dark";

const FloatMenuToneContext = createContext<FloatMenuTone>("light");

function useFloatMenuTone(): FloatMenuTone {
  return useContext(FloatMenuToneContext);
}

/**
 * Pure so a test can assert on it without rendering: the surface classes
 * `FloatMenu`'s `PopoverContent` wears for each tone. Light is byte-for-byte
 * what this file always shipped (`rounded-[10px] p-[5px] shadow-[...]`);
 * dark is the f4b-report P2d/P2e/P2f/P2g/P2h surface — `rgba(13,13,13,.88)`,
 * 10px blur, a 10%-white hairline, `--shadow-dropdown`.
 */
export function floatMenuToneClasses(tone: FloatMenuTone = "light"): string {
  if (tone === "dark") {
    return "rounded-[10px] p-[5px] border border-white/10 bg-[rgba(13,13,13,0.88)] backdrop-blur-[10px] shadow-[var(--shadow-dropdown)]";
  }
  return "rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]";
}

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
  side = "bottom",
  sideOffset = 4,
  width = 232,
  tone = "light",
  label,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opens it. Rendered as-is (`asChild`); give it `aria-expanded`. */
  trigger: React.ReactElement;
  align?: "start" | "center" | "end";
  /** Which edge of the trigger the menu opens from. The viewer's bottom-slab
   * triggers open upward (`"top"`) because the trigger sits on the floor of
   * the screen. */
  side?: "top" | "bottom";
  sideOffset?: number;
  /** A pixel width, or `"trigger"` to match the element it opens from. */
  width?: number | "trigger";
  /** The light dashboard surface, or the dark fullscreen-viewer chrome
   * (Phase 2A). Threaded to every row/label/divider/note via context. */
  tone?: FloatMenuTone;
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
        side={side}
        sideOffset={sideOffset}
        className={cn(
          floatMenuToneClasses(tone),
          width === "trigger" &&
            "w-[var(--radix-popover-trigger-width)] min-w-[212px]",
          className,
        )}
        style={typeof width === "number" ? { width } : undefined}
      >
        <FloatMenuToneContext.Provider value={tone}>
          <div role="menu" aria-label={label} className="flex flex-col">
            {children}
          </div>
        </FloatMenuToneContext.Provider>
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
  // P2d: the dark surface's check is 12px, one px under light's 13px — its
  // own row padding is a touch tighter too. Signal Blue either way; the
  // check is the one colour that means "chosen" on both surfaces.
  const dark = useFloatMenuTone() === "dark";
  return (
    <span
      aria-hidden="true"
      className={cn("flex w-[13px] shrink-0 justify-center", className)}
    >
      {chosen ? (
        <Check
          className={cn(dark ? "size-3" : "size-[13px]", "text-[var(--blue)]")}
          strokeWidth={2}
        />
      ) : null}
    </span>
  );
}

/**
 * One row. `chosen` draws the check at the right edge; `description` is the
 * second line — use it when the label alone would not tell a coach what
 * they are choosing ("Staff"), and leave it off when it would ("Clay").
 *
 * Omit `chosen` ENTIRELY for an action row: `role="menuitem"`, no
 * `aria-checked`, and no check gutter. `chosen={false}` is a different
 * thing — an unselected *option*, which keeps the gutter so the check can
 * appear later without shifting the text.
 *
 * `disabled` is for a row the menu shows but cannot act on yet — pair it with
 * a `FloatMenuNote` saying so. The row stays a focusable `<button>` with
 * `aria-disabled` (never the `disabled` attribute), so keyboard and
 * screen-reader users still find it in the menu and hear that it is
 * unavailable (ARIA APG: disabled menu items may stay focusable); a click,
 * Enter or Space does nothing because `onSelect` is never wired to it.
 */
type FloatMenuItemBase = {
  label: string;
  description?: string;
  /** Shown, dimmed and inert: `aria-disabled`, no wash, `onSelect` never called. */
  disabled?: boolean;
  onSelect: () => void;
  /** A 12px leading glyph. Does not by itself make the row an action row —
   *  see `isAction` below. */
  icon?: React.ReactNode;
  /** A trailing glyph for a row that opens something (a chevron); no chosen state. */
  trailing?: React.ReactNode;
  className?: string;
  /**
   * Merged onto the DESCRIPTION line only. A narrow escape hatch, added for
   * one caller: `film/film-dark-menu.tsx` restores the film room's own
   * pre-existing description ink and label gap, which `className` (which
   * lands on the button) cannot reach. RULING — the film room was never
   * asked to be restyled; folding its rows into this component must not
   * change how it looks. Nothing else should need this.
   */
  descriptionClassName?: string;
};

/**
 * `chosen` and `trailing` are mutually exclusive, as a type: a row is either
 * a selectable option (optionally `chosen`, right edge is `ChosenCheck`) or
 * an action row with a trailing glyph (a chevron opening a sub-panel — the
 * film's "Advanced filters…" row) with nothing to mark as selected. Folded
 * in from `film-dark-menu.tsx`'s hand-built row (Phase 2A) rather than left
 * as that file's own copy.
 */
type FloatMenuItemProps = FloatMenuItemBase &
  (
    | { chosen?: boolean; trailing?: never }
    | { trailing: React.ReactNode; chosen?: never }
  );

export function FloatMenuItem({
  label,
  description,
  chosen,
  disabled = false,
  onSelect,
  icon,
  trailing,
  className,
  descriptionClassName,
}: FloatMenuItemProps) {
  const dark = useFloatMenuTone() === "dark";
  // `Boolean`, not `!= null`: `icon={cond && <X/>}` with a false condition
  // used to count as an icon and silently turn a select row into an action
  // one, plus leave an empty 12px leading slot.
  const hasIcon = Boolean(icon);
  // A row is an action row — no chosen state, `role="menuitem"` — when it
  // carries a trailing glyph, or simply never passed `chosen` at all (the
  // film wrapper's documented contract: "omit `chosen` for an action row").
  // A select row always passes `chosen` explicitly (even `chosen={false}`
  // for an unselected option), so `chosen === undefined` is an unambiguous
  // signal here, not a default being elided.
  //
  // A leading ICON no longer forces an action row (final review #8): the
  // chart menu's Heat row carries a flame glyph AND is selectable, and
  // suppressing its check meant the one chart row that could not show it was
  // chosen. An icon says what the row IS; the check says whether it is
  // picked. They are different edges of the row and different questions.
  const isAction = trailing != null || chosen === undefined;
  const resolvedChosen = chosen ?? false;
  return (
    <button
      type="button"
      role={isAction ? "menuitem" : "menuitemradio"}
      aria-checked={isAction ? undefined : resolvedChosen}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[7px] py-[7px] text-left transition-colors duration-100",
        dark ? "px-[9px]" : "px-2.5",
        dark
          ? "focus-visible:bg-white/[0.08] focus-visible:outline-none"
          : "focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
        // P2d: the dark surface washes the CHOSEN row too, not just hover —
        // light never has a persistent chosen wash (the check alone marks
        // it), so this only ever applies on the dark branch.
        dark
          ? resolvedChosen
            ? "bg-white/[0.08]"
            : "hover:bg-white/[0.08]"
          : !resolvedChosen && "hover:bg-[var(--surface-subtle)]",
        // A disabled + chosen dark row must not keep the persistent chosen
        // wash above — disabled rows never look "acted upon". Placed after
        // that branch so tailwind-merge's last-write-wins picks this one.
        disabled && "bg-transparent",
        // A disabled row takes no wash on hover OR keyboard focus: the wash is
        // what says "this row acts", and `cn`'s tailwind-merge drops the two
        // `--surface-subtle` classes above in favour of these later ones.
        // The system focus ring (`focus.css`, a box-shadow on the button)
        // still draws, so a keyboard user can see where they are. The dimming
        // goes on the row's children rather than the button for the same
        // reason — opacity on the button would fade that ring to 45% with it.
        disabled &&
          "cursor-default *:opacity-45 hover:bg-transparent focus-visible:bg-transparent",
        className,
      )}
    >
      {hasIcon ? (
        <span className="mt-[3px] w-3 shrink-0 text-[var(--blue)]">{icon}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "text-[12px]",
            dark ? "text-white" : "text-[var(--ink-900)]",
          )}
        >
          {label}
        </span>
        {description ? (
          <span
            className={cn(
              "mt-0.5 text-[11px] leading-[1.4]",
              dark ? "text-white/50" : "text-[var(--ink-500)]",
              descriptionClassName,
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
      {/* Pinned to the label's line, not centred on a two-line row. */}
      {trailing ? (
        <span
          className={cn(
            "mt-[2px] flex w-3 shrink-0 items-center justify-center",
            dark ? "text-white/50" : "text-[var(--ink-400)]",
          )}
        >
          {trailing}
        </span>
      ) : (
        // The gutter renders for every selectable row (so a check appearing
        // never shifts the text) and for a plain action row with no leading
        // glyph, which is how it has always drawn. An icon-only action row
        // still gets nothing.
        (!isAction || !hasIcon) && (
          <ChosenCheck chosen={resolvedChosen} className="mt-[2px]" />
        )
      )}
    </button>
  );
}

/**
 * The closing sentence — what this menu deliberately cannot do.
 *
 * `className`/`dividerClassName` exist for `film/film-dark-menu.tsx` alone,
 * which restores the film room's own pre-existing note ink, padding and
 * divider alpha (see `descriptionClassName` above for the ruling).
 */
export function FloatMenuNote({
  children,
  className,
  dividerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  dividerClassName?: string;
}) {
  const dark = useFloatMenuTone() === "dark";
  if (dark) {
    return (
      <>
        <FloatMenuDivider className={dividerClassName} />
        <p
          className={cn(
            "px-[9px] pt-[6px] pb-[7px] text-[11px] leading-[1.5] text-white/45",
            className,
          )}
        >
          {children}
        </p>
      </>
    );
  }
  return (
    <p
      className={cn(
        "mx-1 mt-1 border-t border-[var(--border-hairline)] px-1.5 pt-2 pb-1 text-[11px] leading-[1.5] text-[var(--ink-400)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A hairline between groups of items. */
export function FloatMenuDivider({ className }: { className?: string } = {}) {
  const dark = useFloatMenuTone() === "dark";
  if (dark) {
    return (
      <div
        aria-hidden="true"
        className={cn("my-[5px] h-px bg-white/[0.12]", className)}
      />
    );
  }
  return (
    <div
      className={cn("mx-2 my-1 h-px bg-[var(--border-hairline)]", className)}
    />
  );
}

/**
 * A section label above a group of rows — "Saved views" / "All views" in
 * `cut-menu.tsx`. New in Phase 2A: it existed before only as an inline `<p>`
 * at each call site; pulled out here so the dark tone (P2e: `padding:7px 9px
 * 5px`, 11px, 50%-white) doesn't have to be re-derived at every call site,
 * and so a future light call site gets it for free too. The light branch is
 * the exact markup those call sites already used — replacing the inline
 * `<p>` with this component is a no-op on screen.
 */
export function FloatMenuLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  /** For `film/film-dark-menu.tsx` only — see `FloatMenuItem`'s
   *  `descriptionClassName`. */
  className?: string;
}) {
  const dark = useFloatMenuTone() === "dark";
  if (dark) {
    return (
      <p
        className={cn(
          "px-[9px] pt-[7px] pb-[5px] text-[11px] text-white/50",
          className,
        )}
      >
        {children}
      </p>
    );
  }
  return (
    <p
      className={cn(
        "px-2.5 pt-1 pb-1 text-[11px] text-[var(--ink-400)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * The caption over a group of rows in a menu with more than one (Show points /
 * Serve). Sentence case, not an eyebrow — 11px `--ink-500`.
 */
export function FloatMenuCaption({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-[9px] pt-[7px] pb-[5px] text-[11px] text-[var(--ink-500)]">
      {children}
    </span>
  );
}
