import { AdminMatchReportPageSkeleton } from "@/components/admin/matches/admin-report-skeleton";

/**
 * The admin's match report loads the match, its statistics, points and
 * insights with the service role, then signs the video. Without its own
 * skeleton the route inherited the Matches table's (and before that Today's)
 * rows, then jumped to a full-height report; this draws the strip and the
 * report it lands on.
 */
export default function AdminMatchReportLoading() {
  return <AdminMatchReportPageSkeleton />;
}
