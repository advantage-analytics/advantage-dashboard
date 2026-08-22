/**
 * The design system's action button, as classes.
 *
 * A transcription of `.adv-btn` from Advantage Design System v2, so a `<Link>`
 * and a `<button>` can both be the same button without one of them being a
 * hand-rolled approximation. Every value below is the DS rule, not a nearby
 * one:
 *
 *   .adv-btn          inline-flex, 8px gap, 1px transparent border, weight 500,
 *                     radius-button, 200ms on colour, 80ms on transform
 *   :focus-visible    box-shadow: var(--focus-ring)
 *   :active           scale(0.97), suppressed under reduced motion
 *   :disabled         opacity 0.5, pointer-events none
 *   sm / md / lg      32 / 36 / 44px
 *   primary           Signal Blue, white label, the CTA glow, blue-hover
 *   outline           card surface, field border, ink-700, wash on hover
 *   ghost             transparent, field border, wash on hover
 *   danger            transparent, danger-tinted border and label
 *   danger-solid      filled danger, white label — confirmed destruction
 *
 * Primary is blue. It was worth writing down: the claim flow shipped with a
 * near-black primary, which reads as a system button rather than as the
 * product's one accent, and left the collegiate onboarding the only surface in
 * the app whose main action did not look like the main action everywhere else.
 *
 * The `lg` size drops the DS's 1px tracked label, matching the decision already
 * recorded in `auth-button.tsx`.
 */
export type AdvButtonVariant =
  | "primary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-solid";
export type AdvButtonSize = "sm" | "md" | "lg";

const BASE = [
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2",
  // Width only. The colour belongs to the variant: two `border-*` utilities on
  // one element are one property, and Tailwind's own ordering — not the order
  // they appear in this string — decides which survives. `border-transparent`
  // here silently won over the outline variant's border and produced an
  // invisible outline button.
  "whitespace-nowrap rounded-[var(--radius-button)] border",
  "font-medium outline-none",
  // The DS transition — colour over 200ms, the press over 80ms. `transition-all`
  // would animate the press at 200ms, which reads as a bounce. `scale` is
  // listed beside `transform` because Tailwind compiles `scale-[0.97]` to the
  // standalone `scale` property, which a `transform`-only transition never
  // touches.
  "[transition:background-color_var(--duration-hover),color_var(--duration-hover),border-color_var(--duration-hover),box-shadow_var(--duration-hover),transform_80ms_ease-out,scale_80ms_ease-out]",
  "focus-visible:shadow-[var(--focus-ring)]",
  "active:not-disabled:scale-[0.97] motion-reduce:active:scale-100",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

const SIZES: Record<AdvButtonSize, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-9 px-4 text-[13px]",
  lg: "h-11 px-5 text-[13px]",
};

const VARIANTS: Record<AdvButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--blue)] text-white shadow-[var(--shadow-cta-glow)] hover:bg-[var(--blue-hover)]",
  // Hover is a surface wash and nothing else. It used to also turn the border
  // and the label blue, which is not what the design system says and read as a
  // second primary sitting next to the real one — the whole point of "one
  // accent, one purpose" is that blue means THE action on a surface. v3's
  // `.adv-btn-outline:hover` is `background: var(--surface-subtle)`, full stop.
  outline:
    "border-[var(--border-field)] bg-[var(--surface-card)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
  ghost:
    "border-[var(--border-field)] bg-transparent text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
  // Destructive, in two weights. `danger` proposes; `danger-solid` is the
  // confirmed one, and belongs only where the person has already been told what
  // they are about to lose.
  danger:
    "border-[var(--danger-tint-15)] bg-transparent text-[var(--danger)] hover:bg-[var(--danger-tint-15)]",
  "danger-solid":
    "border-transparent bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)]",
};

export function advButton(
  variant: AdvButtonVariant = "primary",
  size: AdvButtonSize = "md"
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}
