import {
  listAdminRequests,
  type AdminRequestsView,
} from "@/lib/data/admin-requests-server";
import { RequestsTable } from "@/components/admin/requests-table";
import { RequestsViewPills } from "@/components/admin/requests-view-pills";

/**
 * Admin › Requests — the console's queue of claims and invite requests, T14.
 *
 * `force-dynamic` for the same reason `admin/teams/page.tsx` is: every read
 * here is service-role and per-request, gated on the *current* session's
 * `is_admin`, so a cached render would be one admin's queue served to
 * whoever asked next.
 *
 * TODO(T15): this should render `RequestsTable` inside `RequestsPageContent`
 * — the drawer + selection state machine that turns a row click into a peek
 * panel. That component doesn't exist yet (it's T15's file), so this page
 * renders `RequestsTable` directly for now, with `RequestsViewPills` doing
 * the minimum job of turning a pill click into a `?view=` URL change. Once
 * T15 lands, this page hands its rows/view to `RequestsPageContent` instead
 * and `RequestsViewPills` folds into it.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Requests" };

const VIEWS = new Set<AdminRequestsView>([
  "waiting",
  "verifying",
  "live",
  "closed",
]);

/** First non-empty value for a param, ignoring the array form Next allows. */
function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const viewParam = one(params.view);
  // Anything unrecognised falls back to the default rather than 404ing: a
  // hand-edited or stale URL should still show the page it names.
  const view: AdminRequestsView =
    viewParam && VIEWS.has(viewParam as AdminRequestsView)
      ? (viewParam as AdminRequestsView)
      : "waiting";

  const page = await listAdminRequests({ view, after: one(params.after) });

  const emptyTitle: Record<AdminRequestsView, string> = {
    waiting: "Nothing is waiting on you",
    verifying: "No claims are mid-verification",
    live: "No teams are live from this queue",
    closed: "No closed requests yet",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Title slot. */}
      <div>
        <h1 className="text-display">Requests</h1>
        <p className="text-body-sm mt-[9px]">
          Program claims and invite requests, merged into one queue.
        </p>
      </div>

      <RequestsViewPills view={view} />

      <RequestsTable rows={page.rows} emptyTitle={emptyTitle[view]} />
    </div>
  );
}
