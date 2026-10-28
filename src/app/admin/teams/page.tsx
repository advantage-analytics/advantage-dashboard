import {
  countAdminTeamViews,
  countTeamsJoinedSince,
  listAdminTeamFacets,
  listAdminTeams,
  type AdminTeamsSort,
  type AdminTeamsView,
} from "@/lib/data/admin-teams-server";
import { isFresh, lookAtSurface } from "@/lib/admin/seen-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { divisionLabel } from "@/lib/data/programs-server";
import { AdminPage } from "@/components/admin/admin-page";
import { TeamsPageContent } from "@/components/admin/teams-page-content";

/**
 * Admin › Teams — the console's front door.
 *
 * `force-dynamic` because every read here is service-role and per-request: the
 * view, the cut and the cursor all come off the URL, and `listAdminTeams`
 * gates on the *current* session's `is_admin`. A cached render would be one
 * admin's page served to whoever asked next.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Teams" };

const VIEWS = new Set<AdminTeamsView>([
  "on_advantage",
  "in_pilot",
  "needs_review",
  "all",
]);

/** First non-empty value for a param, ignoring the array form Next allows. */
function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const viewParam = one(params.view);
  // Anything unrecognised falls back to the default rather than 404ing: a
  // hand-edited or stale URL should still show the page it names.
  const view: AdminTeamsView =
    viewParam && VIEWS.has(viewParam as AdminTeamsView)
      ? (viewParam as AdminTeamsView)
      : "on_advantage";
  const sort: AdminTeamsSort =
    one(params.sort) === "name_desc" ? "name_desc" : "name_asc";

  // Teams2 offers Division and Conference menus only. `?state=` still
  // narrows when a link carries it, and the page says so in the footer.
  const cut = {
    division: one(params.division),
    conference: one(params.conference),
    state: one(params.state),
  };
  const filters = {
    division: cut.division ?? undefined,
    conference: cut.conference ?? undefined,
    state: cut.state ?? undefined,
  };

  const { id: adminId } = await requireAdminOrNotFound();
  // Once per render: reads what is New and records this look.
  const seenRead = lookAtSurface(adminId, "teams");

  // Raw facet values in, labelled options out — `divisionLabel()` lives in a
  // server module, and the strings that go back into the URL have to stay the
  // raw column values either way (see `AdminTeamsFilters`).
  const [facetValues, page, viewCounts, [seen, joined]] = await Promise.all([
    listAdminTeamFacets(),
    listAdminTeams({ view, sort, after: one(params.after), filters }),
    countAdminTeamViews(filters),
    seenRead.then(
      async (seen) => [seen, await countTeamsJoinedSince(seen)] as const,
    ),
  ]);

  // Booleans only cross to the client; the seen state stays here.
  const fresh = page.rows
    .filter((row) => isFresh(seen, row.id, row.claimedAt))
    .map((row) => row.id);

  const identity = (value: string) => ({ value, label: value });

  return (
    <AdminPage>
      <TeamsPageContent
        rows={page.rows}
        freshIds={fresh}
        joinedCount={joined}
        viewCounts={viewCounts}
        nextCursor={page.nextCursor}
        view={view}
        sort={sort}
        cut={cut}
        facets={{
          divisions: facetValues.divisions.map((value) => ({
            value,
            label: divisionLabel(value) ?? value,
            count: facetValues.divisionCounts[value] ?? 0,
          })),
          conferences: facetValues.conferences.map((value) => ({
            value,
            label: value,
            count: facetValues.conferenceCounts[value] ?? 0,
          })),
          states: facetValues.states.map(identity),
        }}
      />
    </AdminPage>
  );
}
