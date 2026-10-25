/**
 * Server-reaching imports of the Matches page, for its browser harness. Alias
 * each specifier below to this file:
 *
 * - `@/lib/wizard/actions` — `"use server"`, pulls the server Supabase client
 *   into the bundle. The draft drawer calls `deleteMatchDraft` from its
 *   confirm; `?discard=refused` on the harness URL makes it answer an error,
 *   and every call lands in `window.draftDiscards`.
 * - `@/components/dashboard/team/roster-table` — a match row takes only
 *   `profileHref` from it, but the module reaches the team server actions
 *   (`next/cache`, `node:crypto`).
 */
declare global {
  interface Window {
    draftDiscards: string[];
  }
}

// Read once, at load: the page mirrors the open row onto the URL
// (`replaceState` to `?draft=…`), which has dropped this flag by the time
// the confirm fires.
const REFUSE =
  new URLSearchParams(window.location.search).get("discard") === "refused";

export async function deleteMatchDraft(
  id: string,
): Promise<{ error: string | null }> {
  (window.draftDiscards ??= []).push(id);
  return { error: REFUSE ? "permission denied for table match_drafts" : null };
}

export async function deleteMatchDraftsForMatch(): Promise<void> {}

export function profileHref(playerId: string): string {
  return `/dashboard/team/roster/${playerId}`;
}
