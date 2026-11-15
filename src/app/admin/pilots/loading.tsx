import { PilotsPageSkeleton } from "@/components/admin/pilots-page-content";

/**
 * Admin › Pilots reads every pilot player and records this admin's look with
 * the service role before it draws a row. This draws the page's frame.
 */
export default function AdminPilotsLoading() {
  return <PilotsPageSkeleton />;
}
