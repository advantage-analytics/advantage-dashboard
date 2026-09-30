// `ComingSoonPage`'s frame while `SCHEDULE_ENABLED` is off
// (`lib/schedule/availability.ts`). Turning the schedule back on means
// re-exporting `SchedulePageSkeleton` here again: removing this file instead
// would hand the route to `team/loading.tsx` and flash Team Home's skeleton.
export { DashboardPagePending as default } from "@/components/dashboard/loading/page-skeletons";
