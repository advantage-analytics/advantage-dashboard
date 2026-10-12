"use client";

import { createContext, use } from "react";

/**
 * Is this film room a read-only one — the public share page (`/m/[token]`)?
 *
 * `FilmTab` sets it from its `readOnly` prop and the pieces that would write
 * or ask for a session read it here: the bookmark controls (the player's, the
 * transport's, each list row's), the "Saved only" filter, the first-play view
 * report and the ball-path fetch. A context rather than a prop because those
 * pieces sit four files deep on two surfaces, and a control that missed the
 * prop would be a live button that fails for a reader with no account.
 *
 * `false` everywhere under `/dashboard`, and in every harness that mounts the
 * room without it.
 */
export const FilmReadOnlyContext = createContext(false);

export function useFilmReadOnly(): boolean {
  return use(FilmReadOnlyContext);
}
