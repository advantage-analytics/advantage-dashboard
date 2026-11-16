import { MatchesPageSkeleton } from "@/components/admin/matches/matches-page-content";

/**
 * Admin › Matches reads every match on Advantage, up to the loader's cap,
 * with the service role before it draws a row. Without its own skeleton the
 * route inherited Today's rows from `admin/loading.tsx` and then jumped to
 * the Matches table; this draws that table's frame.
 */
export default function AdminMatchesLoading() {
  return <MatchesPageSkeleton />;
}
