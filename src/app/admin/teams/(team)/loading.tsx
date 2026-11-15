import { AdminPage } from "@/components/admin/admin-page";
import { TeamPageSkeleton } from "@/components/admin/team-page-skeleton";

/**
 * One program's page. This sits in the `(team)` route group, above
 * `[programId]/layout.tsx`, so it covers the layout's own read of the team as
 * well as the page's — the layout's fetch blocks everything under it, so a
 * skeleton any lower would never show. It therefore draws the page column the
 * layout draws (`AdminPage`, the same gap) around the blocks. The Teams list's
 * skeleton lives in `(list)` and never covers this route.
 */
export default function AdminTeamLoading() {
  return (
    <AdminPage>
      <div className="flex w-full flex-col gap-10">
        <TeamPageSkeleton />
      </div>
    </AdminPage>
  );
}
