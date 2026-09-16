"use server";

import {
  listAdminTeams,
  type AdminTeamsPage,
  type AdminTeamsQuery,
} from "@/lib/data/admin-teams-server";

/**
 * "Load more" on Admin › Teams, as a server action.
 *
 * The page renders one keyset page server-side; this fetches the next one so
 * the client can append it. It cannot call `listAdminTeams` directly —
 * `admin-teams-server.ts` is a loader module, not an action module, and
 * importing it from a client component would drag the service-role client into
 * the browser bundle — so this thin wrapper is the boundary. It adds nothing of
 * its own: `listAdminTeams` re-runs `requireAdminOrNotFound()` on every call,
 * which is the check a public server-action endpoint needs.
 *
 * Kept beside the components that call it, following
 * `src/components/dashboard/settings/team-actions.ts`.
 */
export async function loadMoreAdminTeams(
  query: AdminTeamsQuery,
): Promise<AdminTeamsPage> {
  return listAdminTeams(query);
}
