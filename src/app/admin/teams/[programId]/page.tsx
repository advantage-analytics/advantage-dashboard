import { notFound } from "next/navigation";

import { AdminPeopleCard } from "@/components/admin/admin-people-card";
import { AdminRequestsCard } from "@/components/admin/admin-requests-card";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";
import { getAdminTeam } from "@/lib/data/admin-team-server";

export const metadata = { title: "Overview" };

/**
 * The Admin › Teams detail page's first tab: this program's people, whoever is
 * waiting to become one, and what the team has spent this month.
 *
 * It calls `getAdminTeam()` again rather than taking the layout's copy. Next
 * gives a layout no way to hand data to `{children}`, and the alternative —
 * threading it through a context provider — is the pattern `matches/[matchId]`
 * uses because that page's data is read by components five levels deep. Here
 * it is read by three cards this file renders directly, so the cheaper half of
 * that convention is enough: `getAdminTeam` is wrapped in React `cache()`, so
 * the layout's call and this one are the same call, deduped per request, not
 * two sets of round trips.
 *
 * `notFound()` for the null case even though the layout already did: the
 * layout is not guaranteed to have run first, and this narrows the type
 * besides.
 *
 * Two columns because the cards answer two different questions. People — with
 * roles, ownership and the invite box — is the one an admin came for and gets
 * the reading column; what is outstanding and what it costs stack beside it.
 * `items-start` on purpose: a short card stretched to match a tall neighbour
 * traps empty surface at its foot, which reads worse than uneven columns.
 */
export default async function AdminTeamOverviewPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const data = await getAdminTeam(programId);

  if (!data) {
    notFound();
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <AdminPeopleCard
        programId={programId}
        programName={data.program.schoolName}
        members={data.members}
        seats={data.seats}
      />

      <div className="flex flex-col gap-5">
        <AdminRequestsCard
          programId={programId}
          invites={data.invites}
          joinRequests={data.joinRequests}
        />
        <PilotUsageCard usage={data.usage} />
      </div>
    </div>
  );
}
