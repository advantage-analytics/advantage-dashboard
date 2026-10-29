"use server";
import { adminSearch } from "@/lib/data/admin-search-server";
import { listAdminTeams } from "@/lib/data/admin-teams-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import type { AdminUploadTargetHit } from "@/lib/admin/uploads/targets";

/**
 * "Upload for" — any team, or any player's personal workspace. Both reads
 * re-check the session (`requireAdminOrNotFound()` here, in
 * `listAdminTeams()` and in `adminSearch()`); the ids returned only name a
 * target, and the page resolves it again before anything is written.
 */
export async function searchAdminUploadTargetsAction(
  term: string,
): Promise<AdminUploadTargetHit[]> {
  await requireAdminOrNotFound();
  const query = typeof term === "string" ? term.trim().slice(0, 120) : "";
  if (!query) return [];
  const [teams, hits] = await Promise.all([
    listAdminTeams({ view: "all", limit: 8, filters: { search: query } }),
    adminSearch(query),
  ]);
  return [
    ...hits
      .filter((hit) => hit.kind === "person")
      .map((hit): AdminUploadTargetHit => ({
        kind: "player",
        id: hit.id,
        title: hit.title,
        subtitle: hit.subtitle,
        markUrl: hit.markUrl,
      })),
    ...teams.rows.map((team): AdminUploadTargetHit => ({
      kind: "team",
      id: team.id,
      title: team.name,
      subtitle:
        [team.division, team.conference].filter(Boolean).join(" · ") || null,
      markUrl: null,
    })),
  ];
}
