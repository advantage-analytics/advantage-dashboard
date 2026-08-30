import { createClient } from "@/lib/supabase/server";

/**
 * What Settings › Team reads.
 *
 * Three sources, none of them a plain select on `users`: the program row is
 * publicly readable, the roster comes through `program_roster` because
 * `users` RLS is own-row only, and invites have a staff-scoped policy of their
 * own. A player who lands here gets the program row and their own line — the
 * page still refuses to render, but that refusal is a redirect, not a leak.
 */

export type MemberRole = "owner" | "coach" | "staff" | "player";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export interface TeamIdentity {
  id: string;
  schoolName: string;
  team: "mens" | "womens";
  conference: string | null;
  homeVenue: string | null;
  defaultSurface: string | null;
  season: string | null;
  playersCanUpload: boolean;
  /**
   * IANA zone name (`America/Los_Angeles`, `UTC`, …) the program's calendar
   * arithmetic runs in — Team Home's weekend dual sheet, invite countdown and
   * claimed-today roster pill. Never null: the `programs.time_zone` column is
   * `not null default 'UTC'`, so a program that has never set one still reads
   * as a real zone rather than a caller having to invent a fallback.
   */
  timeZone: string;
}

export interface TeamSettingsData {
  program: TeamIdentity;
  members: TeamMember[];
  /** Outstanding only — accepted invites are members now. */
  invites: TeamInvite[];
}

export async function getTeamSettings(
  programId: string
): Promise<TeamSettingsData | null> {
  const supabase = await createClient();

  const [programResult, rosterResult, invitesResult] = await Promise.all([
    supabase
      .from("programs")
      .select(
        "id, school_name, team, conference, home_venue, default_surface, season, players_can_upload, time_zone"
      )
      .eq("id", programId)
      .maybeSingle(),
    supabase.rpc("program_roster", { p_program_id: programId }),
    supabase
      .from("program_invites")
      .select("id, email, role, created_at")
      .eq("program_id", programId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (programResult.error || !programResult.data) {
    if (programResult.error) {
      console.error("[team settings] could not read program", {
        error: programResult.error.message,
      });
    }
    return null;
  }

  const row = programResult.data;

  const members = (
    (rosterResult.data ?? []) as {
      user_id: string;
      display_name: string | null;
      email: string;
      role: string;
    }[]
  ).map((member) => ({
    userId: member.user_id,
    // Somebody who accepted an invite but never filled in a profile still has
    // to be removable, so the row falls back to the address rather than
    // disappearing.
    name: member.display_name ?? member.email,
    email: member.email,
    role: member.role as MemberRole,
  }));

  const invites = (
    (invitesResult.data ?? []) as {
      id: string;
      email: string;
      role: string;
      created_at: string;
    }[]
  ).map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role as MemberRole,
    createdAt: invite.created_at,
  }));

  return {
    program: {
      id: row.id,
      schoolName: row.school_name,
      team: row.team === "womens" ? "womens" : "mens",
      conference: row.conference,
      homeVenue: row.home_venue,
      defaultSurface: row.default_surface,
      season: row.season,
      playersCanUpload: row.players_can_upload,
      timeZone: row.time_zone,
    },
    members,
    invites,
  };
}
