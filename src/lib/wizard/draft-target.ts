/**
 * Which existing match a draft fills, and how the Matches table folds drafts
 * onto the matches they fill.
 *
 * A draft started from a scored event line ("Add video" on the schedule
 * drawer, `?entry=E&match=M`) or one whose details step accepted a line offer
 * is not a new match in flight: it is more work on a match that already has a
 * row. Submitting it UPDATES that row (`handleCreateMatch`'s reuse branch), so
 * listing it as a second, standalone row shows one court twice.
 *
 * Pure, no imports with side effects: the wizard hook (client), the drafts
 * server action and the specs all read the same rule from here. It cannot
 * live in `actions.ts` — a `"use server"` module may export async functions
 * only.
 */

/** The two draft fields that can name an existing match. */
export interface DraftTargetSource {
  preset?: { matchId?: string | null } | null;
  attachedLine?: { matchId?: string | null } | null;
}

/**
 * The match a draft fills, or null for a draft that will create one.
 *
 * The page's preset wins; the accepted line offer answers when the preset
 * names no match. A preset with a null `matchId` (an unscored line) falls
 * through to the offer rather than masking it.
 */
export function draftTargetMatchId(draft: DraftTargetSource): string | null {
  return draft.preset?.matchId ?? draft.attachedLine?.matchId ?? null;
}

/**
 * PostgREST JSON-path columns `listMatchDrafts` selects instead of the whole
 * `payload` jsonb: `->>` answers text, and null where either level is absent.
 */
export const DRAFT_TARGET_SELECT =
  "preset_match_id:payload->preset->>matchId, line_match_id:payload->attachedLine->>matchId";

/** The two columns `DRAFT_TARGET_SELECT` adds to a row. */
export interface DraftTargetColumns {
  preset_match_id: string | null;
  line_match_id: string | null;
}

/** `draftTargetMatchId`, answered from the JSON-path columns. */
export function draftTargetFromColumns(row: DraftTargetColumns): string | null {
  return draftTargetMatchId({
    preset: { matchId: row.preset_match_id },
    attachedLine: { matchId: row.line_match_id },
  });
}

/** Anything the fold can place: a match it fills, and when it was saved. */
export interface FoldableDraft {
  matchId: string | null;
  updatedAt: string;
}

/**
 * Split drafts into the ones that list as their own rows and the ones that
 * fold onto a listed match.
 *
 * Only a listed match's NEWEST draft folds. Everything else stays standalone:
 * a draft with no match, a draft whose match is not in `matchIds` (another
 * scope, deleted, not visible), and an older draft for a match that already
 * has one folded — each of those must still be reachable to resume or
 * discard. `standalone` keeps the input order.
 */
export function foldDrafts<T extends FoldableDraft>(
  drafts: readonly T[],
  matchIds: Iterable<string>,
): { standalone: T[]; byMatchId: Map<string, T> } {
  const listed = new Set(matchIds);
  const byMatchId = new Map<string, T>();
  for (const draft of drafts) {
    if (!draft.matchId || !listed.has(draft.matchId)) continue;
    const held = byMatchId.get(draft.matchId);
    // Parsed, not compared as text: a `+00:00` and a `Z` timestamp sort
    // wrongly as strings. A tie keeps the first seen (the list is newest-first).
    if (!held || Date.parse(draft.updatedAt) > Date.parse(held.updatedAt))
      byMatchId.set(draft.matchId, draft);
  }
  const folded = new Set(byMatchId.values());
  return {
    standalone: drafts.filter((draft) => !folded.has(draft)),
    byMatchId,
  };
}
