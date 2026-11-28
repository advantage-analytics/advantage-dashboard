import { notFound } from "next/navigation";

import {
  ACTIVITY_LOG_PREVIEW,
  AdminActivityCard,
} from "@/components/admin/admin-activity-card";
import { AdminBackLink } from "@/components/admin/admin-back-link";
import { AdminConferenceCard } from "@/components/admin/admin-conference-card";
import { AdminContactsCard } from "@/components/admin/admin-contacts-card";
import { AdminDetailsCard } from "@/components/admin/admin-details-card";
import { AdminPeopleList } from "@/components/admin/admin-people-card";
import { AdminScheduleCard } from "@/components/admin/admin-schedule-card";
import { AdminUsageCard } from "@/components/admin/admin-usage-card";
import { PilotUsageCard } from "@/components/admin/pilot-usage-card";
import { PlanCard } from "@/components/admin/plan-card";
import { TeamLatestMatches } from "@/components/admin/team-latest-matches";
import { TeamPageHeader } from "@/components/admin/team-page-header";
import {
  teamViewFrom,
  teamViewHref,
  teamViewTitle,
  type TeamCardId,
} from "@/components/admin/team-sections";
import { getAdminTeam } from "@/lib/data/admin-team-server";
import { plansHaveBegun } from "@/lib/billing/plans";
import { conferenceOptionsFor } from "@/lib/services/programs/admin-program-actions";
import { quotaTierFor } from "@/lib/services/splitstep/quota";
import { emailOrigin } from "@/lib/site-url";

type ViewParam = { view?: string | string[] };

function viewParam(view: ViewParam["view"]): string | null {
  return typeof view === "string" ? view : null;
}

/**
 * "Centennial High School · Usage" — the program, then the view when it is
 * not the default. The layout's `getAdminTeam` call is the same `cache()`d
 * call, so this costs no extra read.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<ViewParam>;
}) {
  const [{ programId }, { view }] = await Promise.all([params, searchParams]);
  const data = await getAdminTeam(programId);
  if (!data) return {};
  return {
    title: teamViewTitle(
      data.program.schoolName,
      teamViewFrom(viewParam(view)),
    ),
  };
}

/**
 * The Admin › Teams detail page — one program, in one full-width column
 * (`docs/superpowers/specs/2026-11-12-admin-strip/TeamDetail.dc.html`).
 *
 * The default view reads top to bottom: the header (crest upload, name,
 * facts, this month's hours with `Add hours`), Details (one row of facts —
 * the conference first, with its own `Change` control — one `Edit details`
 * and the two join links), People (one list: join requests, then members and
 * roster players together, then invitations), the three latest matches with a link to Matches
 * filtered to this workspace, and the activity log — its newest
 * `ACTIVITY_LOG_PREVIEW` entries, with "Show all" for the rest. No pill row and
 * no rail: "keep it quiet" is the owner's word, and the column runs the full
 * width of the admin page like Matches and Teams (decided 2026-11-13).
 *
 * The cards the artboard has no place for stay behind `?view=`
 * (`team-sections.ts`): `schedule`, `usage` (Pilot + Plan + Usage — where `Add
 * hours` goes), and `people` (the People list plus Contacts). Each renders
 * alone under the header with a link back. `roster`, `activity` (the log is
 * on the default view now) and any unknown value are the default — the old `/admin/teams/<id>/<slug>` routes
 * still redirect to `?view=<slug>` (`next.config.ts`), so every slug lands.
 *
 * It calls `getAdminTeam()` again rather than taking the layout's copy:
 * `getAdminTeam` is wrapped in React `cache()`, so the two are the same call,
 * deduped per request. `notFound()` for the null case even though the layout
 * already did: the layout is not guaranteed to have run first, and this
 * narrows the type besides.
 */
export default async function AdminTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<ViewParam>;
}) {
  const [{ programId }, { view: rawView }] = await Promise.all([
    params,
    searchParams,
  ]);
  const data = await getAdminTeam(programId);

  if (!data) {
    notFound();
  }

  const view = teamViewFrom(viewParam(rawView));

  // The same URL the claim-invite email carries (`claim.ts`); only a
  // directory program has a key, so a custom org has no coach link.
  const coachLink = data.program.programKey
    ? `${emailOrigin()}/claim/${encodeURIComponent(data.program.programKey)}`
    : null;

  /** Each card a view can show, built only when that view asks for it. */
  const card = (id: TeamCardId): React.ReactNode => {
    switch (id) {
      case "people":
        return (
          <AdminPeopleList
            programId={programId}
            programName={data.program.schoolName}
            joinRequests={data.joinRequests}
            members={data.members}
            roster={data.roster}
            invites={data.invites}
            seats={data.seats}
            claim={data.claim}
          />
        );
      case "contacts":
        return (
          <AdminContactsCard
            contacts={data.contacts}
            failed={data.contactsFailed}
            joinLink={coachLink}
          />
        );
      case "schedule":
        return <AdminScheduleCard schedule={data.schedule} />;
      case "pilot":
        return (
          <PilotUsageCard
            programId={programId}
            programName={data.program.schoolName}
            usage={data.usage}
            pilot={data.pilot}
            orgType={data.program.orgType}
            pilotEligible={data.program.pilotEligible}
            plansBegun={plansHaveBegun()}
            teamPool={
              quotaTierFor({
                kind: "team",
                orgType: data.program.orgType,
                pilotEligible: data.program.pilotEligible,
              }) === "program"
            }
          />
        );
      case "plan":
        return (
          <PlanCard
            programId={programId}
            programName={data.program.schoolName}
            plan={data.plan}
            seats={data.seats.seats}
          />
        );
      case "usage":
        return (
          <AdminUsageCard
            usage={data.usage}
            orgType={data.program.orgType}
            pilotEligible={data.program.pilotEligible}
            members={data.members}
          />
        );
    }
  };

  const header = (
    <TeamPageHeader
      program={data.program}
      claim={data.claim}
      usage={data.usage}
      pilot={data.pilot}
    />
  );

  if (view.id !== "overview") {
    return (
      <>
        {header}
        <div className="flex flex-col gap-4">
          <AdminBackLink
            href={teamViewHref(programId, "overview")}
            className="self-start"
          >
            Back to {data.program.schoolName}
          </AdminBackLink>
          {/* The People list carries its own "People" header, with its two
              actions; a second one above it would say the word twice. */}
          {view.cards[0] !== "people" && (
            <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
              {view.label}
            </h2>
          )}
          {view.cards.map((id) => (
            <section key={id} id={id} className="scroll-mt-16">
              {card(id)}
            </section>
          ))}
        </div>
      </>
    );
  }

  // The Conference fact's `Change` menu — the create dialog's own list, for
  // the program's division (or the conference's, when the program row has
  // none). Read here rather than on open so the menu is never empty for a
  // beat while it loads. Only the default view shows it.
  const conferenceOptions = await conferenceOptionsFor(
    data.program.division ?? data.conference?.division ?? null,
  );

  return (
    <>
      {header}

      <section
        id="details"
        aria-label="Details"
        className="flex flex-col gap-4"
      >
        <AdminDetailsCard
          program={data.program}
          playerLink={data.joinLink}
          coachLink={coachLink}
          // One more fact in the row; it carries `id="conference"`, the
          // header's `⋯ › Change conference` anchor.
          conference={
            <AdminConferenceCard
              variant="fact"
              programId={programId}
              conference={data.conference}
              currentLabel={data.program.conference}
              options={conferenceOptions}
            />
          }
        />
      </section>

      <div id="people" className="scroll-mt-16">
        {card("people")}
      </div>

      <TeamLatestMatches
        programId={programId}
        matches={data.latestMatches}
        matchCount={data.matchCount}
      />

      <section id="activity" aria-label="Activity log" className="scroll-mt-16">
        <AdminActivityCard
          activity={data.activity}
          limit={ACTIVITY_LOG_PREVIEW}
        />
      </section>
    </>
  );
}
