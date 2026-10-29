import { listAdminPilots } from "@/lib/data/admin-pilots-server";
import { PilotsPageContent } from "@/components/admin/pilots-page-content";

/**
 * Admin › Pilots — the hand-picked individual players on the video pilot, each
 * with the pilot's hours a month (or an admin-set figure) in their personal
 * workspace. `listAdminPilots()` also records this admin's look at the page
 * ("New since you last looked").
 *
 * `force-dynamic` for the same reason as the other admin pages: every read is
 * service-role and gated on the current session's `is_admin`.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Pilots" };

export default async function AdminPilotsPage() {
  const rows = await listAdminPilots();
  return <PilotsPageContent rows={rows} />;
}
