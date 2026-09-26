import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/admin-page";
import { TeamPageHeader } from "@/components/admin/team-page-header";
import { getAdminTeam } from "@/lib/data/admin-team-server";

/**
 * The Admin › Teams detail frame — the program's identity, above the one
 * page that holds everything else about it.
 *
 * The tab bar this layout used to render is gone: the five sub-routes behind
 * it were collapsed into anchored sections of `page.tsx`, so what is left
 * here is the header and the column it sits in. The layout survives the
 * collapse because the header is genuinely frame — it is the answer to
 * "which program am I looking at", which no section owns.
 *
 * `getAdminTeam()` is `cache()`d, so this and the page beneath it share one
 * set of round trips rather than paying for the program twice.
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
      {/* The Overview pill's anchor — the top of the page, which is the
          header rather than any one section. */}
      <div id="top">
        <TeamPageHeader program={data.program} claim={data.claim} />
      </div>
      {/* The canvas' `.page` stacks its blocks 24px apart; `AdminPage` owns
          the 28/56/72 padding, this owns the rhythm inside it. */}
      <div className="flex flex-col gap-6 pt-6">{children}</div>
    </AdminPage>
  );
}
