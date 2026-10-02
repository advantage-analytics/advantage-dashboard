import { notFound } from "next/navigation";

import { AdminActivityCard } from "@/components/admin/admin-activity-card";
import { AdminConferenceCard } from "@/components/admin/admin-conference-card";
import { AdminContactsCard } from "@/components/admin/admin-contacts-card";
import { AdminDetailsCard } from "@/components/admin/admin-details-card";
import { AdminPeopleCard } from "@/components/admin/admin-people-card";
import { AdminRequestsCard } from "@/components/admin/admin-requests-card";
import { AdminRosterCard } from "@/components/admin/admin-roster-card";
import { AdminScheduleCard } from "@/components/admin/admin-schedule-card";
import { AdminUsageCard } from "@/components/admin/admin-usage-card";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";
import { quotaTierFor } from "@/lib/services/splitstep/quota";
import { TeamSectionView } from "@/components/admin/team-section-pills";
import {
  teamViewFrom,
  teamViewTitle,
  type TeamSectionId,
} from "@/components/admin/team-sections";
import { getAdminTeam } from "@/lib/data/admin-team-server";
import { conferenceOptionsFor } from "@/lib/services/programs/admin-program-actions";
import { emailOrigin } from "@/lib/site-url";

/**
 * "Centennial High School · Roster" — the program, then the view when it is
 * not Overview. The layout's `getAdminTeam` call is the same `cache()`d call,
 * so this costs no extra read. `TeamSectionView` keeps the title in step
 * after a client-side switch.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [{ programId }, { view }] = await Promise.all([params, searchParams]);
  const data = await getAdminTeam(programId);
  if (!data) return {};
  return {
    title: teamViewTitle(
      data.program.schoolName,
      teamViewFrom(typeof view === "string" ? view : null),
    ),
  };
}

/**
 * The Admin › Teams detail page — one program, on one page.
 *
 * It used to be six routes: an Overview with three cards and five sibling
 * tabs, four of which rendered `ComingSoon`. The canvas
 * (`docs/superpowers/specs/2026-09-18-admin-team-page/TeamPage.dc.html`)
 * draws them as one page instead, and it is right to: an admin opening this
 * console is investigating a support case, and every tab boundary was a
 * round trip between two facts that only mean something next to each other —
 * who owns the program, and what it has spent. The tabs became the pill row
 * at the top, which filters the main column in place (`?view=`, decision
 * 2026-09-26) while the rail stays, and the old sub-route URLs redirect to
 * the matching view (`next.config.ts`).
 *
 * **The grid is settled in `TeamSectionView`.** `minmax(0,1fr) 380px`, 24px
 * gap, `items-start`, each column a 24px stack — the canvas' `.cols`/`.col`.
 * Tasks that fill the empty sections put a card inside the `<section>` that
 * is already there; none of them re-cuts this.
 *
 * `items-start` on purpose: a short card stretched to match a tall neighbour
 * traps empty surface at its foot, which reads worse than uneven columns.
 *
 * It calls `getAdminTeam()` again rather than taking the layout's copy. Next
 * gives a layout no way to hand data to `{children}`, and the alternative —
 * threading it through a context provider — is the pattern `matches/[matchId]`
 * uses because that page's data is read by components five levels deep. Here
 * it is read by cards this file renders directly, so the cheaper half of that
 * convention is enough: `getAdminTeam` is wrapped in React `cache()`, so the
 * layout's call and this one are the same call, deduped per request.
 *
 * `notFound()` for the null case even though the layout already did: the
 * layout is not guaranteed to have run first, and this narrows the type
 * besides.
 */
export default async function AdminTeamPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const data = await getAdminTeam(programId);

  if (!data) {
    notFound();
  }

  // The Conference card's `Change` menu — the create dialog's own list, for
  // the program's division (or the conference's, when the program row has
  // none). Read here rather than on open so the menu is never empty for a
  // beat while it loads.
  const conferenceOptions = await conferenceOptionsFor(
    data.program.division ?? data.conference?.division ?? null,
  );

  /**
   * Every section's card, rendered here on the server. `TeamSectionView`
   * picks which of them each view shows (`team-sections.ts`).
   */
  const cards: Record<TeamSectionId, React.ReactNode> = {
    people: (
      <div className="flex flex-col gap-6">
        <AdminPeopleCard
          programId={programId}
          programName={data.program.schoolName}
          members={data.members}
          invites={data.invites}
          seats={data.seats}
        />
        <AdminContactsCard
          contacts={data.contacts}
          failed={data.contactsFailed}
          // The same URL the claim-invite email carries (`claim.ts`); only a
          // directory program has a key, so a custom org has no link.
          joinLink={
            data.program.programKey
              ? `${emailOrigin()}/claim/${encodeURIComponent(data.program.programKey)}`
              : null
          }
        />
      </div>
    ),
    requests: (
      <AdminRequestsCard joinRequests={data.joinRequests} claim={data.claim} />
    ),
    roster: (
      <AdminRosterCard
        programId={programId}
        roster={data.roster}
        seats={data.seats}
      />
    ),
    schedule: <AdminScheduleCard schedule={data.schedule} />,
    activity: <AdminActivityCard activity={data.activity} />,
    pilot: (
      <PilotUsageCard
        programId={programId}
        programName={data.program.schoolName}
        usage={data.usage}
        pilot={data.pilot}
        teamPool={
          quotaTierFor({ kind: "team", orgType: data.program.orgType }) ===
          "program"
        }
      />
    ),
    usage: (
      <AdminUsageCard
        usage={data.usage}
        orgType={data.program.orgType}
        members={data.members}
      />
    ),
    conference: (
      <AdminConferenceCard
        programId={programId}
        conference={data.conference}
        currentLabel={data.program.conference}
        options={conferenceOptions}
      />
    ),
    details: <AdminDetailsCard program={data.program} />,
  };

  return (
    <TeamSectionView programName={data.program.schoolName} cards={cards} />
  );
}
