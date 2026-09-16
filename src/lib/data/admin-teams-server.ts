import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/services/programs/invite-acceptance";
import { divisionLabel, programDisplayName } from "@/lib/data/programs-server";
import { crestUrl } from "@/lib/data/teams-server";
import { pgQuoteValue } from "@/lib/data/postgrest-filter";

/**
 * The Admin › Teams list — every program in the directory (~1,940 rows),
 * filtered into the four tabs the console offers, one page at a time.
 *
 * Every read goes through `createAdminClient()` (service role): `programs` is
 * publicly readable so RLS is not the reason, but `program_claims` and
 * `program_requests` are not, and an admin looking at the whole directory is
 * explicitly not scoped to "programs I belong to" the way `user_program_ids()`
 * scopes every other reader of this schema.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AdminTeamsView =
  "on_advantage" | "in_pilot" | "needs_review" | "all";

export type AdminTeamsSort = "name_asc" | "name_desc";

export interface AdminTeamsFilters {
  /**
   * Case-insensitive prefix match on `school_name` — the same shape the
   * directory's own prefix index (`programs_school_name_prefix_idx`) is built
   * for.
   */
  search?: string;
  /**
   * The three column facets the Teams table actually draws, added by T12 when
   * the page grew a filter panel. All three are **raw column values**, not the
   * display labels the row carries: `division` is `'D1'`, never `'D-I'` — the
   * row's `division` field has already been through `divisionLabel()`, and
   * filtering on that string would match nothing.
   *
   * Single-select each (`string`, not `string[]`): the panel offers one choice
   * per facet, and a multi-select would need `.in()` here plus an array-shaped
   * URL param for no benefit the console has asked for. Omitted or empty means
   * "any".
   */
  division?: string;
  conference?: string;
  state?: string;
}

/** The value sets the filter panel offers, read once from the directory. */
export interface AdminTeamsFacets {
  divisions: string[];
  conferences: string[];
  states: string[];
}

export interface AdminTeamsQuery {
  view: AdminTeamsView;
  sort?: AdminTeamsSort;
  after?: string | null;
  limit?: number;
  filters?: AdminTeamsFilters;
}

export interface PendingClaimSummary {
  id: string;
  claimantName: string;
  claimedEmail: string;
  createdAt: string;
}

export interface AdminTeamRow {
  id: string;
  name: string;
  team: "mens" | "womens" | null;
  orgType: string;
  division: string | null;
  conference: string | null;
  state: string | null;
  status: string;
  crestUrl: string | null;
  memberCount: number;
  ownerName: string | null;
  /**
   * `'pilot'` — status is `active` (this repo's MVP definition: an active
   * program, whichever route got it there, IS the pilot; see the design note
   * on `plan` below). `'approve'` — no decision yet: the program's latest
   * claim is sitting in `pending_review` or `objected`. `'none'` — neither.
   */
  plan: "pilot" | "approve" | "none";
  /** Present exactly when `plan === 'approve'`. */
  pendingClaim?: PendingClaimSummary;
  /**
   * Open `program_requests` rows naming this program — not part of the T10
   * spec's literal field list, but the batched query that produces it is, and
   * a count sitting unused nowhere would be a wasted round trip. A future
   * "needs review" badge reads it straight off the row instead of re-deriving
   * this same lookup.
   */
  openRequestCount: number;
}

export interface AdminTeamsPage {
  rows: AdminTeamRow[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Keyset cursor — (school_name, id), matching `programs_directory_keyset_idx`
// ---------------------------------------------------------------------------

export interface DirectoryCursorKey {
  schoolName: string;
  id: string;
}

/**
 * Encode a `(school_name, id)` pair as an opaque page-boundary token.
 *
 * Base64url of a small JSON object rather than a delimited string: a raw
 * `"school_name|id"` string would break the moment a school name contained
 * the delimiter (harmless here, but not worth relying on), and JSON needs no
 * escaping scheme of its own.
 */
export function cursorFor(row: DirectoryCursorKey): string {
  const payload = JSON.stringify({ s: row.schoolName, i: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/**
 * Decode a cursor produced by `cursorFor`.
 *
 * Throws on anything malformed rather than silently restarting at page one:
 * a corrupted or hand-edited cursor is a bug in whatever built the URL, and
 * treating it as "start over" would make that bug look like missing data
 * instead of an error a caller can catch and surface.
 */
export function parseCursor(cursor: string): DirectoryCursorKey {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new Error("Malformed admin teams cursor: not valid base64url");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Malformed admin teams cursor: not valid JSON");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).s !== "string" ||
    typeof (parsed as Record<string, unknown>).i !== "string"
  ) {
    throw new Error("Malformed admin teams cursor: missing school name or id");
  }

  const { s, i } = parsed as { s: string; i: string };
  return { schoolName: s, id: i };
}

// ---------------------------------------------------------------------------
// Raw row shapes (as PostgREST returns them)
// ---------------------------------------------------------------------------

interface RawClaim {
  id: string;
  status: string;
  claimant_name: string;
  claimed_email: string;
  created_at: string;
}

interface RawOwner {
  first_name: string | null;
  last_name: string | null;
}

interface RawMemberCount {
  count: number;
}

interface RawProgramRow {
  id: string;
  school_name: string;
  team: string | null;
  org_type: string;
  division: string | null;
  conference: string | null;
  state: string | null;
  status: string;
  crest_path: string | null;
  // A to-one embed (the FK lives on `programs`) comes back as an object or
  // null; defensive-coded as possibly-an-array too, since that is how the
  // to-many embeds below come back and a schema change could turn this into
  // one without every caller noticing.
  owner: RawOwner | RawOwner[] | null;
  program_claims: RawClaim[] | null;
  program_members: RawMemberCount[] | RawMemberCount | null;
}

const PROGRAMS_SELECT = `
  id,
  school_name,
  team,
  org_type,
  division,
  conference,
  state,
  status,
  crest_path,
  owner:users!programs_owner_user_id_fkey(first_name,last_name),
  program_claims(id,status,claimant_name,claimed_email,created_at),
  program_members(count)
`;

const NEEDS_DECISION = new Set(["pending_review", "objected"]);

/**
 * The most recent claim on a program, or null if it has never been claimed.
 *
 * `program_claims_one_open_per_program` allows at most one *non-terminal*
 * claim per program, but terminal ones (`rejected`, `objected`) accumulate —
 * a live check found programs with up to 5 rows (a mix of `rejected` and
 * `objected` from repeated claim attempts). That volume is small enough per
 * program that embedding every claim and reducing to the latest client-side
 * is cheaper than a second round trip, which is the choice this function
 * exists to implement (see the module-level design note below `plan`).
 */
function latestClaim(claims: RawClaim[] | null | undefined): RawClaim | null {
  if (!claims || claims.length === 0) return null;
  return claims.reduce<RawClaim | null>((latest, claim) => {
    if (!latest) return claim;
    return Date.parse(claim.created_at) > Date.parse(latest.created_at)
      ? claim
      : latest;
  }, null);
}

function memberCountOf(raw: RawMemberCount[] | RawMemberCount | null): number {
  if (!raw) return 0;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.count ?? 0;
}

function ownerOf(raw: RawOwner | RawOwner[] | null): RawOwner | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function toAdminTeamRow(
  row: RawProgramRow,
  crestUrlValue: string | null,
  openRequestCount: number,
): AdminTeamRow {
  const owner = ownerOf(row.owner);
  const claim = latestClaim(row.program_claims);
  const needsDecision = claim !== null && NEEDS_DECISION.has(claim.status);

  return {
    id: row.id,
    name: programDisplayName(row.school_name, row.team),
    team:
      row.team === "womens" ? "womens" : row.team === "mens" ? "mens" : null,
    orgType: row.org_type,
    division: divisionLabel(row.division),
    conference: row.conference,
    state: row.state,
    status: row.status,
    crestUrl: crestUrlValue,
    memberCount: memberCountOf(row.program_members),
    ownerName: owner ? displayName(owner.first_name, owner.last_name) : null,
    // "pilot" wins over "approve": once a program is active, the claim that
    // got it there is settled history, not a decision still pending. See
    // `programStatusFor` in claim-state.ts — `active` only ever comes from
    // `objection_window` or `approved`, both already-decided claim states, so
    // the two conditions here cannot both be true for a real row.
    plan:
      row.status === "active" ? "pilot" : needsDecision ? "approve" : "none",
    pendingClaim:
      needsDecision && claim
        ? {
            id: claim.id,
            claimantName: claim.claimant_name,
            claimedEmail: claim.claimed_email,
            createdAt: claim.created_at,
          }
        : undefined,
    openRequestCount,
  };
}

// ---------------------------------------------------------------------------
// The "needs review" id set
// ---------------------------------------------------------------------------

/**
 * Program ids whose *latest* claim needs a human decision.
 *
 * Reads every `program_claims` row rather than filtering by status in SQL:
 * a program's newest claim can be `rejected` while an older one on the same
 * program was `objected` (or vice versa via the admin `reopen` transition —
 * see `claim-state.ts`), and only the newest one describes the program's
 * current state. The table is small (tens of rows in production today, and
 * bounded by claim volume rather than program count), so one full read here
 * costs less than trying to express "latest per group" as a PostgREST filter.
 */
async function reviewClaimProgramIds(
  admin: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("program_claims")
    .select("program_id, status, created_at");

  if (error) {
    console.error("[admin teams] could not read program_claims", {
      error: error.message,
    });
    return new Set();
  }

  const latestByProgram = new Map<
    string,
    { status: string; createdAt: string }
  >();
  for (const row of (data ?? []) as {
    program_id: string;
    status: string;
    created_at: string;
  }[]) {
    const existing = latestByProgram.get(row.program_id);
    if (
      !existing ||
      Date.parse(row.created_at) > Date.parse(existing.createdAt)
    ) {
      latestByProgram.set(row.program_id, {
        status: row.status,
        createdAt: row.created_at,
      });
    }
  }

  const ids = new Set<string>();
  for (const [programId, latest] of latestByProgram) {
    if (NEEDS_DECISION.has(latest.status)) ids.add(programId);
  }
  return ids;
}

/** Program ids with at least one open `program_requests` row. */
async function openRequestProgramIds(
  admin: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("program_requests")
    .select("program_id")
    .eq("status", "open");

  if (error) {
    console.error("[admin teams] could not read open program_requests", {
      error: error.message,
    });
    return new Set();
  }

  const ids = new Set<string>();
  for (const row of (data ?? []) as { program_id: string | null }[]) {
    if (row.program_id) ids.add(row.program_id);
  }
  return ids;
}

/**
 * Open `program_requests`, grouped by `program_id`, for exactly the ids on
 * one page — the batched query that keeps `openRequestCount` off the N+1
 * path. Scoped with `.in()` rather than read once for the whole table: the
 * "needs review" view already reads every open request to build its id set
 * (see `openRequestProgramIds`), but the other three views never do, and
 * this is the query that gives them the count without adding a per-row read.
 */
async function openRequestCountsFor(
  admin: SupabaseClient,
  programIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (programIds.length === 0) return counts;

  const { data, error } = await admin
    .from("program_requests")
    .select("program_id")
    .eq("status", "open")
    .in("program_id", programIds);

  if (error) {
    console.error("[admin teams] could not read open request counts", {
      error: error.message,
    });
    return counts;
  }

  for (const row of (data ?? []) as { program_id: string | null }[]) {
    if (!row.program_id) continue;
    counts.set(row.program_id, (counts.get(row.program_id) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

/**
 * One page of the admin teams directory.
 *
 * View mapping:
 *  - `on_advantage` — `status in ('active', 'claim_pending')`
 *  - `in_pilot`      — `status = 'active'`
 *  - `needs_review`  — a non-terminal-needing-decision claim (latest status
 *    `pending_review`/`objected`) OR an open `program_requests` row
 *  - `all`           — the whole directory, no status filter
 *
 * `needs_review` cannot be expressed as a single SQL filter on `programs`
 * (it depends on two other tables' current state, one of which needs a
 * "latest per group" reduction PostgREST has no operator for), so it first
 * resolves a candidate id set with two small, index-backed reads
 * (`reviewClaimProgramIds`, `openRequestProgramIds`) and then runs the same
 * paginated `programs` query as every other view, narrowed with `.in()`.
 * Every other view issues exactly one query against `programs`.
 */
export async function listAdminTeams({
  view,
  sort = "name_asc",
  after = null,
  limit = 50,
  filters,
}: AdminTeamsQuery): Promise<AdminTeamsPage> {
  await requireAdminOrNotFound();
  const admin = createAdminClient();

  const cursor = after ? parseCursor(after) : null;
  const ascending = sort === "name_asc";

  let reviewIds: string[] | null = null;
  if (view === "needs_review") {
    const [claimIds, requestIds] = await Promise.all([
      reviewClaimProgramIds(admin),
      openRequestProgramIds(admin),
    ]);
    reviewIds = [...new Set([...claimIds, ...requestIds])];
    if (reviewIds.length === 0) return { rows: [], nextCursor: null };
  }

  let query = admin.from("programs").select(PROGRAMS_SELECT);

  if (view === "on_advantage") {
    query = query.in("status", ["active", "claim_pending"]);
  } else if (view === "in_pilot") {
    query = query.eq("status", "active");
  } else if (view === "needs_review") {
    query = query.in("id", reviewIds!);
  }
  // "all" — no status filter.

  const search = filters?.search?.trim();
  if (search) {
    query = query.ilike("school_name", `${search}%`);
  }

  // Raw column values (see `AdminTeamsFilters`). Each is a plain equality, so
  // a cursor page and its first page narrow identically.
  if (filters?.division) query = query.eq("division", filters.division);
  if (filters?.conference) query = query.eq("conference", filters.conference);
  if (filters?.state) query = query.eq("state", filters.state);

  if (cursor) {
    const name = pgQuoteValue(cursor.schoolName);
    query = ascending
      ? query.or(
          `school_name.gt.${name},and(school_name.eq.${name},id.gt.${cursor.id})`,
        )
      : query.or(
          `school_name.lt.${name},and(school_name.eq.${name},id.lt.${cursor.id})`,
        );
  }

  query = query
    .order("school_name", { ascending })
    .order("id", { ascending })
    .limit(limit + 1);

  const { data, error } = await query;
  if (error) {
    console.error("[admin teams] could not list programs", {
      view,
      error: error.message,
    });
    return { rows: [], nextCursor: null };
  }

  const allRows = (data ?? []) as unknown as RawProgramRow[];
  const hasMore = allRows.length > limit;
  const page = hasMore ? allRows.slice(0, limit) : allRows;

  const [crestUrls, openRequestCounts] = await Promise.all([
    Promise.all(page.map((row) => crestUrl(row.crest_path))),
    openRequestCountsFor(
      admin,
      page.map((row) => row.id),
    ),
  ]);

  const rows = page.map((row, index) =>
    toAdminTeamRow(row, crestUrls[index], openRequestCounts.get(row.id) ?? 0),
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? cursorFor({ schoolName: last.school_name, id: last.id })
      : null;

  return { rows, nextCursor };
}

// ---------------------------------------------------------------------------
// Facet values for the filter panel (T12)
// ---------------------------------------------------------------------------

/** Every division `programs_division_check` / `conferences_division_check` allow. */
const DIVISIONS = ["D1", "D2", "D3", "NAIA", "JUCO"] as const;

/**
 * The division / conference / state values the filter panel offers, sorted.
 *
 * - **Divisions** are the fixed set the check constraints allow, not a scan of
 *   the directory.
 * - **Conferences** come from the `conferences` table's `label`, which
 *   `programs.conference` mirrors exactly — so each one still round-trips as
 *   `?conference=` against the column (see `listAdminTeams`). A conference
 *   with no programs is still offered.
 * - **States** have no table of their own, so they are still read off
 *   `programs` and deduplicated here: PostgREST has no `distinct` operator,
 *   and an RPC to populate one popover is not a trade worth making at ~1,940
 *   rows.
 *
 * `cache()` collapses the repeat calls a single render makes (page body + any
 * component that asks again) into one set of round trips.
 *
 * Raw values, deliberately — `divisionLabel()` is applied at the point of
 * display, because these strings go back out as `?division=` and have to match
 * the column (see `AdminTeamsFilters`).
 */
export const listAdminTeamFacets = cache(
  async (): Promise<AdminTeamsFacets> => {
    await requireAdminOrNotFound();
    const admin = createAdminClient();

    const [programsResult, conferencesResult] = await Promise.all([
      admin.from("programs").select("state"),
      admin.from("conferences").select("label"),
    ]);

    // Divisions sort by their display label so the panel reads
    // D-I · D-II · D-III · NAIA · JUCO rather than by raw code, which is the
    // same order here but would not be if a code were ever renamed.
    const byLabel = (a: string, b: string) =>
      (divisionLabel(a) ?? a).localeCompare(divisionLabel(b) ?? b);
    const divisions = [...DIVISIONS].sort(byLabel);

    if (programsResult.error || conferencesResult.error) {
      console.error("[admin teams] could not read facet values", {
        error: (programsResult.error ?? conferencesResult.error)?.message,
      });
      return { divisions: [], conferences: [], states: [] };
    }

    const states = new Set<string>();
    for (const row of (programsResult.data ?? []) as {
      state: string | null;
    }[]) {
      if (row.state) states.add(row.state);
    }

    return {
      divisions,
      conferences: ((conferencesResult.data ?? []) as { label: string }[])
        .map(({ label }) => label)
        .sort((a, b) => a.localeCompare(b)),
      states: [...states].sort((a, b) => a.localeCompare(b)),
    };
  },
);
