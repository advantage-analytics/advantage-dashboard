/**
 * The points rail's two grounds: `dark` is the full-screen view's, `light` a
 * white card inside the admin page. One rail, the same markup and class
 * strings, in both; this file is the palette under it.
 *
 * The rows are written in white-at-an-alpha (`text-white/45`,
 * `bg-white/[0.06]`), which Tailwind v4 compiles to `color-mix(in oklab,
 * var(--color-white) 45%, transparent)`. The light tone re-points that one
 * variable at the page's ink:
 *
 *     [--color-white:var(--ink-900)]
 *
 * So, for anyone writing a row:
 *
 * - "White" in the rail means the rail's ink. A thing that must be white on
 *   both grounds reads `--rail-on-accent`; the rail's ground is
 *   `--rail-ground`.
 * - A colour written outside a class (a `style`, a shadow, a gradient) says the
 *   same thing by hand: `railInk(0.45)`.
 * - The variables are inherited, so they stop at a portal. A menu takes the
 *   rail's tone as its own prop (`FloatMenu`'s `tone`); anything else portalled
 *   wears `RAIL_TONE_CLASS[tone]` on a wrapper.
 *
 * The amber is an rgba in the dark tone and the design system's warning triple
 * in the light one.
 */

export type RailTone = "dark" | "light";

/**
 * The palette, as whole-literal classes for the element the rail sits in.
 *
 * - `--rail-ground`: what the rail sits on, for a patch that has to cover the
 *   row under it.
 * - `--rail-on-accent`: white on both grounds.
 * - `--rail-amber`: the open mark's text and glyph; `-wash-faint`, `-wash` and
 *   `-wash-strong` its three fills; `-line` the slot's dashed edge.
 */
export const RAIL_TONE_CLASS: Record<RailTone, string> = {
  dark: "[--rail-ground:var(--surface-dark)] [--rail-on-accent:rgb(255,255,255)] [--rail-amber:rgba(252,211,77,1)] [--rail-amber-wash-faint:rgba(253,230,138,0.06)] [--rail-amber-wash:rgba(253,230,138,0.14)] [--rail-amber-wash-strong:rgba(253,230,138,0.22)] [--rail-amber-line:rgba(252,211,77,0.45)]",
  light:
    "text-[var(--ink-900)] [--color-white:var(--ink-900)] [--rail-ground:var(--surface-card)] [--rail-on-accent:rgb(255,255,255)] [--rail-amber:var(--warning-text)] [--rail-amber-wash-faint:var(--warning-bg)] [--rail-amber-wash:var(--warning-bg)] [--rail-amber-wash-strong:var(--warning-border)] [--rail-amber-line:var(--warning-border)]",
};

/**
 * The rail's ink at an alpha, for a colour set outside a class: white on the
 * dark ground, the page's ink on the light one — exactly what `text-white/45`
 * compiles to, so a `style` and a class beside it agree.
 */
export function railInk(alpha: number): string {
  return `color-mix(in oklab, var(--color-white) ${+(alpha * 100).toFixed(2)}%, transparent)`;
}

/** The rail's amber at an alpha — the slot's glyph, a suggested stroke's ink. */
export function railAmber(alpha: number): string {
  return `color-mix(in oklab, var(--rail-amber) ${+(alpha * 100).toFixed(2)}%, transparent)`;
}
