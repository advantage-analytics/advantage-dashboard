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
import {
  countAdminConferences,
  listAdminConferences,
} from "@/lib/data/admin-conferences-server";
import { isFresh, lookAtSurface } from "@/lib/admin/seen-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { divisionLabel } from "@/lib/data/programs-server";
import { AdminPage } from "@/components/admin/admin-page";
import { TeamsPageContent } from "@/components/admin/teams-page-content";
import { teamsPageViewFrom } from "@/components/admin/teams-views";

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

  // Three pills — Programs, Pilot players, Conferences — over six `?view=`
  // values: the loader's four program views (an old link naming one still
  // reads as Programs), `pilots` and `conferences`. `teamsPageViewFrom` falls
  // back to the default for anything it does not know.
  const view = teamsPageViewFrom(one(params.view));
  const pilotsView = view === "pilots";
  const conferencesView = view === "conferences";
  const programsShown = !pilotsView && !conferencesView;
  // The program view the Programs pill stands for: the one the URL names, or
  // the default while another view is showing.
  const programsView: AdminTeamsView = programsShown ? view : "on_advantage";
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
  // Each view loads only its own list, and the other pills get head counts:
  // Programs reads a program page and the facets, Pilot players
  // `listAdminPilots()`, Conferences `listAdminConferences()` — never the
  // program page or facets off Programs, and never the conference rows off
  // Conferences (`countAdminConferences()` fills that pill instead).
  const [
    facetValues,
    page,
    pilots,
    pilotCount,
    conferences,
    conferenceCount,
    viewCounts,
    [seen, joined],
  ] = await Promise.all([
    programsShown ? listAdminTeamFacets() : null,
    programsShown
      ? listAdminTeams({
          view: programsView,
          sort,
          after: one(params.after),
          filters,
        })
      : null,
    pilotsView ? listAdminPilots() : null,
    pilotsView ? null : countAdminPilots(),
    conferencesView ? listAdminConferences() : null,
    conferencesView ? null : countAdminConferences(),
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
        conferences={conferences?.rows ?? []}
        conferenceCount={
          conferences ? conferences.rows.length : conferenceCount
        }
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
