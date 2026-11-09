// `ComingSoonPage`'s frame while `SCHEDULE_ENABLED` is off
// (`lib/schedule/availability.ts`). Turning the schedule back on means
// re-exporting `SchedulePageSkeleton` here again.
export { DashboardPagePending as default } from "@/components/dashboard/loading/page-skeletons";
