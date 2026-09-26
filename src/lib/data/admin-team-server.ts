import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { loadConferenceTeams } from "@/lib/services/programs/admin-conference-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import { crestUrl, type SeatUsage } from "@/lib/data/teams-server";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  rosterMatchOwnerIds,
  rosterWithMatchCounts,
  type AdminRosterMatchRow,
  type AdminRosterPlayerRow,
  type AdminTeamRosterPlayer,
} from "@/lib/data/admin-team-roster";
import {
  readScheduleWithClient,
  scheduleRowsFrom,
} from "@/lib/data/schedule-server";
import { dualScore } from "@/lib/schedule/entry-state";
import type { EventKind, EventSite } from "@/lib/schedule/types";
import type {
  MemberRole,
  TeamIdentity,
  TeamInvite,
  TeamMember,
} from "@/lib/data/team-settings-server";
import type { ProgramUsage } from "@/lib/data/usage-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import type {
  EventsPolicy,
  ProgramOrgType,
  UploadPolicy,
} from "@/lib/workspace/types";

/**
 * What the Admin › Teams *detail* page reads — one program, whole.
 *
 * Every read goes through `createAdminClient()` (service role), and that is the
 * single design decision this file exists to carry. Settings › Teams gets the
 * same numbers from four SECURITY DEFINER functions — `program_roster`,
 * `program_seat_usage`, `program_usage_total`, `program_usage_by_member` — and
 * every one of them gates on `p_program_id in (select user_program_ids())`,
 * which is `program_members` filtered by `auth.uid()`. An admin looking at a
 * program they do not belong to would get an empty roster, a zeroed seat ledger
 * and zero usage, with no error anywhere: exactly the failure mode where the
 * console looks like it is working and is quietly lying. Worse, the service-role
 * key does not fix that by itself — `auth.uid()` is null under it, so the guard
 * inside a SECURITY DEFINER body still says no.
 *
 * So the four function bodies are *reimplemented* here against the tables, with
 * their filtering conventions mirrored exactly (each is noted at its call site).
 * They were read from the live database with `pg_get_functiondef`, not from
 * `supabase/migrations/`, which runs roughly 100 migrations behind. If one of
 * those functions is ever changed, this file has to change with it — that
 * coupling is the price of reading the same ledger from outside the membership
 * model, and it is cheaper than the console showing a different total from the
 * page the program's own staff look at.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The program row, as the console needs it: `TeamIdentity` — the exact shape
 * Settings › Team already renders — plus the five directory/lifecycle fields
 * that only an admin sees.
 */
export interface AdminTeamProgram extends TeamIdentity {
  /** "Stanford (Men's)" — the directory's own display spelling. */
  name: string;
  /**
   * `programs.program_key` — the directory's own stable slug for this squad,
   * printed verbatim in the Details card. Nullable: a program created by hand
   * through `create_custom_program` has never had one.
   */
  programKey: string | null;
  /** Directory address; either half can be missing on a custom org. */
  city: string | null;
  state: string | null;
  /** The athletics staff directory the claim reviewer checks a name against. */
  staffPageUrl: string | null;
  /** `programs.roster_public` — whether the roster is visible off the team. */
  rosterPublic: boolean;
  /** `programs.status` — `unclaimed` | `claim_pending` | `active` | … */
  status: string;
  /**
   * Decides the processing cap, not the ledger: only a verified collegiate
   * program draws the 75-hour figure. See `quotaTierFor()`.
   */
  orgType: ProgramOrgType | null;
  /** The domain a claim's email is matched against, when one is known. */
  primaryDomain: string | null;
  createdAt: string;
  /** When the claim that owns this program landed, or null if never claimed. */
  claimedAt: string | null;
  /** Public URL for `crestPath`, resolved so the page does not have to. */
  crestUrl: string | null;
}

/**
 * The program's latest `program_claims` row.
 *
 * Deliberately a superset of T10's `PendingClaimSummary`: it carries all five
 * verification columns (`verification_sent_at`, `verification_opened_at`,
 * `verified_at`, plus the two match flags) because the Overview tab shows
 * verification state, and a second round trip for five timestamps already in
 * the row would be a worse trade than reading them here and ignoring them.
 * `verification_token_hash` is the one column deliberately left out — it is a
 * credential, and nothing on a page needs it.
 */
export interface AdminTeamClaim {
  id: string;
  status: string;
  claimantUserId: string | null;
  claimantName: string | null;
  claimantRole: string | null;
  claimedEmail: string;
  claimantMessage: string | null;
  matchReason: string | null;
  domainMatched: boolean | null;
  contactMatched: boolean | null;
  skipsManualReview: boolean | null;
  objectionWindowEndsAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  voucherNote: string | null;
  verificationSentAt: string | null;
  verificationOpenedAt: string | null;
  verifiedAt: string | null;
  announcedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * An open `program_requests` row of kind `invite_request` — somebody who asked
 * this program for an invite and is still waiting.
 *
 * `createdAt` stays a raw ISO string rather than the pre-formatted
 * `requestedOn` that `JoinRequest` carries. That type formats in the loader
 * precisely because it crosses into a client component; nothing here does yet,
 * and a server-formatted date is the harder thing to undo.
 */
export interface AdminTeamJoinRequest {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  /** The role they asked for, when the form captured one. */
  role: string | null;
  createdAt: string;
}

/**
 * The program's pilot, as the four `programs.pilot_*` columns record it.
 *
 * Always present, with nullable fields, rather than `AdminTeamPilot | null`:
 * "this program has no pilot" and "this program's pilot has no end date yet"
 * are the same card with different text, and a null object would push that
 * branch into every reader.
 *
 * The global pilot-date constant in `src/lib/services/splitstep/config.ts` is
 * deliberately NOT read here, or anywhere else in this file. It is the UI's old
 * single site-wide pilot date and only ever a display string; the per-program
 * columns are the fact, and falling back to the constant would print a date the
 * database does not hold. T1's migration used it once, as its backfill default,
 * and that is the end of its involvement on the server.
 */
export interface AdminTeamPilot {
  /** `pilot_ends_on` — last free day, inclusive. A `date`: `YYYY-MM-DD`. */
  endsOn: string | null;
  /** When the pilot was approved, or null when no reviewer could be sourced. */
  approvedAt: string | null;
  /** The approver's display name; null for an unknown or deleted account. */
  approvedByName: string | null;
  /** True when the admin reading this page is the one who approved it. */
  approvedByIsViewer: boolean;
  /**
   * Set only by `admin_end_pilot` — the pilot was stopped early by hand. Null
   * when it simply runs out on `endsOn`.
   */
  endedAt: string | null;
}

/**
 * A member row, plus the one column the console can toggle that Settings ›
 * Team's `TeamMember` has no field for.
 *
 * Extends rather than replaces `TeamMember`, so every component already typed
 * against the shared shape keeps taking these rows unchanged.
 */
export interface AdminTeamMember extends TeamMember {
  /** `program_members.upload_enabled` — `not null`, so never undefined. */
  uploadEnabled: boolean;
}

/** One other program in the same conference. */
export interface AdminTeamConferenceTeam {
  id: string;
  /** "Stanford Women's Tennis". */
  name: string;
  crestUrl: string | null;
  status: string;
  /**
   * `status in ('active', 'claim_pending')` — the same predicate
   * `admin_list_conferences()` counts as `on_advantage`, so this page's
   * "n on Advantage" and Admin › Conferences' column cannot disagree.
   */
  claimed: boolean;
}

/**
 * The conference this program sits in, or null when `conference_id` is null.
 *
 * The counts are derived from the sibling list rather than counted separately:
 * `loadConferenceTeams` already returns every program on the conference, so a
 * `count(*)` beside it would be a second round trip that could disagree with
 * the list drawn underneath it.
 */
export interface AdminTeamConference {
  id: string;
  name: string;
  /** `conferences.short_name` — the mark, when the conference has one. */
  shortName: string | null;
  division: string | null;
  /** Every program on the conference, this one included. */
  teamCount: number;
  /** How many of those are claimed — see `AdminTeamConferenceTeam.claimed`. */
  onAdvantageCount: number;
  /** The other programs, school then squad; this program is excluded. */
  teams: AdminTeamConferenceTeam[];
}

/** One `program_audit_log` row, with its actor resolved to a name. */
export interface AdminTeamActivityEntry {
  /** `program_audit_log.id` — a bigint, carried as a string for React keys. */
  id: string;
  /** The raw action value, e.g. `pilot.ended`. Labelling belongs to the card. */
  action: string;
  createdAt: string;
  /** `actor_user_id`, or null for a system write. */
  actorUserId: string | null;
  /** Null for a system write, or an account with no name on it. */
  actorName: string | null;
}

/**
 * How one scheduled event turned out, as the Schedule card marks it.
 *
 * Six states rather than a nullable `"won" | "lost"`, because "nobody has
 * played yet", "half the lines are in" and "every line is in and the teams
 * split level" are three different rows and a null would collapse them. A
 * decided dual that finished level is `"level"`, not `"played"`: the same
 * reading `seasonSummaryFrom`'s `dualRecord` takes, where a level dual is
 * decided and takes neither column.
 *
 * `"played"` is the non-dual terminal state. A tournament has no team-vs-team
 * result to report — the skip `seasonSummaryFrom` and `opponentDualHistory`
 * both make — so calling a finished bracket "won" would be a claim the
 * database does not hold.
 */
export type AdminTeamEventResult =
  "scheduled" | "playing" | "won" | "lost" | "level" | "played";

/**
 * One row of the program's schedule.
 *
 * Every field but `result` is `ScheduleRow` — `scheduleRowsFrom`'s own
 * projection over the schedule this page already read — rather than a second
 * mapping of `program_events`: the console and the program's own schedule page
 * print the same events, and two spellings of "what is a dual's score" are two
 * chances for them to disagree about a season.
 */
export interface AdminTeamEvent {
  id: string;
  /** `dual` | `tournament` | … */
  kind: EventKind;
  /** The opponent school for a dual; the tournament's own name otherwise. */
  name: string;
  /** YYYY-MM-DD. Equal to `startsOn` for a dual. */
  startsOn: string;
  endsOn: string;
  /** `home` | `away` | `neutral`. */
  site: EventSite;
  /** Lines on the event, and how many have a decided match. */
  entryCount: number;
  playedCount: number;
  /** Only for a dual, and only once every line is in — see `ScheduleRow`. */
  teamScore: { us: number; them: number } | null;
  result: AdminTeamEventResult;
}

export interface AdminTeamData {
  program: AdminTeamProgram;
  /** The most recent claim, or null for a program nobody has ever claimed. */
  claim: AdminTeamClaim | null;
  members: AdminTeamMember[];
  /**
   * The live `program_players` roster — lineup order, null spots last — with
   * each row's match count and last match. See `admin-team-roster.ts`, which
   * owns the two-id-space attribution.
   */
  roster: AdminTeamRosterPlayer[];
  /** Every event on the program, newest first — `ProgramSchedule`'s order. */
  schedule: AdminTeamEvent[];
  /** Outstanding invites only — accepted ones are members now. */
  invites: TeamInvite[];
  joinRequests: AdminTeamJoinRequest[];
  seats: SeatUsage;
  /** Never null — see `AdminTeamPilot`. */
  pilot: AdminTeamPilot;
  /** Null when `programs.conference_id` is null. */
  conference: AdminTeamConference | null;
  /** The latest 20 audit rows, newest first. */
  activity: AdminTeamActivityEntry[];
  /** The current billing month's ledger. */
  usage: ProgramUsage;
  /**
   * The same ledger for any other month. Takes a `processing_usage.
   * billing_month` key — `YYYY-MM-01`, the format `currentBillingMonth()`
   * returns — not `YYYY-MM`: it is compared against a `date` column, and a
   * two-part string would either error or silently match nothing.
   *
   * A function rather than a prefetched range because the month picker is a
   * user action on a page that has already rendered; loading twelve months
   * nobody asked for would pay for eleven of them every time.
   */
  usageByMonth: (billingMonth: string) => Promise<ProgramUsage>;
}

// ---------------------------------------------------------------------------
// Raw row shapes
// ---------------------------------------------------------------------------

const PROGRAM_SELECT = `
  id, program_key, school_name, team, conference, conference_id, division,
  city, state, staff_page_url, home_venue, default_surface, roster_public,
  players_can_upload, upload_policy, events_policy, time_zone, crest_path,
  status, org_type, primary_domain, seats, created_at, claimed_at,
  pilot_ends_on, pilot_approved_by, pilot_approved_at, pilot_ended_at
`;

const CLAIM_SELECT = `
  id, status, claimant_user_id, claimant_name, claimant_role, claimed_email,
  claimant_message, match_reason, domain_matched, contact_matched,
  skips_manual_review, objection_window_ends_at, reviewed_by, review_notes,
  voucher_note, verification_sent_at, verification_opened_at, verified_at,
  announced_at, created_at, updated_at
`;

interface RawProgram {
  id: string;
  program_key: string | null;
  school_name: string;
  team: string | null;
  conference: string | null;
  conference_id: string | null;
  division: string | null;
  city: string | null;
  state: string | null;
  staff_page_url: string | null;
  home_venue: string | null;
  default_surface: string | null;
  roster_public: boolean;
  players_can_upload: boolean;
  upload_policy: string | null;
  events_policy: string | null;
  time_zone: string;
  crest_path: string | null;
  status: string;
  org_type: string | null;
  primary_domain: string | null;
  seats: number | null;
  created_at: string;
  claimed_at: string | null;
  pilot_ends_on: string | null;
  pilot_approved_by: string | null;
  pilot_approved_at: string | null;
  pilot_ended_at: string | null;
}

interface RawClaim {
  id: string;
  status: string;
  claimant_user_id: string | null;
  claimant_name: string | null;
  claimant_role: string | null;
  claimed_email: string;
  claimant_message: string | null;
  match_reason: string | null;
  domain_matched: boolean | null;
  contact_matched: boolean | null;
  skips_manual_review: boolean | null;
  objection_window_ends_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  voucher_note: string | null;
  verification_sent_at: string | null;
  verification_opened_at: string | null;
  verified_at: string | null;
  announced_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface RawMemberUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_path: string | null;
}

interface RawMember {
  user_id: string;
  role: string;
  upload_enabled: boolean;
  joined_at: string;
  user: RawMemberUser | RawMemberUser[] | null;
}

/** `program_roster`'s own name expression, character for character. */
function rosterDisplayName(
  first: string | null,
  last: string | null,
): string | null {
  const joined = `${first ?? ""} ${last ?? ""}`.trim();
  return joined === "" ? null : joined;
}

/** `program_roster`'s own ORDER BY: owner, coach, staff, then everyone else. */
const ROLE_RANK: Record<string, number> = {
  owner: 0,
  coach: 1,
  staff: 2,
};

function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 3;
}

function oneOf<T>(raw: T | T[] | null): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

// ---------------------------------------------------------------------------
// Roster — mirrors `program_roster` minus its membership gate
// ---------------------------------------------------------------------------

/**
 * The program's members, in `program_roster`'s order and with its name
 * fallback.
 *
 * Avatars go through `getMemberAvatarUrls` for the shared spelling of
 * "public bucket key → URL", but it cannot be the only source here:
 * `program_member_avatars` carries the same `user_program_ids()` gate as every
 * other function on this schema, and under the service role `auth.uid()` is
 * null, so it answers with an empty set. The embedded `users.avatar_path` —
 * which the service role can read, `users` RLS being own-row only — backfills
 * whatever it did not return. The call is made anyway rather than deleted: it
 * runs in parallel with the roster read so it costs no latency, and it keeps
 * one function owning the URL construction if the bucket ever moves.
 */
async function readMembers(
  admin: SupabaseClient,
  programId: string,
): Promise<AdminTeamMember[]> {
  const [membersResult, avatars] = await Promise.all([
    admin
      .from("program_members")
      .select(
        "user_id, role, upload_enabled, joined_at, user:users!program_members_user_id_fkey(id, first_name, last_name, email, avatar_path)",
      )
      .eq("program_id", programId),
    getMemberAvatarUrls(admin, programId),
  ]);

  if (membersResult.error) {
    console.error("[admin team] could not read members", {
      programId,
      error: membersResult.error.message,
    });
    return [];
  }

  const bucket = admin.storage.from(USER_AVATARS_BUCKET);
  const rows = (membersResult.data ?? []) as unknown as RawMember[];

  return rows
    .map((row) => {
      const user = oneOf(row.user);
      const email = user?.email ?? "";
      const fallbackAvatar = user?.avatar_path
        ? bucket.getPublicUrl(user.avatar_path).data.publicUrl
        : null;
      return {
        member: {
          userId: row.user_id,
          // Same fallback `getTeamSettings` uses: somebody who accepted an
          // invite but never filled in a profile still has to appear.
          name:
            rosterDisplayName(
              user?.first_name ?? null,
              user?.last_name ?? null,
            ) ?? email,
          email,
          role: row.role as MemberRole,
          avatarUrl: avatars.get(row.user_id) ?? fallbackAvatar,
          uploadEnabled: row.upload_enabled,
        } satisfies AdminTeamMember,
        rank: roleRank(row.role),
        joinedAt: row.joined_at,
      };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || Date.parse(a.joinedAt) - Date.parse(b.joinedAt),
    )
    .map((entry) => entry.member);
}

// ---------------------------------------------------------------------------
// Seats — mirrors `program_seat_usage`
// ---------------------------------------------------------------------------

/**
 * The seat ledger, reproducing `program_seat_usage` exactly:
 *   seats   — `programs.seats` (the live seat-count column; there is no
 *             separate entitlements table)
 *   used    — live `program_players` rows: not archived, not merged —
 *             contributed rows included, since they show on the roster and
 *             can be claimed. A seat is a player on the roster, login or not
 *             (2026-09-20); staff hold none.
 *   pending — `program_invites` with `accepted_at is null` AND
 *             `expires_at > now()`, to somebody NEW as a player
 *             (`role = 'player'`, `player_id is null`) — a claim invitation's
 *             row is already counted in `used`.
 *
 * Note the asymmetry with `invites` below, which is the same table read
 * without the expiry clause because `getTeamSettings` lists it that way. An
 * expired invite therefore appears in the list and does NOT hold a seat —
 * that is the existing behaviour, deliberately preserved rather than
 * harmonised here, so the console's seat figure matches Settings › Teams'.
 */
async function readSeatUsage(
  admin: SupabaseClient,
  programId: string,
  seats: number,
): Promise<SeatUsage> {
  const [usedResult, pendingResult] = await Promise.all([
    admin
      .from("program_players")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId)
      .is("archived_at", null)
      .is("merged_into_id", null),
    admin
      .from("program_invites")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .eq("role", "player")
      .is("player_id", null),
  ]);

  if (usedResult.error || pendingResult.error) {
    console.error("[admin team] could not read seat usage", {
      programId,
      used: usedResult.error?.message,
      pending: pendingResult.error?.message,
    });
  }

  return {
    seats,
    used: usedResult.count ?? 0,
    pending: pendingResult.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Usage — mirrors `program_usage_total` + `program_usage_by_member`
// ---------------------------------------------------------------------------

interface RawUsageRow {
  created_by: string;
  reserved_seconds: number | null;
  actual_seconds: number | null;
  job_id: string | null;
}

/**
 * One month of the program's processing ledger.
 *
 * Both database functions agree on the definition of "used", and so does
 * `reserve_processing_quota`, which is the one that actually refuses a
 * submission: `sum(coalesce(actual_seconds, reserved_seconds))` over rows where
 * `account_id = <program>`, `account_type = 'program'`, `billing_month = <month>`
 * and `not released`. A released row is a refund; once a job finishes,
 * `actual_seconds` is the truth. That filter is reproduced verbatim below —
 * a console that showed a different total from the page the program's own staff
 * read would be worse than no console.
 *
 * The per-member breakdown mirrors `program_usage_by_member`: grouped by
 * `created_by`, `match_count` is `count(distinct processing_jobs.match_id)` (a
 * LEFT join, so a usage row with no job still contributes seconds and no
 * match), names use the same trim-or-null expression as `program_roster`, and
 * rows sort by seconds descending. Its staff-or-own-rows clause is the one
 * thing deliberately dropped: it exists to stop a player reading the whole
 * program's ledger, and an admin is neither.
 *
 * The cap comes from `monthlyCapSecondsFor({ kind: 'team', orgType })` rather
 * than `getMonthlyCapSeconds('program')` — a custom org files under the program
 * ledger but draws the individual figure, and printing 75 hours beside a spend
 * that refuses at 2 is the exact divergence `quotaTierFor()` exists to prevent.
 */
async function readUsage(
  admin: SupabaseClient,
  programId: string,
  billingMonth: string,
  orgType: ProgramOrgType | null,
): Promise<ProgramUsage> {
  const capSeconds = monthlyCapSecondsFor({ kind: "team", orgType });

  const { data, error } = await admin
    .from("processing_usage")
    .select("created_by, reserved_seconds, actual_seconds, job_id")
    .eq("account_id", programId)
    .eq("account_type", "program")
    .eq("billing_month", billingMonth)
    .eq("released", false);

  if (error) {
    console.error("[admin team] could not read program usage", {
      programId,
      billingMonth,
      error: error.message,
    });
    return { usedSeconds: 0, capSeconds, billingMonth, lines: [] };
  }

  const rows = (data ?? []) as RawUsageRow[];
  if (rows.length === 0) {
    return { usedSeconds: 0, capSeconds, billingMonth, lines: [] };
  }

  // `count(distinct pj.match_id)` needs the jobs' match ids; one batched read
  // rather than an embed, because `processing_usage.job_id` is nullable and a
  // to-one embed on a nullable FK is the shape that quietly drops rows.
  const jobIds = [
    ...new Set(rows.map((row) => row.job_id).filter(Boolean)),
  ] as string[];
  const userIds = [...new Set(rows.map((row) => row.created_by))];

  // Neither read depends on the other — run them together rather than
  // sequentially.
  const [jobsResult, usersResult] = await Promise.all([
    jobIds.length > 0
      ? admin.from("processing_jobs").select("id, match_id").in("id", jobIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from("users").select("id, first_name, last_name").in("id", userIds),
  ]);

  const matchByJob = new Map<string, string | null>();
  if (jobsResult.error) {
    console.error("[admin team] could not read processing jobs", {
      programId,
      error: jobsResult.error.message,
    });
  }
  for (const job of (jobsResult.data ?? []) as {
    id: string;
    match_id: string | null;
  }[]) {
    matchByJob.set(job.id, job.match_id);
  }

  const { data: users, error: usersError } = usersResult;
  if (usersError) {
    console.error("[admin team] could not read usage member names", {
      programId,
      error: usersError.message,
    });
  }
  const nameById = new Map(
    (
      (users ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
      }[]
    ).map((user) => [
      user.id,
      rosterDisplayName(user.first_name, user.last_name),
    ]),
  );

  let usedSeconds = 0;
  const byUser = new Map<
    string,
    { usedSeconds: number; matchIds: Set<string> }
  >();

  for (const row of rows) {
    const seconds = row.actual_seconds ?? row.reserved_seconds ?? 0;
    usedSeconds += seconds;

    let entry = byUser.get(row.created_by);
    if (!entry) {
      entry = { usedSeconds: 0, matchIds: new Set() };
      byUser.set(row.created_by, entry);
    }
    entry.usedSeconds += seconds;
    const matchId = row.job_id ? matchByJob.get(row.job_id) : null;
    if (matchId) entry.matchIds.add(matchId);
  }

  const lines = [...byUser.entries()]
    .map(([userId, entry]) => ({
      userId,
      // Same fallback `getProgramUsage` uses — dropping a nameless member
      // would make the lines stop adding up to the total.
      name: nameById.get(userId) ?? "Unnamed member",
      usedSeconds: entry.usedSeconds,
      matchCount: entry.matchIds.size,
    }))
    .sort((a, b) => b.usedSeconds - a.usedSeconds);

  return { usedSeconds, capSeconds, billingMonth, lines };
}

// ---------------------------------------------------------------------------
// Pilot — the four `programs.pilot_*` columns, with the approver named
// ---------------------------------------------------------------------------

/**
 * The pilot block, resolving `pilot_approved_by` to a name.
 *
 * One conditional round trip: a program with no approver on it skips the
 * `users` read entirely rather than querying for a null id. The name uses
 * `rosterDisplayName` — the same trim-or-null expression every other name on
 * this page goes through — so an account with no profile reads as null and the
 * card prints its own em dash, instead of the loader inventing "Unnamed".
 */
async function readPilot(
  admin: SupabaseClient,
  row: RawProgram,
  viewerId: string,
): Promise<AdminTeamPilot> {
  const approvedBy = row.pilot_approved_by;

  let approvedByName: string | null = null;
  if (approvedBy) {
    const { data, error } = await admin
      .from("users")
      .select("first_name, last_name")
      .eq("id", approvedBy)
      .maybeSingle();

    if (error) {
      console.error("[admin team] could not read pilot approver", {
        programId: row.id,
        error: error.message,
      });
    }

    const user = data as {
      first_name: string | null;
      last_name: string | null;
    } | null;
    approvedByName = user
      ? rosterDisplayName(user.first_name, user.last_name)
      : null;
  }

  return {
    endsOn: row.pilot_ends_on,
    approvedAt: row.pilot_approved_at,
    approvedByName,
    approvedByIsViewer: approvedBy !== null && approvedBy === viewerId,
    endedAt: row.pilot_ended_at,
  };
}

// ---------------------------------------------------------------------------
// Conference — the row, plus its teams via `loadConferenceTeams`
// ---------------------------------------------------------------------------

/** `admin_list_conferences()`'s own `on_advantage` predicate, character for character. */
function isClaimedStatus(status: string): boolean {
  return status === "active" || status === "claim_pending";
}

/**
 * The conference this program belongs to, or null when it belongs to none.
 *
 * The team list is `loadConferenceTeams` — the Admin › Conferences drawer's own
 * server action — rather than a second `programs` read here. It runs its own
 * `requireAdmin()` (this loader has already passed the same gate) and returns
 * `{ ok: false }` on failure, which is treated the way every other read in this
 * file treats an error: log it and hand back the degraded shape. That costs a
 * duplicate session check, and buys one definition of "the teams in a
 * conference" — including its crest-URL construction and its school-then-squad
 * ordering — instead of a copy that drifts.
 *
 * `conferences` itself is read with the service role: it has no membership
 * path at all, and `admin_list_conferences()` would return all 137 rows to
 * answer a question about one.
 */
async function readConference(
  admin: SupabaseClient,
  programId: string,
  conferenceId: string | null,
): Promise<AdminTeamConference | null> {
  if (!conferenceId) return null;

  const [conferenceResult, teamsResult] = await Promise.all([
    admin
      .from("conferences")
      .select("id, name, short_name, division")
      .eq("id", conferenceId)
      .maybeSingle(),
    loadConferenceTeams(conferenceId),
  ]);

  if (conferenceResult.error) {
    console.error("[admin team] could not read conference", {
      programId,
      conferenceId,
      error: conferenceResult.error.message,
    });
  }

  const conference = conferenceResult.data as {
    id: string;
    name: string;
    short_name: string | null;
    division: string | null;
  } | null;

  // A `conference_id` pointing at a row that is gone is a broken FK, not an
  // empty state — say so rather than drawing a nameless card.
  if (!conference) return null;

  if (!teamsResult.ok) {
    console.error("[admin team] could not read conference teams", {
      programId,
      conferenceId,
      error: teamsResult.error,
    });
  }

  const all = (teamsResult.ok ? teamsResult.teams : []).map((team) => ({
    id: team.id,
    name: team.name,
    crestUrl: team.crestUrl,
    status: team.status,
    claimed: isClaimedStatus(team.status),
  }));

  return {
    id: conference.id,
    name: conference.name,
    shortName: conference.short_name,
    division: conference.division,
    // Counted over the whole conference, this program included — "12 teams"
    // means the conference has twelve, not that it has twelve others.
    teamCount: all.length,
    onAdvantageCount: all.filter((team) => team.claimed).length,
    teams: all.filter((team) => team.id !== programId),
  };
}

// ---------------------------------------------------------------------------
// Activity — the latest `program_audit_log` rows, with actors named
// ---------------------------------------------------------------------------

/** How many rows the Activity log card shows. */
const ACTIVITY_LIMIT = 20;

/**
 * The program's last twenty audit rows, newest first.
 *
 * `details` is deliberately not selected: it is free-form `jsonb` written by
 * whichever RPC logged the row, and the card labels from `action` alone. Adding
 * it would put unvalidated shapes on a type nobody can narrow.
 *
 * Actor names come from one batched `users` read over the distinct ids, not an
 * embed: `actor_user_id` is nullable and carries no FK to `users` that
 * PostgREST could follow, so a to-one embed is the shape that would quietly
 * drop system rows. A row whose actor cannot be named keeps `actorName: null`
 * and still appears — an audit log that hides entries is worse than one with a
 * dash in it.
 */
async function readActivity(
  admin: SupabaseClient,
  programId: string,
): Promise<AdminTeamActivityEntry[]> {
  const { data, error } = await admin
    .from("program_audit_log")
    .select("id, action, actor_user_id, created_at")
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    console.error("[admin team] could not read activity", {
      programId,
      error: error.message,
    });
    return [];
  }

  const rows = (data ?? []) as {
    id: number | string;
    action: string;
    actor_user_id: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const actorIds = [
    ...new Set(rows.map((row) => row.actor_user_id).filter(Boolean)),
  ] as string[];

  const nameById = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: users, error: usersError } = await admin
      .from("users")
      .select("id, first_name, last_name")
      .in("id", actorIds);

    if (usersError) {
      console.error("[admin team] could not read activity actor names", {
        programId,
        error: usersError.message,
      });
    }

    for (const user of (users ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
    }[]) {
      nameById.set(user.id, rosterDisplayName(user.first_name, user.last_name));
    }
  }

  return rows.map((row) => ({
    // A bigint: PostgREST hands back a JS number, which would lose precision
    // long before this table does. Stringified once, here, so no reader has to
    // remember that.
    id: String(row.id),
    action: row.action,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
    actorName: row.actor_user_id
      ? (nameById.get(row.actor_user_id) ?? null)
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Roster — `program_players`, with matches attributed across both id spaces
// ---------------------------------------------------------------------------

const ROSTER_SELECT =
  "id, first_name, last_name, class_year, lineup_spot, claimed_by_user_id";

/**
 * The program's live players, each with a match count and a last match.
 *
 * Read straight off `program_players` rather than through `program_roster_full`
 * for this file's founding reason: every function on this schema gates on
 * `user_program_ids()`, and under the service role `auth.uid()` is null, so the
 * RPC would answer with an empty roster and no error. The row filter is the
 * same one `readSeatUsage` above and the rest of the repo use —
 * `archived_at is null and merged_into_id is null` — so the console's roster and
 * its seat figure are about the same set of people.
 *
 * Two round trips, never one per player: the roster, then every match keyed to
 * any of its ids in a single `in()`. Chained rather than parallel because the
 * second read's filter is built from the first's rows — the ids come out of
 * `rosterMatchOwnerIds`, which is `rosterIdIndex`'s key set, so the rows fetched
 * and the rows attributed cannot be about different sets.
 *
 * **No `program_id` filter on the matches read, deliberately.** The older half
 * of a claimed player's history was recorded under their auth uid, before this
 * program had a roster row for them and often before it had a program id on the
 * match at all; filtering by `matches.program_id` would drop exactly the rows
 * the two-id-space fold exists to find. `player1_id` is the attribution, and it
 * is specific enough: these ids belong to this program's players.
 */
async function readRoster(
  admin: SupabaseClient,
  programId: string,
): Promise<AdminTeamRosterPlayer[]> {
  const { data, error } = await admin
    .from("program_players")
    .select(ROSTER_SELECT)
    .eq("program_id", programId)
    .is("archived_at", null)
    .is("merged_into_id", null);

  if (error) {
    console.error("[admin team] could not read roster players", {
      programId,
      error: error.message,
    });
    return [];
  }

  const players = (data ?? []) as unknown as AdminRosterPlayerRow[];
  if (players.length === 0) return [];

  // Never an empty list here — every player contributes its own id — but the
  // guard above is what makes that true, and PostgREST refuses `in.()`.
  const ownerIds = rosterMatchOwnerIds(players);
  const { data: matchRows, error: matchError } = await admin
    .from("matches")
    .select("id, player1_id, player2_name, result, date")
    .in("player1_id", ownerIds);

  if (matchError) {
    console.error("[admin team] could not read roster matches", {
      programId,
      error: matchError.message,
    });
    // Still return the roster: a page listing the squad with zeroed counts is
    // usable, and hiding the squad because a second read failed is not.
    return rosterWithMatchCounts(players, []);
  }

  return rosterWithMatchCounts(
    players,
    (matchRows ?? []) as unknown as AdminRosterMatchRow[],
  );
}

// ---------------------------------------------------------------------------
// Schedule — `readScheduleWithClient`, under the service role
// ---------------------------------------------------------------------------

/**
 * How one event turned out — the one thing `ScheduleRow` does not carry.
 *
 * Derived from `dualScore`, the same function the schedule page and
 * `seasonSummaryFrom` use, rather than from the row's `teamScore`: that field is
 * null both for an undecided dual and for a tournament, and this has to tell
 * those apart.
 */
function eventResult(
  kind: EventKind,
  entries: Parameters<typeof dualScore>[0],
  playedCount: number,
): AdminTeamEventResult {
  if (entries.length === 0 || playedCount === 0) return "scheduled";

  if (kind === "dual") {
    const score = dualScore(entries);
    if (!score.decided) return "playing";
    if (score.us > score.them) return "won";
    if (score.them > score.us) return "lost";
    return "level";
  }

  return playedCount < entries.length ? "playing" : "played";
}

/**
 * Every event on the program, newest first, with its result state.
 *
 * `readScheduleWithClient` is called with the ADMIN client for the same reason
 * every other read in this file is: its cached cousins (`getProgramSchedule`,
 * `getEventDetail`) build their own cookie-bound client, and `program_events`,
 * `program_event_entries` and `matches` are all RLS-scoped to program
 * membership — an admin looking at a program they do not belong to would get an
 * empty schedule with no error. That is the failure mode the module comment at
 * the top of this file exists to prevent, and it is also why `dualScore`'s own
 * warning about narrowed reads is satisfied here: the service role sees every
 * line, so the score it computes is the whole score.
 *
 * `readScheduleWithClient` throws on a failed read rather than degrading, so
 * this wraps it: a broken schedule should cost the Schedule card, not the page.
 */
async function readSchedule(
  admin: SupabaseClient,
  programId: string,
): Promise<AdminTeamEvent[]> {
  try {
    const schedule = await readScheduleWithClient(admin, programId);
    // The row projection the program's own schedule page reads, so the two
    // cannot print different scores for one dual.
    const rows = scheduleRowsFrom(schedule);

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      site: row.site,
      entryCount: row.entryCount,
      playedCount: row.playedCount,
      teamScore: row.teamScore,
      result: eventResult(
        row.kind,
        schedule.entriesByEvent.get(row.id) ?? [],
        row.playedCount,
      ),
    }));
  } catch (error) {
    console.error("[admin team] could not read schedule", {
      programId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

/**
 * Everything the Admin › Teams detail page renders for one program, or null if
 * no such program exists.
 *
 * `cache()`d for the same reason `getMatchDetailData` is: the page's layout and
 * body both ask, and one render should mean one set of round trips.
 */
export const getAdminTeam = cache(
  async (programId: string): Promise<AdminTeamData | null> => {
    // The viewer's own id, not just the gate: `pilot.approvedByIsViewer` needs
    // to know whether this admin is the one who approved the pilot, and
    // `requireAdminOrNotFound` is `cache()`d, so asking for it is free.
    const viewer = await requireAdminOrNotFound();
    const admin = createAdminClient();

    const { data: programRow, error: programError } = await admin
      .from("programs")
      .select(PROGRAM_SELECT)
      .eq("id", programId)
      .maybeSingle();

    if (programError || !programRow) {
      if (programError) {
        console.error("[admin team] could not read program", {
          programId,
          error: programError.message,
        });
      }
      return null;
    }

    const row = programRow as unknown as RawProgram;
    const orgType = (row.org_type as ProgramOrgType | null) ?? null;
    const billingMonth = currentBillingMonth();

    const [
      crest,
      claimResult,
      members,
      roster,
      schedule,
      invitesResult,
      requestsResult,
      seats,
      usage,
      pilot,
      conference,
      activity,
    ] = await Promise.all([
      crestUrl(row.crest_path),
      admin
        .from("program_claims")
        .select(CLAIM_SELECT)
        .eq("program_id", programId)
        // Terminal claims accumulate — `program_claims_one_open_per_program`
        // only bounds the non-terminal ones — so "latest" is a real question,
        // answered the same way T10's `latestClaim()` answers it.
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      readMembers(admin, programId),
      readRoster(admin, programId),
      readSchedule(admin, programId),
      // No expiry filter, matching `getTeamSettings`. See `readSeatUsage`.
      admin
        .from("program_invites")
        .select("id, email, role, created_at, invited_by")
        .eq("program_id", programId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      // `program_join_requests` hard-codes this pair in its own body; the
      // table holds `ownership_dispute` rows too, which are a different page.
      admin
        .from("program_requests")
        .select("id, email, name, note, role, created_at")
        .eq("program_id", programId)
        .eq("kind", "invite_request")
        .eq("status", "open")
        .order("created_at", { ascending: true }),
      readSeatUsage(admin, programId, row.seats ?? 0),
      readUsage(admin, programId, billingMonth, orgType),
      readPilot(admin, row, viewer.id),
      readConference(admin, programId, row.conference_id),
      readActivity(admin, programId),
    ]);

    if (claimResult.error) {
      console.error("[admin team] could not read claim", {
        programId,
        error: claimResult.error.message,
      });
    }
    if (invitesResult.error) {
      console.error("[admin team] could not read invites", {
        programId,
        error: invitesResult.error.message,
      });
    }
    if (requestsResult.error) {
      console.error("[admin team] could not read join requests", {
        programId,
        error: requestsResult.error.message,
      });
    }

    const rawClaim = (claimResult.data ?? null) as RawClaim | null;

    const program: AdminTeamProgram = {
      id: row.id,
      name: programDisplayName(row.school_name, row.team),
      programKey: row.program_key,
      schoolName: row.school_name,
      team: row.team === "womens" ? "womens" : "mens",
      conference: row.conference,
      division: row.division ?? null,
      city: row.city,
      state: row.state,
      staffPageUrl: row.staff_page_url,
      rosterPublic: row.roster_public,
      homeVenue: row.home_venue,
      defaultSurface: row.default_surface,
      playersCanUpload: row.players_can_upload,
      uploadPolicy: (row.upload_policy as UploadPolicy | null) ?? "everyone",
      eventsPolicy: (row.events_policy as EventsPolicy | null) ?? "staff",
      crestPath: row.crest_path ?? null,
      timeZone: row.time_zone,
      status: row.status,
      orgType,
      primaryDomain: row.primary_domain,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      crestUrl: crest,
    };

    return {
      program,
      claim: rawClaim
        ? {
            id: rawClaim.id,
            status: rawClaim.status,
            claimantUserId: rawClaim.claimant_user_id,
            claimantName: rawClaim.claimant_name,
            claimantRole: rawClaim.claimant_role,
            claimedEmail: rawClaim.claimed_email,
            claimantMessage: rawClaim.claimant_message,
            matchReason: rawClaim.match_reason,
            domainMatched: rawClaim.domain_matched,
            contactMatched: rawClaim.contact_matched,
            skipsManualReview: rawClaim.skips_manual_review,
            objectionWindowEndsAt: rawClaim.objection_window_ends_at,
            reviewedBy: rawClaim.reviewed_by,
            reviewNotes: rawClaim.review_notes,
            voucherNote: rawClaim.voucher_note,
            verificationSentAt: rawClaim.verification_sent_at,
            verificationOpenedAt: rawClaim.verification_opened_at,
            verifiedAt: rawClaim.verified_at,
            announcedAt: rawClaim.announced_at,
            createdAt: rawClaim.created_at,
            updatedAt: rawClaim.updated_at,
          }
        : null,
      members,
      roster,
      schedule,
      invites: (
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
      })) satisfies TeamInvite[],
      joinRequests: (
        (requestsResult.data ?? []) as {
          id: string;
          email: string;
          name: string | null;
          note: string | null;
          role: string | null;
          created_at: string;
        }[]
      ).map((request) => ({
        id: request.id,
        email: request.email,
        name: request.name,
        note: request.note,
        role: request.role,
        createdAt: request.created_at,
      })),
      seats,
      pilot,
      conference,
      activity,
      usage,
      usageByMonth: (month: string) =>
        readUsage(admin, programId, month, orgType),
    };
  },
);
