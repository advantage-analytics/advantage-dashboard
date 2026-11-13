import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/admin-page";
import { getAdminTeam } from "@/lib/data/admin-team-server";

/**
 * The Admin › Teams detail frame — the column the page sits in.
 *
 * It runs the full width of `AdminPage`'s padded column, as the Matches and
 * Teams lists do ("pages run the full width of the admin page", the owner,
 * 2026-11-13, `2026-11-12-admin-strip/README.md`), its blocks 40px apart as
 * the artboard stacks them. The header is the page's own (`page.tsx`), since it carries
 * this month's hours and sits above every view.
 *
 * `getAdminTeam()` is `cache()`d, so this and the page beneath it share one
 * set of round trips. `requireAdminOrNotFound()` already runs inside it, so
 * an unknown `programId` and a non-admin viewer both resolve to `notFound()`.
 */
export default async function AdminTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const data = await getAdminTeam(programId);

  if (!data) {
    notFound();
  }

  return (
    <AdminPage>
      <div className="flex w-full flex-col gap-10">{children}</div>
    </AdminPage>
  );
}
