import { LabelSessionPageSkeleton } from "@/components/admin/labels/label-dashboard";

/**
 * One label session reads the session, its points and shots, the signed video
 * and the upload's inputs before the console can mount. Without its own
 * skeleton the route inherited the Labels board's lanes (or Today's rows),
 * then jumped to the overview; this draws the overview it lands on.
 */
export default function AdminLabelSessionLoading() {
  return <LabelSessionPageSkeleton />;
}
