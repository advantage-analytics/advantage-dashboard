/**
 * "Use for future matches" — whether the details step offers to save the
 * player's hand and backhand back to their roster profile, and how.
 *
 * Pure, so the three cases the design settled can be pinned by a spec:
 *
 * - **Nothing saved yet** (or only half): offered, ticked by default. The coach
 *   has just answered a question the roster could not, and answering it once
 *   per player rather than once per match is the point.
 * - **Saved and unchanged**: not offered. The fields already say "from their
 *   roster"; there is nothing to save.
 * - **Saved and changed**: offered, unticked. A match-only difference is the
 *   safe default — the saved value is what every future match prefills from,
 *   so rewriting it takes a deliberate tick.
 *
 * A half-saved profile whose one saved value the coach kept is "nothing saved"
 * (completing it), not "changed". Both answers must be present before anything
 * is offered: the wizard requires both, and a half-answer is not a style.
 *
 * No React, no Supabase — the hook's submit path and the details step both
 * call it, so the checkbox on screen and the write behind it cannot disagree.
 */

import type { Backhand, Hand } from "@/lib/matches/patch-match";

export type SavedStyle = {
  hand: Hand | null;
  backhand: Backhand | null;
};

export type StyleSaveOffer = {
  mode: "save" | "update";
  defaultChecked: boolean;
};

export function styleSaveOffer(
  saved: SavedStyle | null,
  hand: string | undefined,
  backhand: string | undefined,
): StyleSaveOffer | null {
  if (!hand || !backhand) return null;
  const changed =
    (saved?.hand != null && saved.hand !== hand) ||
    (saved?.backhand != null && saved.backhand !== backhand);
  if (changed) return { mode: "update", defaultChecked: false };
  if (saved?.hand != null && saved.backhand != null) return null;
  return { mode: "save", defaultChecked: true };
}

/**
 * The coach's tick, remembered against the offer it answered. A tick given to
 * "save" says nothing about "update" (the default flips between them), so a
 * choice made under the other mode reads as no choice at all. A flat string
 * rather than an object because form fields travel through the wizard's
 * primitive-valued `onInputChange`.
 */
export type StyleSaveChoice = `${StyleSaveOffer["mode"]}:${"on" | "off"}`;

export function styleSaveChoice(
  mode: StyleSaveOffer["mode"],
  checked: boolean,
): StyleSaveChoice {
  return `${mode}:${checked ? "on" : "off"}`;
}

export function styleSaveChecked(
  offer: StyleSaveOffer | null,
  choice: StyleSaveChoice | undefined,
): boolean {
  if (!offer) return false;
  if (choice === `${offer.mode}:on`) return true;
  if (choice === `${offer.mode}:off`) return false;
  return offer.defaultChecked;
}

/** "Maya Rodriguez" → "Maya". A one-word name is its own first name. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
