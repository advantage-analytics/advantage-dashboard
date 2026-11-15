import { MatchesPageSkeleton } from "@/components/admin/matches/matches-page-content";

/**
 * `/admin/uploads` only redirects to Admin › Matches, so what it is waiting
 * on is that page: its skeleton, rather than the previous page held under the
 * click. In its own route group so it never sits above `/admin/uploads/new`.
 */
export default function AdminUploadsLoading() {
  return <MatchesPageSkeleton />;
}
