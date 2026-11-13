import {
  countAdminTeamViews,
  countTeamsJoinedSince,
  listAdminTeamFacets,
  listAdminTeams,
  type AdminTeamsSort,
  type AdminTeamsView,
} from "@/lib/data/admin-teams-server";
import {
  countAdminPilots,
  listAdminPilots,
} from "@/lib/data/admin-pilots-server";
import { isFresh, lookAtSurface } from "@/lib/admin/seen-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { divisionLabel } from "@/lib/data/programs-server";
import { AdminPage } from "@/components/admin/admin-page";
import {
  TeamsPageContent,
  type TeamsPageView,
} from "@/components/admin/teams-page-content";

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

/**
 * The loader's four program views — the toolbar offers only "Programs"
 * (`on_advantage`) since T9, but an old link naming another still works — and
 * `pilots`, the "Pilot players" view, which is not a program view at all.
 */
const VIEWS = new Set<TeamsPageView>([
  "on_advantage",
  "in_pilot",
  "needs_review",
  "all",
  "pilots",
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
  const view: TeamsPageView =
    viewParam && VIEWS.has(viewParam as TeamsPageView)
      ? (viewParam as TeamsPageView)
      : "on_advantage";
  const pilotsView = view === "pilots";
  // The program view the Programs pill stands for: the one the URL names, or
  // the default while the Pilot players view is showing.
  const programsView: AdminTeamsView = pilotsView ? "on_advantage" : view;
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
  //
  // Each view loads only its own list: the Pilot players view reads
  // `listAdminPilots()` and no program page or facets, the Programs view reads
  // those and only a head count of pilots for its pill.
  const [facetValues, page, pilots, pilotCount, viewCounts, [seen, joined]] =
    await Promise.all([
      pilotsView ? null : listAdminTeamFacets(),
      pilotsView
        ? null
        : listAdminTeams({
            view: programsView,
            sort,
            after: one(params.after),
            filters,
          }),
      pilotsView ? listAdminPilots() : null,
      pilotsView ? null : countAdminPilots(),
      countAdminTeamViews(filters),
      seenRead.then(
        async (seen) => [seen, await countTeamsJoinedSince(seen)] as const,
      ),
    ]);
  const rows = page?.rows ?? [];

  // Booleans only cross to the client; the seen state stays here.
  const fresh = rows
    .filter((row) => isFresh(seen, row.id, row.claimedAt))
    .map((row) => row.id);

  const identity = (value: string) => ({ value, label: value });

  return (
    <AdminPage>
      <TeamsPageContent
        rows={rows}
        pilots={pilots ?? []}
        pilotCount={pilots ? pilots.length : pilotCount}
        freshIds={fresh}
        joinedCount={joined}
        viewCounts={viewCounts}
        nextCursor={page?.nextCursor ?? null}
        view={view}
        sort={sort}
        cut={cut}
        facets={{
          divisions: (facetValues?.divisions ?? []).map((value) => ({
            value,
            label: divisionLabel(value) ?? value,
            count: facetValues?.divisionCounts[value] ?? 0,
          })),
          conferences: (facetValues?.conferences ?? []).map((value) => ({
            value,
            label: value,
            count: facetValues?.conferenceCounts[value] ?? 0,
          })),
          states: (facetValues?.states ?? []).map(identity),
        }}
      />
    </AdminPage>
  );
}
