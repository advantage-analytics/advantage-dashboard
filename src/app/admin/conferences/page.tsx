import { listAdminConferences } from "@/lib/data/admin-conferences-server";
import type {
  AdminConferencesSort,
  AdminConferencesView,
} from "@/lib/data/admin-conferences-view";
import { DIVISION_VALUES } from "@/lib/data/programs-server";
import { ConferencesPageContent } from "@/components/admin/conferences-page-content";

/**
 * Admin › Conferences — the 137 conferences the directory points at.
 *
 * `force-dynamic` for the same reason `admin/requests/page.tsx` is: the list
 * is gated on the *current* session's `is_admin`, so a cached render would be
 * one admin's page served to whoever asked next.
 *
 * All rows load at once — there are ~137, so there is no cursor. View, sort
 * and the division filter are URL state read here and applied on the client
 * by `ConferencesPageContent`, which also renders `AdminPage` so the drawer
 * can sit in its rail.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Conferences" };

const VIEWS = new Set<AdminConferencesView>(["all", "on_advantage", "missing"]);

const DIVISIONS = new Set<string>(DIVISION_VALUES);

/** First non-empty value for a param, ignoring the array form Next allows. */
function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

export default async function AdminConferencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Anything unrecognised falls back to the default rather than 404ing: a
  // hand-edited or stale URL should still show the page it names.
  const viewParam = one(params.view);
  const view: AdminConferencesView =
    viewParam && VIEWS.has(viewParam as AdminConferencesView)
      ? (viewParam as AdminConferencesView)
      : "all";
  const sort: AdminConferencesSort =
    one(params.sort) === "name_asc" ? "name_asc" : "most_teams";
  const divisionParam = one(params.division);
  const division =
    divisionParam && DIVISIONS.has(divisionParam) ? divisionParam : null;

  const { rows, unplaced } = await listAdminConferences();

  return (
    <ConferencesPageContent
      rows={rows}
      unplaced={unplaced}
      view={view}
      sort={sort}
      division={division}
      initialSelectedId={one(params.id)}
    />
  );
}
