import { MatchesPageContent } from "@/components/admin/matches/matches-page-content";
import { lookAtSurface } from "@/lib/admin/seen-server";
import { listAdminMatches } from "@/lib/data/admin-matches-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * Admin › Matches — every match on Advantage, personal and team, newest upload
 * first, one line each: workspace, analysis status, video hours. Replaces the
 * retired Uploads tab (`/admin/uploads` redirects here).
 *
 * `?program=<programId|personal>` opens the Program filter on that workspace
 * (the team page's "All N in Matches" link); `?id=` opens a row's drawer.
 *
 * `force-dynamic`: every read is service-role and per-request, gated on the
 * current session's `is_admin`, and this render records the admin's look.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Matches" };

function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, admin] = await Promise.all([
    searchParams,
    requireAdminOrNotFound(),
  ]);
  const { rows, total } = await listAdminMatches(
    lookAtSurface(admin.id, "matches"),
  );

  return (
    <MatchesPageContent
      rows={rows}
      total={total}
      initialSelectedId={one(params.id)}
      initialProgram={one(params.program)}
    />
  );
}
