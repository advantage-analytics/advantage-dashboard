import { PayReportPageSkeleton } from "@/components/admin/labels-practice/pay-report-table";

/**
 * The pay report sums every published session in the range with the service
 * role before it draws a row. Without its own skeleton the route inherited
 * the Labels board's lanes; this draws the report's own heading, range form
 * and table.
 */
export default function AdminLabelPayLoading() {
  return <PayReportPageSkeleton />;
}
