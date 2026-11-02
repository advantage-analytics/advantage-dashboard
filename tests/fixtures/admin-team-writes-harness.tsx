import { createRoot } from "react-dom/client";
import { AdminConferenceCard } from "@/components/admin/admin-conference-card";
import { AdminPeopleCard } from "@/components/admin/admin-people-card";
import { AdminRequestsCard } from "@/components/admin/admin-requests-card";
import { AdminRosterCard } from "@/components/admin/admin-roster-card";
import { AdminTeamCrestControl } from "@/components/admin/team-crest-control";
import { TeamHeaderActions } from "@/components/admin/team-header-actions";
import type {
  AdminTeamInvite,
  AdminTeamJoinRequest,
  AdminTeamMember,
  AdminTeamProgram,
} from "@/lib/data/admin-team-server";
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
      <AdminPeopleCard
        programId={PROGRAM_ID}
        programName={SCHOOL}
        members={[
          member("owner", "Olive Owner", "owner"),
          member("coach", "Casey Coach", "coach"),
        ]}
        invites={[invite]}
        seats={seats}
      />
      <AdminRequestsCard joinRequests={[joinRequest]} claim={null} />
      <AdminRosterCard programId={PROGRAM_ID} roster={[]} seats={seats} />
      <AdminConferenceCard
        programId={PROGRAM_ID}
        conference={null}
        currentLabel={null}
        options={["Ivy League"]}
      />
    </div>
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
