/**
 * The edit-match form's field rows, top to bottom, as `EditMatchDialog`
 * renders them for a one-off match once it has loaded — shared with its
 * loading state (`loading/edit-match-pending.tsx`) so the two cannot drift.
 *
 * Its own module, not an export of `edit-match-dialog.tsx`: that file is
 * `"use client"` and pulls the save path, the roster and the attach-line
 * search in with it; the skeleton needs a list of rows, not those.
 *
 * `fields` names each row's cells in order, by the caption or the name the
 * form shows on them (`tests/edit-match-pending.spec.ts` reads the form's
 * sources for each). Only rows every one-off draws are listed: the Round
 * menu (beside Court surface, when the match type has rounds) and the
 * Format · Scoring · Lets row (an unanalysed one-off) are conditional, so
 * the skeleton does not promise them. A match on a schedule line swaps the
 * Details rows for its event's sentence.
 */
export type EditMatchSection = "Score" | "Players" | "Details";

export interface EditMatchFieldRow {
  section: EditMatchSection;
  fields: readonly string[];
}

export const EDIT_MATCH_FIELD_ROWS: readonly EditMatchFieldRow[] = [
  // EditMatchScore: one row of set cells per side, named by its fallback.
  { section: "Score", fields: ["Your player"] },
  { section: "Score", fields: ["Opponent"] },
  // EditMatchPlayers: name · hand · backhand; only the first row captions
  // the two menus.
  { section: "Players", fields: ["Your player", "Hand", "Backhand"] },
  { section: "Players", fields: ["Opponent", "Hand", "Backhand"] },
  // The Details section: the Event field, then its two-column grid.
  { section: "Details", fields: ["Event"] },
  { section: "Details", fields: ["Date", "Match type"] },
  { section: "Details", fields: ["Court surface"] },
];
