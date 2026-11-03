import { listSupportThreads } from "@/lib/data/support-admin-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { MessagesPageContent } from "@/components/admin/messages-page-content";

/**
 * Admin › Messages — one support thread per player, wherever it started
 * (Player Messaging canvas, artboards 1, 4, 5). Rows peek in the thread
 * drawer, which reads the thread, stamps `staff_read_at` and holds the reply
 * composer.
 *
 * `force-dynamic` for the same reason as the other admin pages: every read is
 * service-role and gated on the current session's `is_admin`.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Messages" };

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  // The guard is `cache()`d — the layout already ran it; this reads its id so
  // the drawer can call this admin's own replies "You".
  const [admin, rows, { id }] = await Promise.all([
    requireAdminOrNotFound(),
    listSupportThreads(),
    searchParams,
  ]);
  return (
    <MessagesPageContent
      rows={rows}
      viewerId={admin.id}
      initialSelectedId={typeof id === "string" ? id : null}
    />
  );
}
