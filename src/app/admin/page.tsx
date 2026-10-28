import { TodayPageContent } from "@/components/admin/today/today-page-content";
import { loadAdminToday } from "@/lib/data/admin-today-server";

/**
 * Admin › Today — the console's front door: everything waiting on an admin,
 * oldest first, in one table (boards Today2 / TodayEmpty2).
 *
 * `force-dynamic` like every admin page: each read is service-role and gated
 * on the current session's `is_admin`, and loading the page records this
 * admin's look at Today (`lookAtSurface`), which a cached render would skip.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Today" };

export default async function AdminTodayPage() {
  const { items, freshCount, pipeline } = await loadAdminToday();
  return (
    <TodayPageContent
      items={items}
      freshCount={freshCount}
      pipeline={pipeline}
    />
  );
}
