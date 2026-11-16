import { ConferencePageSkeleton } from "@/components/admin/conference-page-skeleton";

/**
 * One conference reads the conference, its teams, their latest matches and
 * the whole conference list (for Merge) with the service role. Without its
 * own skeleton the route inherited the Conferences table's (and before that
 * Today's) rows, then jumped to the conference's page; this draws that page.
 */
export default function AdminConferenceLoading() {
  return <ConferencePageSkeleton />;
}
