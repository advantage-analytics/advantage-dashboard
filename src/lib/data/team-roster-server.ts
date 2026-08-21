import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProgramUsage } from "@/lib/data/usage-server";
import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * What the Roster page reads.
 *
 * Named `team-roster-server` rather than `roster-server` on purpose: the
 * events/lineups branch owns `lib/data/roster-server.ts` for `getLadder()`,
 * which answers a different question (who plays which line) against a
 * different table. Two files with one name and unrelated contents is a merge
 * conflict that resolves into whichever one the person doing the merge happens
 * to keep.
 *
 * Everything here comes from `program_roster` and `program_usage_by_member`,
 * the same two functions Settings › Team and the usage page already read. That
 * is deliberate — a roster that counted hours differently from the usage page
 * would give a coach two numbers for one question, and they would believe the
 * wrong one.
 */

export interface RosterMember {
  userId: string;
  /** Falls back to the email's local part; a profile may have no name yet. */
  name: string;
  email: string;
  role: MemberRole;
  uploadEnabled: boolean;
  joinedAt: string;
  /** Analysis time this person has spent this month, in seconds. */
  usedSeconds: number;
  matchCount: number;
}

export interface RosterInvite {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
  expiresAt: string;
}

export interface RosterData {
  members: RosterMember[];
  /**
   * Outstanding invitations. Always empty for a player — the RLS policy on
   * `program_invites` grants select to staff only, so this needs no branch
   * here. The database is the authority and the page cannot forget to ask it.
   */
  invites: RosterInvite[];
  /** Program-wide default. A member's own flag can still override it. */
  playersCanUpload: boolean;
  capSeconds: number;
  usedSeconds: number;
  billingMonth: string;
}

interface DbRosterRow {
  user_id: string;
  display_name: string | null;
  email: string;
  role: string;
  upload_enabled: boolean;
  joined_at: string;
}

/** "ana.vasquez@school.edu" → "ana.vasquez", for a profile with no name yet. */
function fallbackName(email: string): string {
  return email.split("@")[0] || email;
}

export const getRosterData = cache(async function getRosterData(
  programId: string,
  billingMonth: string
): Promise<RosterData> {
  const supabase = await createClient();

  // All three are independent reads, and the page needs every one of them
  // before it renders a single row — so they go together rather than in the
  // sequence the page happens to display them in.
  const [rosterResult, usage, invitesResult, programResult] = await Promise.all(
    [
      supabase.rpc("program_roster", { p_program_id: programId }),
      getProgramUsage(programId, billingMonth),
      supabase
        .from("program_invites")
        .select("id, email, role, created_at, expires_at")
        .eq("program_id", programId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("programs")
        .select("players_can_upload")
        .eq("id", programId)
        .maybeSingle(),
    ]
  );

  const usageByUser = new Map(
    usage.lines.map((line) => [line.userId, line])
  );

  const rows = (rosterResult.data ?? []) as DbRosterRow[];

  const members: RosterMember[] = rows.map((row) => {
    const line = usageByUser.get(row.user_id);
    return {
      userId: row.user_id,
      name: row.display_name?.trim() || fallbackName(row.email),
      email: row.email,
      role: row.role as MemberRole,
      uploadEnabled: row.upload_enabled,
      joinedAt: row.joined_at,
      // A player who has uploaded nothing has no usage line at all, which is
      // zero rather than missing — the roster shows every member either way.
      usedSeconds: line?.usedSeconds ?? 0,
      matchCount: line?.matchCount ?? 0,
    };
  });

  // Staff first, then players, each alphabetically. Ordering by `joined_at`
  // would put the owner first only by accident of being the first to join, and
  // a roster is read to find a person, not to see who arrived when.
  const rank: Record<string, number> = { owner: 0, coach: 1, staff: 2, player: 3 };
  members.sort(
    (a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name)
  );

  return {
    members,
    invites: (invitesResult.data ?? []).map((row) => ({
      id: row.id as string,
      email: row.email as string,
      role: row.role as MemberRole,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
    })),
    playersCanUpload: Boolean(programResult.data?.players_can_upload),
    capSeconds: usage.capSeconds,
    usedSeconds: usage.usedSeconds,
    billingMonth: usage.billingMonth,
  };
});
