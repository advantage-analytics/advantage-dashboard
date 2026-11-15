import { TeamsPageSkeleton } from "@/components/admin/teams-page-content";

/**
 * Admin › Teams reads a page of programs, the facet menus, every view's count
 * and the admin's last look with the service role before it draws a row.
 * Without its own skeleton the route inherited Today's rows from
 * `admin/loading.tsx` and then jumped to the Teams table; this draws that
 * table's frame, in the default Programs view.
 */
export default function AdminTeamsLoading() {
  return <TeamsPageSkeleton />;
}
