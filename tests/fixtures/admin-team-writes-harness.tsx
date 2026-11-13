import { createRoot } from "react-dom/client";
import { AdminConferenceCard } from "@/components/admin/admin-conference-card";
import { AdminDetailsCard } from "@/components/admin/admin-details-card";
import { AdminPeopleList } from "@/components/admin/admin-people-card";
import { AdminTeamCrestControl } from "@/components/admin/team-crest-control";
import { TeamHeaderActions } from "@/components/admin/team-header-actions";
import type {
  AdminTeamInvite,
  AdminTeamJoinRequest,
  AdminTeamMember,
  AdminTeamProgram,
} from "@/lib/data/admin-team-server";
import type { AdminTeamRosterPlayer } from "@/lib/data/admin-team-roster";
import { HarnessBoundary } from "./admin-team-harness-boundary";

/**
 * Every write on /admin/teams/[programId] other than the Pilot card's, in one
 * page, with the server actions swapped for
 * `admin-team-actions-browser-mock.ts`. `tests/admin-team-writes.spec.ts`
 * bundles this and drives it.
 */
const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const SCHOOL = "Centennial High School";

const program = {
  id: PROGRAM_ID,
  name: SCHOOL,
  schoolName: SCHOOL,
  crestUrl: "/crest.png",
  orgType: "high_school",
  rosterPublic: false,
  timeZone: "America/New_York",
  uploadPolicy: "everyone",
  eventsPolicy: "staff",
  staffPageUrl: null,
} as unknown as AdminTeamProgram;

const member = (
  userId: string,
  name: string,
  role: AdminTeamMember["role"],
): AdminTeamMember =>
  ({
    userId,
    name,
    email: `${userId}@example.com`,
    role,
    avatarUrl: null,
    uploadEnabled: true,
  }) as unknown as AdminTeamMember;

const invite = {
  id: "invite",
  email: "invited@example.com",
  role: "player",
  playerId: null,
  expiresAt: "2099-01-01T00:00:00Z",
  expired: false,
  invitedByName: null,
} as unknown as AdminTeamInvite;

const joinRequest: AdminTeamJoinRequest = {
  id: "request",
  email: "asking@example.com",
  name: "Asking Player",
  note: null,
  role: "player",
  createdAt: "2026-10-01T00:00:00Z",
};

/** A roster profile no account has claimed: its row reads "No account · Invite". */
const unclaimed: AdminTeamRosterPlayer = {
  id: "player",
  name: "Nora Noaccount",
  lineupSpot: 1,
  classYear: null,
  email: "nora@example.com",
  hasAccount: false,
  claimedUserId: null,
  matchCount: 0,
  lastMatch: null,
};

const seats = { seats: 20, used: 3, pending: 1 };

createRoot(document.getElementById("root")!).render(
  <HarnessBoundary>
    <div style={{ width: 760, display: "grid", gap: 24, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <AdminTeamCrestControl
          programId={PROGRAM_ID}
          name={SCHOOL}
          crestUrl={null}
        />
        <TeamHeaderActions program={program} />
      </div>
      <AdminDetailsCard
        program={program}
        playerLink={null}
        coachLink={null}
        conference={
          <AdminConferenceCard
            variant="fact"
            programId={PROGRAM_ID}
            conference={null}
            currentLabel={null}
            options={["Ivy League"]}
          />
        }
      />
      <AdminPeopleList
        programId={PROGRAM_ID}
        programName={SCHOOL}
        joinRequests={[joinRequest]}
        members={[
          member("owner", "Olive Owner", "owner"),
          member("coach", "Casey Coach", "coach"),
        ]}
        roster={[unclaimed]}
        invites={[invite]}
        seats={seats}
        claim={null}
      />
    </div>
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
