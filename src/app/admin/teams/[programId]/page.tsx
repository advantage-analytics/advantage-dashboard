import { notFound } from "next/navigation";

import { AdminPeopleCard } from "@/components/admin/admin-people-card";
import { AdminRequestsCard } from "@/components/admin/admin-requests-card";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";
import { TeamSectionPills } from "@/components/admin/team-section-pills";
import {
  TEAM_MAIN_SECTIONS,
  TEAM_RAIL_SECTIONS,
  TEAM_SECTION_TITLES,
  type TeamSectionId,
} from "@/components/admin/team-sections";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { getAdminTeam } from "@/lib/data/admin-team-server";

export const metadata = { title: "Overview" };

/**
 * The Admin › Teams detail page — one program, on one scroll.
 *
 * It used to be six routes: an Overview with three cards and five sibling
 * tabs, four of which rendered `ComingSoon`. The canvas
 * (`docs/superpowers/specs/2026-09-18-admin-team-page/TeamPage.dc.html`)
 * draws them as one page instead, and it is right to: an admin opening this
 * console is investigating a support case, and every tab boundary was a
 * round trip between two facts that only mean something next to each other —
 * who owns the program, and what it has spent. The tabs became the anchored
 * pill row at the top, and the old sub-route URLs redirect to the matching
 * `#hash` (`next.config.ts`).
 *
 * **The grid is settled here and nowhere else.** `minmax(0,1fr) 380px`, 24px
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

  /**
   * The cards that exist today. Everything else in the section map gets the
   * placeholder below — see its note for why an empty section still draws
   * something.
   */
  const cards: Partial<Record<TeamSectionId, React.ReactNode>> = {
    people: (
      <AdminPeopleCard
        programId={programId}
        programName={data.program.schoolName}
        members={data.members}
        seats={data.seats}
      />
    ),
    requests: (
      <AdminRequestsCard
        programId={programId}
        invites={data.invites}
        joinRequests={data.joinRequests}
      />
    ),
    pilot: <PilotUsageCard usage={data.usage} />,
  };

  const column = (ids: readonly TeamSectionId[]) => (
    <div className="flex flex-col gap-6">
      {ids.map((id) => (
        <section key={id} id={id} className="scroll-mt-16">
          {cards[id] ?? <TeamSectionPlaceholder id={id} />}
        </section>
      ))}
    </div>
  );

  return (
    <>
      <TeamSectionPills />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        {column(TEAM_MAIN_SECTIONS)}
        {column(TEAM_RAIL_SECTIONS)}
      </div>
    </>
  );
}

/**
 * A section whose card is not built yet.
 *
 * The design system's rule for "not built yet" is Coming soon — one
 * statement, one way onward, no shape at all — and that is still what this
 * is; it is just scoped to a card rather than a page, because the page
 * around it is built and full of real data. Six centred `ComingSoon` blocks
 * down one scroll would be the page apologising to itself, and a dimmed
 * mock-up of a card nobody has designed would invent a layout that may never
 * ship, which is the fabrication those rules exist to prevent.
 *
 * So: the section's own title, which is real chrome the page already knows,
 * and one muted line. That is the least that keeps the pill row honest — a
 * pill that scrolls to a bare `<section>` scrolls to nothing, and a reader
 * who lands on nothing concludes the page is broken rather than unfinished.
 * Each of these disappears as its card lands.
 */
function TeamSectionPlaceholder({ id }: { id: TeamSectionId }) {
  return (
    <SettingsCard>
      <span className="text-[13px] font-medium text-[var(--ink-900)]">
        {TEAM_SECTION_TITLES[id]}
      </span>
      <span className="mt-1.5 text-[12px] leading-[1.5] text-[var(--ink-500)]">
        Not built yet.
      </span>
    </SettingsCard>
  );
}
