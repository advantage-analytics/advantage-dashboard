import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import { crestUrl, type SeatUsage } from "@/lib/data/teams-server";
import { programDisplayName } from "@/lib/data/programs-server";
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

export interface AdminTeamData {
  program: AdminTeamProgram;
  /** The most recent claim, or null for a program nobody has ever claimed. */
  claim: AdminTeamClaim | null;
  members: TeamMember[];
  /** Outstanding invites only — accepted ones are members now. */
  invites: TeamInvite[];
  joinRequests: AdminTeamJoinRequest[];
  seats: SeatUsage;
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
  id, school_name, team, conference, division, home_venue, default_surface,
  players_can_upload, upload_policy, events_policy, time_zone, crest_path,
  status, org_type, primary_domain, seats, created_at, claimed_at
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
  school_name: string;
  team: string | null;
  conference: string | null;
  division: string | null;
  home_venue: string | null;
  default_surface: string | null;
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
): Promise<TeamMember[]> {
  const [membersResult, avatars] = await Promise.all([
    admin
      .from("program_members")
      .select(
        "user_id, role, joined_at, user:users!program_members_user_id_fkey(id, first_name, last_name, email, avatar_path)",
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
        } satisfies TeamMember,
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
 *   used    — every `program_members` row, unfiltered by role
 *   pending — `program_invites` with `accepted_at is null` AND
 *             `expires_at > now()`
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
      .from("program_members")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId),
    admin
      .from("program_invites")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
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
  const matchByJob = new Map<string, string | null>();
  if (jobIds.length > 0) {
    const { data: jobs, error: jobsError } = await admin
      .from("processing_jobs")
      .select("id, match_id")
      .in("id", jobIds);
    if (jobsError) {
      console.error("[admin team] could not read processing jobs", {
        programId,
        error: jobsError.message,
      });
    }
    for (const job of (jobs ?? []) as {
      id: string;
      match_id: string | null;
    }[]) {
      matchByJob.set(job.id, job.match_id);
    }
  }

  const userIds = [...new Set(rows.map((row) => row.created_by))];
  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, first_name, last_name")
    .in("id", userIds);
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
    await requireAdminOrNotFound();
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
      invitesResult,
      requestsResult,
      seats,
      usage,
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
      usage,
      usageByMonth: (month: string) =>
        readUsage(admin, programId, month, orgType),
    };
  },
);
