/**
 * The design system's form field, as classes.
 *
 * The sibling of `advButton()` (`./adv-button.ts`), written for the same
 * reason: so a native `<input>`, a native `<select>` and a `<textarea>` can all
 * be the same field without any of them being a hand-rolled approximation.
 * Measured before this file existed, the app had six boxed heights
 * (38 / 36 / 32 / 30 / 28px) and three radii (10 / 8 / 6px) with no rule behind
 * the spread. Every value below is the DS rule, not a nearby one:
 *
 *   boxed             radius-button, a 1px --border-field hairline, the card
 *                     surface, px-3
 *   underline         34px tall, transparent, a --border-field bottom rule
 *                     that thickens to 2px Signal Blue on focus
 *   both              --ink-900 text, --ink-400 placeholder
 *   sm / md           32 / 36px at 12 / 13px text — advButton's own sm / md,
 *                     because "a field has to line up with the button beside
 *                     it" resolves to a table that already exists rather than
 *                     to a new number
 *
 * `size` applies to `boxed` only. The underline family was measured at one
 * height in every place it appears (settings, profile, the match-edit dialog,
 * the schedule lineup editor), so it has one tier; the parameter is accepted
 * for signature symmetry with `advButton()` and deliberately ignored there
 * rather than inventing a second underline size nobody has designed.
 *
 * ── Radius is written as a token, never as a class name ─────────────────────
 * `src/app/globals.css` opens an `@theme inline` block that redefines
 * Tailwind's whole radius scale off shadcn's `--radius: 0.625rem`, so in THIS
 * codebase `rounded-md` / `rounded-lg` / `rounded-xl` resolve to 8 / 10 / 14px
 * — not the stock 6 / 8 / 12px that the design system's Border Radius table
 * assumes when it maps `radius-element` → `rounded-lg` and `radius-dropdown` →
 * `rounded-xl`. That mapping is correct for stock Tailwind and wrong here.
 * It is why the drift was systemic rather than sloppy: nobody wrote a bug, the
 * shorthand silently resolved through a scale the design system does not know
 * about. So field radius is `rounded-[var(--radius-button)]`, and none of
 * those three names is ever emitted by this file — they appear above only to
 * be named as the trap. They are the defect, not the cure.
 *
 * ── There is deliberately no focus treatment here ───────────────────────────
 * `src/styles/design-system/focus.css` is imported by `globals.css` outside any
 * `@layer`, and unlayered CSS beats `@layer utilities` before specificity is
 * ever consulted — measured, not assumed, and documented in that file. A
 * `focus:*` or `focus-visible:*` ring, shadow or outline utility written here
 * would be silently discarded: it would look like coverage and be dead code.
 * It is also unnecessary. focus.css already resolves `input`, `select` and
 * `textarea` to the neutral `--focus-ring-field` for free, which is the design
 * system's field carve-out — blue on a focused field reads as a validation
 * state, and a six-field form would spend the accent six times over.
 *
 * Consumers of the `underline` kind add `data-focus-ring="none"` themselves.
 * It stays theirs to add because focus.css's test for that attribute is
 * whether the control's own rule visibly changes on focus — and this underline
 * does exactly that, thickening and turning blue, which IS the one indicator
 * WCAG 2.4.7 (AA) asks for; a ring on top of it is decoration, not compliance.
 * Baking the attribute into the class string would turn an earned, per-control
 * judgement into a default, and that failure is silent: a control that merely
 * LOOKS like an underline would go from one focus indicator to zero, which is
 * the exact bug focus.css exists to prevent.
 *
 * ── The disabled background ─────────────────────────────────────────────────
 * The DS colour table names this `bg-field` = `#F7F7F7`, "Disabled fields".
 * There is no `--bg-field` custom property in
 * `src/styles/design-system/colors.css`, and this file does not add one.
 * `--surface-subtle` is #F5F5F5 — two points of grey away, indistinguishable —
 * and colors.css has already merged near-twins on exactly that basis
 * (`--border-field`, `--surface-field`). More to the point, a new token would
 * owe a dark value, and that file's `.dark` block is a measured, WCAG-verified
 * set: inventing a hex in it is a design decision, not a styling pass.
 * `--surface-subtle` already has one, and it is the token `advButton()` uses
 * for its own hover wash, so the two files agree by value rather than by
 * coincidence. (`--surface-field` is an alias of it; the primary name is used
 * here, as in `advButton()`.)
 */
export type AdvFieldKind = "boxed" | "underline";
export type AdvFieldSize = "sm" | "md";

/** Shared by both kinds — the field's own ink and its placeholder. */
const BASE = "text-[var(--ink-900)] placeholder:text-[var(--ink-400)]";

const BOXED = [
  "rounded-[var(--radius-button)]",
  "border border-[var(--border-field)]",
  "bg-[var(--surface-card)] px-3",
  "disabled:bg-[var(--surface-subtle)]",
].join(" ");

const BOXED_SIZES: Record<AdvFieldSize, string> = {
  sm: "h-8 text-[12px]",
  md: "h-9 text-[13px]",
};

// Width and colour are separate utilities here on purpose, and they do not
// collide the way `advButton()`'s two `border-*` utilities once did: `border-b`
// sets only border-bottom-width, `border-[…]` sets only border-color. The focus
// pair is the same split — `focus:border-b-2` raises the width the base rule
// set, `focus:border-[var(--blue)]` recolours it — and both win at focus on
// specificity, not on the order they appear in this string.
const UNDERLINE = [
  "h-[34px] bg-transparent text-[13px]",
  "border-b border-[var(--border-field)]",
  "focus:border-b-2 focus:border-[var(--blue)]",
].join(" ");

export function advField(
  kind: AdvFieldKind = "boxed",
  size: AdvFieldSize = "md"
): string {
  return kind === "underline"
    ? `${BASE} ${UNDERLINE}`
    : `${BASE} ${BOXED} ${BOXED_SIZES[size]}`;
}
