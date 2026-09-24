/**
 * Server-reaching imports of the Matches page, for its browser harness. Alias
 * each specifier below to this file:
 *
 * - `@/lib/wizard/actions` — `"use server"`, pulls the server Supabase client
 *   into the bundle. The draft drawer only calls `deleteMatchDraft`, which no
 *   spec here presses.
 * - `@/components/dashboard/team/roster-table` — a match row takes only
 *   `profileHref` from it, but the module reaches the team server actions
 *   (`next/cache`, `node:crypto`).
 */
export async function deleteMatchDraft(): Promise<{ error: string | null }> {
  return { error: null };
}

export function profileHref(playerId: string): string {
  return `/dashboard/team/roster/${playerId}`;
}
