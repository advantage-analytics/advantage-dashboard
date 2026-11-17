/**
 * The design system's blue text action: a quiet blue word that acts, for a
 * row or note that already carries the emphasis ("Got it", "Clear all").
 * 12px medium `--blue`, `--blue-hover` on hover, an underline for keyboard
 * focus. One spelling, so the hover and focus treatment cannot drift between
 * surfaces; build on it rather than restating the classes.
 */
export const TEXT_ACTION_CLASS =
  "cursor-pointer text-[12px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:underline disabled:opacity-60";
