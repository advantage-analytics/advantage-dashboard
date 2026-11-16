import { ConferencesPageSkeleton } from "@/components/admin/conferences-page-content";

/**
 * Admin › Conferences reads every conference and the programs not yet placed
 * in one with the service role before it draws a row. Without its own
 * skeleton the route inherited Today's rows from `admin/loading.tsx` and then
 * jumped to the Conferences table; this draws that table's frame.
 */
export default function AdminConferencesLoading() {
  return <ConferencesPageSkeleton />;
}
