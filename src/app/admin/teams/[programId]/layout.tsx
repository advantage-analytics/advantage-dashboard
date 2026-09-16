import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/admin-page";
import { TeamPageHeader } from "@/components/admin/team-page-header";
import { TeamTabs } from "@/components/admin/team-tabs";
import { getAdminTeam } from "@/lib/data/admin-team-server";

/**
 * The Admin › Teams detail frame — one program, wherever a tab takes you.
 *
 * `getAdminTeam()` is `cache()`d, so this and every tab page beneath it that
 * also calls it (Overview, once T21 adds it) share one set of round trips
 * rather than paying for the program twice per navigation.
 *
 * `requireAdminOrNotFound()` already runs inside `getAdminTeam()`, so this
 * layout does not re-gate on top of it — an unknown `programId` and a
 * non-admin viewer both resolve to the same `notFound()` a program row would
 * never distinguish for an admin anyway.
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
      <TeamPageHeader program={data.program} claim={data.claim} />
      <TeamTabs programId={programId} />
      <div className="pt-6">{children}</div>
    </AdminPage>
  );
}
