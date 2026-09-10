"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import {
  advField,
  type AdvFieldKind,
  type AdvFieldSize,
} from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * The design system's `Select`, as one component.
 *
 * The sibling of `advButton()` and `advField()`, and written for the same
 * reason they were: before this file, six near-identical native-select
 * wrappers each hand-rolled the same control and each got a different subset
 * of it right — `ProfileSelect` (settings/profile-form.tsx),
 * `UnderlineSelect` (team/player-fields.tsx), `ClaimSelect`
 * (claim/claim-shell.tsx) and the two bare `<select>`s inside
 * `edit-match-dialog.tsx`'s `UnderlineField`. Measured across those five: two
 * recoloured their rule on focus but never thickened it (DS: 1px hairline →
 * **2px** `--blue`), three set `appearance-none` and put nothing back where
 * the browser's arrow had been, leaving a select with no affordance at all,
 * and the value ran at 13px in three places and 14px in two.
 *
 * ── Why a native `<select>` and not Radix ───────────────────────────────────
 * `src/components/ui/select.tsx` (Radix) has zero importers, deliberately.
 * The rationale is recorded at `settings-inline-select.tsx` and
 * `player-fields.tsx`: on a phone the platform picker beats anything we would
 * build, and keyboard handling, type-ahead and screen-reader semantics come
 * for free rather than having to be re-earned. Every one of these is a form
 * somebody fills in once. So this wraps the native control and restyles it; it
 * does not build a listbox. The one thing that costs us is the browser's own
 * arrow — a stacked pair on macOS, the single mark on these forms that no
 * token describes — so `appearance-none` removes it and a 13px Lucide chevron
 * in `--ink-500` stands in, `pointer-events-none` so a click on the glyph
 * still opens the select underneath.
 *
 * ── The three kinds ─────────────────────────────────────────────────────────
 * `underline` and `boxed` are `advField()`'s two kinds, unchanged — this file
 * adds no chrome of its own to either, so a select and the input beside it are
 * the same field by construction rather than by two authors agreeing.
 *
 * `bare` is the third case and it is not a loophole: `edit-match-dialog`'s
 * `UnderlineField` draws the rule itself, as a sibling `<div>` that thickens
 * and turns blue on `group-focus-within`. A select that also drew
 * `advField("underline")`'s own `border-b` would put two rules under one
 * field. So `bare` emits no chrome and no type scale — the wrapper owns both —
 * and this component contributes only the chevron, the placeholder ink and
 * the focus opt-out. It is why `bare` deliberately does not force 13px: that
 * dialog runs at 14px throughout, and a 13px select in a row of 14px inputs
 * is a worse defect than the one being fixed. Retiring that 14px is a
 * dialog-wide change, not a select change.
 *
 * ── Focus: opted out, but only where that is earned ─────────────────────────
 * `src/styles/design-system/focus.css` gives every native `<select>` the
 * `--focus-ring-field` box-shadow unless it carries `data-focus-ring="none"`,
 * and it does so from an unlayered rule — so a `focus-visible:` utility
 * written here would be silently discarded, not merely overridden. This
 * component therefore sets the attribute rather than a class, and sets it for
 * exactly the two kinds that earn it:
 *
 *   underline / bare  opt out — the rule under the field visibly thickens to
 *                     2px `--blue` on focus, and that change IS the one
 *                     indicator WCAG 2.4.7 (AA) asks for. A ring stacked on
 *                     top of it is decoration, and reads on screen as a stray
 *                     box sitting on a field that had already answered.
 *   boxed             keeps the ring. Its border does NOT change on focus, so
 *                     removing the ring would take the field from one
 *                     indicator to zero — the exact failure focus.css exists
 *                     to prevent.
 *
 * The attribute is set from `kind` and not accepted as a prop for that reason:
 * the opt-out is earned by an on-focus change the control actually makes, and
 * leaving it to the caller is how a boxed select ends up silently
 * unfocusable-looking. A caller that needs the ring somewhere else puts it on
 * a wrapper, as `claim/program-search.tsx` does.
 */
export type AdvSelectKind = AdvFieldKind | "bare";

export interface AdvSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  kind?: AdvSelectKind;
  /**
   * `advField()`'s size tier, forwarded to the `boxed` kind only — the
   * underline family is one height everywhere it appears. Named `fieldSize`
   * rather than `size` so it sits beside the native `<select size>` attribute
   * (a row count) instead of shadowing it.
   */
  fieldSize?: AdvFieldSize;
  /** Classes for the positioning wrapper the chevron is anchored to. */
  wrapperClassName?: string;
  /**
   * Classes for the chevron itself.
   *
   * Exists for `bare`, where the wrapper owns the chrome and pads the select
   * in ways this file cannot see: `edit-match-dialog`'s `UnderlineField` puts
   * `pb-1.5` on the value so it clears the rule below, which lifts the text
   * off its own box centre and leaves a vertically centred glyph reading low.
   * The caller knows that offset; this component does not. Merged after the
   * default positioning so a caller can override the translate.
   */
  chevronClassName?: string;
}

/**
 * Right padding that keeps a long option label from running under the glyph.
 * The chevron is inset further on `boxed` because that kind already carries
 * `px-3`, so the glyph sits inside the box's own gutter rather than on its
 * edge.
 */
const CHEVRON_INSET: Record<AdvSelectKind, string> = {
  boxed: "right-3",
  underline: "right-0",
  bare: "right-0",
};

const VALUE_PADDING: Record<AdvSelectKind, string> = {
  boxed: "pr-9",
  underline: "pr-6",
  bare: "pr-6",
};

export function AdvSelect({
  kind = "underline",
  fieldSize = "md",
  className,
  wrapperClassName,
  chevronClassName,
  children,
  ...props
}: AdvSelectProps) {
  // Grey ink for an unchosen value, matching a placeholder on a text field.
  // Keyed on the empty string because that is what every call site uses for
  // its "not set" option, and only when `value` is actually controlled — an
  // uncontrolled select has no value to read here and keeps its own ink.
  const isPlaceholder = props.value === "";

  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        {...props}
        // Not a prop: see the focus note above — the opt-out is earned by the
        // rule this kind draws, not chosen by the caller.
        data-focus-ring={kind === "boxed" ? undefined : "none"}
        className={cn(
          kind === "bare"
            ? "bg-transparent outline-none"
            : advField(kind, fieldSize),
          "w-full cursor-pointer appearance-none",
          VALUE_PADDING[kind],
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
          // After `className` on purpose. The caller's ink is the ink of a
          // *chosen* value; the placeholder ink has to outrank it or a call
          // site that sets its own text colour silently loses the grey. `cn`
          // resolves the pair through tailwind-merge, so only one lands —
          // ordering here is the whole mechanism, not a tiebreak.
          isPlaceholder && "text-[var(--ink-400)]",
        )}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 size-[13px] -translate-y-1/2 text-[var(--ink-500)]",
          CHEVRON_INSET[kind],
          props.disabled && "opacity-50",
          chevronClassName,
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </div>
  );
}
