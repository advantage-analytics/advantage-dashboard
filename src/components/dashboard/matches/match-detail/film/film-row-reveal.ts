/**
 * How a point row reveals its trailing action (handoff F3) — the Video tab's
 * recipe, lifted out of `point-list.tsx`'s `ROW_TONE` so the labelling
 * console's rail (`admin/labels/label-black-point-row.tsx`) reveals its ⋯
 * the same way rather than by a copy of these strings.
 *
 * The row is `group/row`. The action sits over the row's right edge, out of
 * flow, and fades in (`opacity`, 200ms, the default curve); the score slides
 * 26px left out from under it (`transform`, 200ms, `--ease-primary`) — on
 * hover and on focus anywhere in the row. Nothing changes width, so no
 * column re-lays. A row whose action is lit at rest (a saved point's
 * bookmark; the rail's playing row) holds both: the score stays aside and
 * the action stays at full opacity.
 *
 * Reduced motion: the slide is `motion-safe:` only — the score stays put and
 * the action fades in over the row's edge. The fade itself stays.
 *
 * Whole string literals: Tailwind reads these classes off this file.
 */

/** The score's transition — the slide's duration and curve. */
export const FILM_ROW_SLIDE_TRANSITION =
  "transition-transform duration-200 ease-[var(--ease-primary)]";

/** The score, slid aside for good: the action is lit at rest. */
export const FILM_ROW_SLIDE_HELD = "-translate-x-[26px]";

/** The score, sliding aside while the row is hovered or holds focus. */
export const FILM_ROW_SLIDE_ON_REACH =
  "motion-safe:group-focus-within/row:-translate-x-[26px] motion-safe:group-hover/row:-translate-x-[26px]";

/** The action's transition, and its own keyboard focus showing it. */
export const FILM_ROW_ACTION_TRANSITION =
  "transition-opacity duration-200 focus-visible:opacity-100";

/** The action, lit at rest. */
export const FILM_ROW_ACTION_HELD = "opacity-100";

/** The action, hidden until the row is hovered or holds focus. */
export const FILM_ROW_ACTION_ON_REACH =
  "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100";
