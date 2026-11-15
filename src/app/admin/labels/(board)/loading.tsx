import { LabelsPageSkeleton } from "@/components/admin/labels/labels-board";

/**
 * Admin › Labels reads the whole label queue, open review requests and the
 * labeller list with the service role before it draws a lane. Without its own
 * skeleton the route inherited Today's rows from `admin/loading.tsx` and then
 * jumped to three lanes; this draws the lanes it will land on.
 */
export default function AdminLabelsLoading() {
  return <LabelsPageSkeleton />;
}
