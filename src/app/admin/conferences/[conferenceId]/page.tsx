import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/admin-page";
import { ConferenceDetails } from "@/components/admin/conference-details";
import { ConferencePageHeader } from "@/components/admin/conference-page-header";
import { ConferenceTeamsSection } from "@/components/admin/conference-teams-section";
import { TeamLatestMatches } from "@/components/admin/team-latest-matches";
import {
  getAdminConference,
  listAdminConferences,
} from "@/lib/data/admin-conferences-server";

type Params = Promise<{ conferenceId: string }>;

/**
 * The tab title is the conference's name. `listAdminConferences()` is
 * `cache()`d and `getAdminConference()` reads through it, so this costs no
 * extra round trip.
 */
export async function generateMetadata({ params }: { params: Params }) {
  const { conferenceId } = await params;
  const { rows } = await listAdminConferences();
  const conference = rows.find((row) => row.id === conferenceId);
  return conference ? { title: conference.name } : {};
}

/**
 * Admin › Conferences › (a conference) — one conference, in one full-width
 * column, the team detail page's shape (`admin/teams/[programId]`).
 *
 * It runs the full width of `AdminPage`'s padded column, with no max-width or
 * centring wrapper ("pages run the full width of the admin page", the owner,
 * 2026-11-13, `2026-11-12-admin-strip/README.md`), its blocks 40px apart.
 *
 * Top to bottom: the header (back to Conferences, the crest control, the name
 * and the `conferenceMeta()` line, and the `⋯` menu with Merge into… and
 * Delete), then Details (one row of facts and the one Edit button), then
 * Teams (the Teams list's own table, with Add a team) and the conference's
 * latest matches (the team page's list, each row naming its program).
 *
 * `getAdminConference()` runs `requireAdminOrNotFound()` first, so a
 * non-admin viewer and an unknown id both land on `notFound()`. The merge
 * dialog's typeahead runs over every conference, which is the same `cache()`d
 * `listAdminConferences()` read the loader already made.
 */
export default async function AdminConferencePage({
  params,
}: {
  params: Params;
}) {
  const { conferenceId } = await params;
  const data = await getAdminConference(conferenceId);

  if (!data) {
    notFound();
  }

  const { rows: conferences } = await listAdminConferences();

  return (
    <AdminPage>
      <div className="flex w-full flex-col gap-10">
        {/* Keyed on the id: a merge navigates to the surviving conference on
            this same route, and its dialogs and crest state start fresh. */}
        <ConferencePageHeader
          key={data.conference.id}
          conference={data.conference}
          conferences={conferences}
        />

        <section
          id="details"
          aria-label="Details"
          className="flex flex-col gap-4"
        >
          <ConferenceDetails
            key={data.conference.id}
            conference={data.conference}
          />
        </section>

        <section id="teams" aria-label="Teams">
          <ConferenceTeamsSection
            conference={data.conference}
            teams={data.teams}
          />
        </section>

        {/* No "All N in Matches" link: Admin › Matches filters by program
            only, so each row links into its own program instead. */}
        <TeamLatestMatches scope="conference" matches={data.latestMatches} />
      </div>
    </AdminPage>
  );
}
