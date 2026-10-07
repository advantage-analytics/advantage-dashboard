import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import { DIVISION_VALUES } from "@/lib/data/programs-server";
import {
  joinHref,
  type JoinLinkMode,
} from "@/lib/services/programs/join-links";
import { siteUrl } from "@/lib/site-url";
import type {
  EventsPolicy,
  ProgramOrgType,
  UploadPolicy,
} from "@/lib/workspace/types";

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
  /** Their profile photo, or null to draw initials. */
  avatarUrl: string | null;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
  /** `program_invites.invited_by` — a `users.id`, or null once that account is gone. */
  invitedBy: string | null;
}

export interface TeamIdentity {
  id: string;
  schoolName: string;
  team: "mens" | "womens";
  conference: string | null;
  /** `programs.division` — D1, D2, D3, JUCO, NAIA; null for a custom org. */
  division: string | null;
  homeVenue: string | null;
  defaultSurface: string | null;
  playersCanUpload: boolean;
  /** The ladder `playersCanUpload` is the bottom rung of — what the form edits. */
  uploadPolicy: UploadPolicy;
  /** Who may change the schedule — the second policy row. */
  eventsPolicy: EventsPolicy;
  /**
   * Object key in the `program-crests` bucket, or null for the initials mark.
   * A key, never a URL — see `crestUrl()` in `teams-server.ts`.
   */
  crestPath: string | null;
  /**
   * IANA zone name (`America/Los_Angeles`, `UTC`, …) the program's calendar
   * arithmetic runs in — Team Home's weekend dual sheet, invite countdown and
   * claimed-today roster pill. Never null: the `programs.time_zone` column is
   * `not null default 'UTC'`, so a program that has never set one still reads
   * as a real zone rather than a caller having to invent a fallback.
   */
  timeZone: string;
}

/**
 * `${siteUrl()}/join/${token}` — one spelling, shared by this loader and the
 * Settings › Teams actions, the way `matchShareUrl()` is shared by its loader
 * and `share-actions.ts`. Lives here and not in `join-links.ts` because that
 * file is a dependency-free leaf imported by client components, and
 * `siteUrl()` is a server-side resolver (see the note at the top of it).
 */
export function joinLinkUrl(token: string): string {
  return `${siteUrl()}${joinHref(token)}`;
}

/**
 * The program's live join link — `program_join_links` where `revoked_at is
 * null` — as the Members card and its popover show it.
 *
 * `url` carries the raw token: the table stores it in plaintext precisely so
 * staff can copy the same link again after a reload (see the migration
 * header). Only staff can read the row under RLS, so a player viewer gets
 * `null` here, the same as a program with no link.
 */
export interface TeamJoinLink {
  url: string;
  mode: JoinLinkMode;
  createdAt: string;
  /** Who made it, as the roster names them; null once they left the program. */
  createdByName: string | null;
  /** The viewer made it — the popover says "by you" instead of a name. */
  createdByMe: boolean;
  /** Completed joins through this link (approve-mode requests do not count). */
  uses: number;
}

/**
 * Who is reading the join link, and how to name its maker — the two facts
 * `loadProgramJoinLink` needs beyond the row itself.
 *
 * `nameOf` resolves a `users.id` off a roster the caller already holds: the
 * maker is named from the program's own roster rather than a `users` read the
 * viewer could not make anyway (`users` RLS is own-row only).
 */
export interface JoinLinkReader {
  viewerId: string | null;
  nameOf: (userId: string) => string | null;
}

/**
 * The program's live join link as `TeamJoinLink`, or null — the ONE query
 * shape for it, shared by Settings › Teams (`getTeamSettings`) and the Roster
 * page (`getRosterJoinLink`), so the popover both mount reads the same thing.
 *
 * `reader` may be a promise: the row is requested at once and the names are
 * awaited only to map it, so a caller can start this beside the roster read
 * it names people from instead of after it.
 *
 * Staff-only under RLS; a player's read is an empty result, not an error. A
 * failed read logs and answers null — the link is a secondary control on
 * both pages, never a reason to fail the page.
 */
export async function loadProgramJoinLink(
  supabase: SupabaseClient,
  programId: string,
  reader: JoinLinkReader | PromiseLike<JoinLinkReader>,
): Promise<TeamJoinLink | null> {
  const [result, who] = await Promise.all([
    supabase
      .from("program_join_links")
      .select("token, mode, created_at, created_by, uses")
      .eq("program_id", programId)
      .is("revoked_at", null)
      .maybeSingle(),
    reader,
  ]);

  if (result.error) {
    console.error("[join link] could not read the join link", {
      error: result.error.message,
    });
    return null;
  }
  const row = result.data as {
    token: string;
    mode: string;
    created_at: string;
    created_by: string | null;
    uses: number;
  } | null;
  if (!row) return null;

  return {
    url: joinLinkUrl(row.token),
    mode: row.mode === "approve" ? "approve" : "open",
    createdAt: row.created_at,
    createdByName: row.created_by ? who.nameOf(row.created_by) : null,
    createdByMe: Boolean(
      who.viewerId && row.created_by && who.viewerId === row.created_by,
    ),
    uses: row.uses ?? 0,
  };
}

export interface TeamSettingsData {
  program: TeamIdentity;
  members: TeamMember[];
  /** Outstanding only — accepted invites are members now. */
  invites: TeamInvite[];
  /** The live join link, or null when the program has none (or the viewer may not see it). */
  joinLink: TeamJoinLink | null;
  /**
   * Who to ask about the fields only the owner may change. Derived from the
   * roster rather than `programs.owner_user_id` because the roster row is the
   * one that carries a name, and the two agree by the `programs_one_owner`
   * index. Null only for a program with no owner row at all.
   */
  ownerName: string | null;
}

export async function getTeamSettings(
  programId: string,
): Promise<TeamSettingsData | null> {
  const supabase = await createClient();

  // Started once and shared: the roster is both a result here and where the
  // join link names its maker. `Promise.resolve` because a PostgREST builder
  // re-sends its request on every `then`.
  const rosterRead = Promise.resolve(
    supabase.rpc("program_roster", { p_program_id: programId }),
  );
  const userRead = supabase.auth.getUser();

  const [programResult, rosterResult, invitesResult, avatars, joinLink] =
    await Promise.all([
      supabase
        .from("programs")
        .select(
          "id, school_name, team, conference, division, home_venue, default_surface, players_can_upload, upload_policy, events_policy, time_zone, crest_path",
        )
        .eq("id", programId)
        .maybeSingle(),
      rosterRead,
      supabase
        .from("program_invites")
        .select("id, email, role, created_at, invited_by")
        .eq("program_id", programId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      getMemberAvatarUrls(supabase, programId),
      loadProgramJoinLink(
        supabase,
        programId,
        Promise.all([rosterRead, userRead]).then(([roster, { data }]) => {
          const rows = (roster.data ?? []) as {
            user_id: string;
            display_name: string | null;
            email: string;
          }[];
          return {
            viewerId: data.user?.id ?? null,
            // The same fallback the member rows below use.
            nameOf: (userId: string) => {
              const row = rows.find((member) => member.user_id === userId);
              return row ? (row.display_name ?? row.email) : null;
            },
          };
        }),
      ),
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
    avatarUrl: avatars.get(member.user_id) ?? null,
  }));

  const invites = (
    (invitesResult.data ?? []) as {
      id: string;
      email: string;
      role: string;
      created_at: string;
      invited_by: string | null;
    }[]
  ).map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role as MemberRole,
    createdAt: invite.created_at,
    invitedBy: invite.invited_by,
  }));

  return {
    program: {
      id: row.id,
      schoolName: row.school_name,
      team: row.team === "womens" ? "womens" : "mens",
      conference: row.conference,
      division: row.division ?? null,
      homeVenue: row.home_venue,
      defaultSurface: row.default_surface,
      playersCanUpload: row.players_can_upload,
      uploadPolicy: (row.upload_policy as UploadPolicy | null) ?? "everyone",
      eventsPolicy: (row.events_policy as EventsPolicy | null) ?? "staff",
      crestPath: row.crest_path ?? null,
      timeZone: row.time_zone,
    },
    members,
    invites,
    joinLink,
    ownerName: members.find((member) => member.role === "owner")?.name ?? null,
  };
}

/**
 * The conferences of one division, read from the `conferences` table.
 *
 * Conference is a join key, not a label: `getConferenceTable` and the dual-meet
 * wizard match other programs on the exact string, so a hand-typed "Pac 12"
 * beside the directory's "Pac-12" empties Opponents without an error. Offering
 * only existing `conferences.label`s is what keeps that match honest —
 * `programs.conference` is a trigger-fed mirror of that label, so picking one
 * here writes exactly the string every other program already carries.
 *
 * One small read (~140 rows) replaces the old page-through of the whole
 * program directory. `conferences` grants select to `authenticated` only, so
 * this needs a signed-in caller; both callers (Settings › Teams and the admin
 * create dialog's action) are. Labels are returned whether or not any program
 * currently belongs to them. A conference with no division is offered in every
 * division — its row is a gap in the directory, not a claim that it belongs to
 * none, and hiding it would leave a program unable to pick the conference it
 * is actually in. Its own loader, not part of `getTeamSettings`,
 * because only the owner's form reads it and the schedule pages share that one.
 */
export async function getConferenceOptions(
  orgType: ProgramOrgType | null,
  division: string | null,
): Promise<string[]> {
  // A club or high school has no directory to pick from, and the form keeps
  // its free-text field.
  if (orgType !== "college") return [];

  const supabase = await createClient();
  let query = supabase.from("conferences").select("label").order("label");
  // A college with no division of its own picks from every division.
  if (division) {
    // The value is interpolated into PostgREST's `or=` grammar, and the admin
    // dialog's action forwards it from the client — so only the fixed codes
    // pass, and anything else matches nothing.
    if (!(DIVISION_VALUES as readonly string[]).includes(division)) return [];
    query = query.or(`division.eq.${division},division.is.null`);
  }
  const { data, error } = await query;

  if (error) {
    console.error("[team settings] could not read conferences", {
      error: error.message,
    });
    return [];
  }

  return ((data ?? []) as { label: string }[]).map(({ label }) => label);
}
