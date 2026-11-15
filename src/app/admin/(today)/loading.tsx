import { TodayPageSkeleton } from "@/components/admin/today/today-page-content";

/**
 * Today reads five queues with the service role before it can draw a row —
 * long enough that, without this, a click on the logo sits on the previous
 * page.
 */
export default function AdminTodayLoading() {
  return <TodayPageSkeleton />;
}
