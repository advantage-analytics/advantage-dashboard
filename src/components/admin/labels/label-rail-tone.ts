/**
 * The points rail's two grounds (`label-black-rail.tsx`): `dark` is the black
 * full-screen view's and the film view's, `light` a white card inside the
 * admin page. ONE rail — the same markup and the same class strings — in
 * both; only the palette under it changes, and this file is that palette.
 *
 * ── How one set of classes paints two grounds ───────────────────────────────
 *
 * The rail's rows are written in white-at-an-alpha (`text-white/45`,
 * `bg-white/[0.06]`, `border-white/50`), which Tailwind v4 compiles to
 * `color-mix(in oklab, var(--color-white) 45%, transparent)` — and plain
 * `text-white` to `var(--color-white)`. So the light tone re-points that ONE
 * variable at the page's ink:
 *
 *     [--color-white:var(--ink-900)]
 *
 * and every "white" inside the rail becomes ink at the same alpha, on white.
 * No class string changes, so nothing that pins the dark classes moves.
 *
 * What follows from that, for anyone writing a row:
 *
 *  · "white" in the rail means THE RAIL'S INK, not the colour white. A thing
 *    that must be white on both grounds — a letter on a `--blue` fill, the
 *    words on the dark "Now playing" pill — reads `--rail-on-accent`.
 *  · Never `bg-white` for a ground in here: in the light tone it is ink. The
 *    rail's ground is `--rail-ground`, or a DS surface token.
 *  · A colour written outside a class — a `style`, a shadow, a gradient —
 *    does not go through Tailwind, so it says the same thing by hand:
 *    `railInk(0.45)`, or the same `color-mix(…)` inside an arbitrary class.
 *  · The variables are INHERITED, so they stop at a portal. A menu opened
 *    from the rail takes the rail's tone as its own prop (`FloatMenu`'s
 *    `tone`); anything else portalled that uses these classes wears
 *    `RAIL_TONE_CLASS[tone]` on a wrapper of its own (the note popover).
 *
 * The amber is the frame's in the dark tone (not a palette colour, so
 * written as rgba) and the design system's warning triple in the light one.
 */

export type RailTone = "dark" | "light";

/**
 * The palette, as whole-literal classes for the element the rail sits in.
 * `LabelBlackRail` wears it on its own wrapper, so a rail is painted right
 * wherever it is mounted; a view may wear it on its `<aside>` as well, for
 * chrome of its own drawn in the same inks.
 *
 *  · `--rail-ground` — what the rail sits on, for a patch that has to cover
 *    the row under it (the shot row's requests).
 *  · `--rail-on-accent` — white on both grounds.
 *  · `--rail-amber` — the open mark's text and glyph; `-wash-faint`, `-wash`
 *    and `-wash-strong` its three fills (a slot, a chip, a chip reached
 *    for); `-line` the slot's dashed edge.
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

/**
 * The chrome of a field or a trigger drawn INSIDE the rail, in both tones:
 * the compact "dark" recipe (`FIELD_DARK`, the 22px ⋯, the band's trigger),
 * sized for the rail's rows. Its whites follow the palette above, so on the
 * light ground it is an ink wash in an ink hairline; the light table's own
 * recipe is a third wider than these tracks. The MENU such a control opens is
 * portalled, so it takes the rail's real tone.
 */
export const RAIL_CHROME_TONE = "dark" as const;
