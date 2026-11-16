import { RequestsPageSkeleton } from "@/components/admin/requests-page-content";

/**
 * Admin › Requests reads a page of claims and requests, every view's count
 * and the admin's last look with the service role before it draws a row.
 * This draws the page's frame in the default "Waiting on you" view.
 */
export default function AdminRequestsLoading() {
  return <RequestsPageSkeleton />;
}
