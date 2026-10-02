import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimRoleLabel } from "@/lib/services/programs/claim-roles";
import { reviewReason } from "@/lib/services/programs/claim-state";
import { programDisplayName } from "@/lib/data/programs-server";
import { crestUrl } from "@/lib/data/teams-server";
import { pgQuoteValue } from "@/lib/data/postgrest-filter";

/**
 * The Admin › Requests list — every `program_claims` row that has left
 * `pending_email` (a claim nobody has clicked yet is not this admin's problem)
 * plus every `program_requests` row, merged into one feed and cut into the
 * four tabs the console offers.
 *
 * Two tables, one timeline: a claim and a request are different shapes with
 * different lifecycles, but an admin working the queue thinks in terms of
 * "what's waiting on me", not "which table is this in". `mergeRequestRows`
 * is the seam between "read two tables" and "show one list" — pure, so the
 * interleaving and cursor-cutoff logic can be tested without a database.
 *
 * Every read goes through `createAdminClient()` (service role): both tables
 * are staff/admin-only under RLS, and an admin working the queue is
 * deliberately not scoped to "programs I belong to".
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AdminRequestsView = "waiting" | "verifying" | "live" | "closed";

export type AdminRequestSource = "claim" | "request";

export type AdminRequestEmailCheck =
  "verified" | "opened" | "sent" | "contact" | "domain" | "none";

export interface AdminRequestFrom {
  name: string;
  email: string;
}

/**
 * Everything a `program_claims` row carries that a future drawer (T15) could
 * plausibly want. T15 is not built yet, so this deliberately over-includes
 * rather than guessing narrowly at what gets trimmed later.
 */
export interface AdminClaimRequestDetail {
  source: "claim";
  claimId: string;
  programId: string;
  schoolName: string;
  team: "mens" | "womens" | null;
  division: string | null;
  state: string | null;
  staffPageUrl: string | null;
  reviewReasons: string | null;
  primaryDomain: string | null;
  claimantRole: string;
  claimantMessage: string | null;
  domainMatched: boolean;
  contactMatched: boolean;
  skipsManualReview: boolean;
  matchReason: string | null;
  reviewNotes: string | null;
  voucherNote: string | null;
  verificationSentAt: string | null;
  verificationOpenedAt: string | null;
  verifiedAt: string | null;
  /** Why this claim needs a human, phrased the way the notification email does. */
  reviewReason: string;
}

/** Everything a `program_requests` row carries, same over-inclusion rationale. */
export interface AdminRequestRequestDetail {
  source: "request";
  requestId: string;
  kind: string;
  programId: string | null;
  schoolName: string | null;
  team: "mens" | "womens" | null;
  division: string | null;
  state: string | null;
  staffPageUrl: string | null;
  note: string | null;
  /** The requester's stated role, raw (e.g. `"head_coach"`) — null when unset. */
  role: string | null;
  /** "Head coach" — `claimRoleLabel(role)`, or null when `role` is null. */
  roleLabel: string | null;
}

export type AdminRequestDetail =
  AdminClaimRequestDetail | AdminRequestRequestDetail;

export interface AdminRequestRow {
  id: string;
  source: AdminRequestSource;
  /** ISO timestamp — `created_at` on the underlying row. */
  date: string;
  /** Display name of the program this request/claim concerns. */
  team: string;
  /**
   * The program's crest, resolved to a public URL — `null` when the program
   * has none uploaded (or this row has no program at all, e.g. an unlisted
   * program request). Added for T14's Team column; not part of T13's
   * original shape. Resolved the same way `admin-teams-server.ts` resolves
   * `AdminTeamRow.crestUrl` — batched `crestUrl(row.crest_path)` calls from
   * `@/lib/data/teams-server`, zipped back onto each row by index.
   */
  crestUrl: string | null;
  /** "Head coach", "Invite request" — see `forLabel()`. */
  for: string;
  from: AdminRequestFrom;
  emailCheck: AdminRequestEmailCheck;
  status: string;
  detail: AdminRequestDetail;
}

export interface AdminRequestsPage {
  rows: AdminRequestRow[];
  nextCursor: string | null;
}

export interface AdminRequestsQuery {
  view: AdminRequestsView;
  after?: string | null;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Keyset cursor — (created_at, source, id)
// ---------------------------------------------------------------------------
//
// The merge sorts by created_at desc across two tables, so a cursor that only
// carries a timestamp can skip or duplicate rows when a claim and a request
// land within the same millisecond (rare, but the merge has to be correct at
// the boundary, not just usually right). The fix is a total order with no
// ties: (created_at desc, source asc — 'claim' before 'request', id asc). The
// cursor is the boundary row's position in that order; resuming re-applies it
// per table (see `applyClaimsCursor` / `applyRequestsCursor` below).

export interface RequestsCursorKey {
  date: string;
  source: AdminRequestSource;
  id: string;
}

/** Encode a cursor the same way `admin-teams-server.ts`'s `cursorFor` does. */
export function cursorFor(row: RequestsCursorKey): string {
  const payload = JSON.stringify({ t: row.date, s: row.source, i: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Decode a cursor produced by `cursorFor`. Throws on anything malformed. */
export function parseCursor(cursor: string): RequestsCursorKey {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new Error("Malformed admin requests cursor: not valid base64url");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Malformed admin requests cursor: not valid JSON");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).t !== "string" ||
    typeof (parsed as Record<string, unknown>).i !== "string" ||
    ((parsed as Record<string, unknown>).s !== "claim" &&
      (parsed as Record<string, unknown>).s !== "request")
  ) {
    throw new Error(
      "Malformed admin requests cursor: missing date, source or id",
    );
  }

  const { t, s, i } = parsed as {
    t: string;
    s: AdminRequestSource;
    i: string;
  };
  return { date: t, source: s, id: i };
}

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------

interface RawProgramEmbed {
  id: string;
  school_name: string;
  team: string | null;
  division: string | null;
  state: string | null;
  staff_page_url: string | null;
  review_reasons: string | null;
  primary_domain: string | null;
  /** Storage path, not a URL — resolved to `crestUrl` via `crestUrl()` below. */
  crest_path: string | null;
}

function programOf(
  raw: RawProgramEmbed | RawProgramEmbed[] | null,
): RawProgramEmbed | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function teamOf(value: string | null): "mens" | "womens" | null {
  return value === "womens" ? "womens" : value === "mens" ? "mens" : null;
}

interface RawClaimRow {
  id: string;
  status: string;
  claimed_email: string;
  claimant_name: string;
  claimant_role: string;
  domain_matched: boolean;
  skips_manual_review: boolean;
  contact_matched: boolean;
  match_reason: string | null;
  review_notes: string | null;
  claimant_message: string | null;
  verification_sent_at: string | null;
  verification_opened_at: string | null;
  verified_at: string | null;
  voucher_note: string | null;
  created_at: string;
  programs: RawProgramEmbed | RawProgramEmbed[] | null;
}

const CLAIMS_SELECT = `
  id,
  status,
  claimed_email,
  claimant_name,
  claimant_role,
  domain_matched,
  skips_manual_review,
  contact_matched,
  match_reason,
  review_notes,
  claimant_message,
  verification_sent_at,
  verification_opened_at,
  verified_at,
  voucher_note,
  created_at,
  programs(id, school_name, team, division, state, staff_page_url, review_reasons, primary_domain, crest_path)
`;

/**
 * `emailCheck` precedence for a claim row.
 *
 * Verification (sent → opened → verified) always wins over the pre-checks
 * (`contact_matched`/`domain_matched`): once a verification link exists, it is
 * the authoritative signal, and the pre-checks that led to sending it are no
 * longer news. Within the pre-checks, `contact_matched` is treated as the
 * stronger signal (a named contact on the program vouching for this address)
 * and takes precedence over a bare `domain_matched` when a row somehow has
 * both — the spec doesn't order these explicitly, so this ordering is a
 * judgment call, documented here rather than left implicit.
 */
function claimEmailCheck(claim: RawClaimRow): AdminRequestEmailCheck {
  if (claim.verified_at) return "verified";
  if (claim.verification_opened_at) return "opened";
  if (claim.verification_sent_at) return "sent";
  if (claim.contact_matched) return "contact";
  if (claim.domain_matched) return "domain";
  return "none";
}

function toClaimRow(
  claim: RawClaimRow,
  resolvedCrestUrl: string | null,
): AdminRequestRow {
  const program = programOf(claim.programs);
  const schoolName = program?.school_name ?? claim.claimed_email;
  const team = teamOf(program?.team ?? null);

  const detail: AdminClaimRequestDetail = {
    source: "claim",
    claimId: claim.id,
    programId: program?.id ?? "",
    schoolName,
    team,
    division: program?.division ?? null,
    state: program?.state ?? null,
    staffPageUrl: program?.staff_page_url ?? null,
    reviewReasons: program?.review_reasons ?? null,
    primaryDomain: program?.primary_domain ?? null,
    claimantRole: claim.claimant_role,
    claimantMessage: claim.claimant_message,
    domainMatched: claim.domain_matched,
    contactMatched: claim.contact_matched,
    skipsManualReview: claim.skips_manual_review,
    matchReason: claim.match_reason,
    reviewNotes: claim.review_notes,
    voucherNote: claim.voucher_note,
    verificationSentAt: claim.verification_sent_at,
    verificationOpenedAt: claim.verification_opened_at,
    verifiedAt: claim.verified_at,
    reviewReason: reviewReason({
      domainMatched: claim.domain_matched,
      // `announcedRecipients` isn't part of this select; `reviewReason` only
      // branches on it to distinguish "no other contacts" from "domain
      // mismatch", and both branches are already covered by `matchReason` and
      // `contactMatched` here. Passing 1 (i.e. "something was announced")
      // keeps the helper's `objected`/`domainMatched` branches meaningful
      // without pulling in a column this list doesn't otherwise need.
      announcedRecipients: 1,
      status: claim.status as Parameters<typeof reviewReason>[0]["status"],
    }),
  };

  return {
    id: claim.id,
    source: "claim",
    date: claim.created_at,
    team: programDisplayName(schoolName, team),
    crestUrl: resolvedCrestUrl,
    for: claimRoleLabel(claim.claimant_role),
    from: { name: claim.claimant_name, email: claim.claimed_email },
    emailCheck: claimEmailCheck(claim),
    status: claim.status,
    detail,
  };
}

interface RawRequestRow {
  id: string;
  kind: string;
  email: string;
  name: string | null;
  role: string | null;
  note: string | null;
  school_name: string | null;
  team: string | null;
  status: string;
  created_at: string;
  programs: RawProgramEmbed | RawProgramEmbed[] | null;
}

const REQUESTS_SELECT = `
  id,
  kind,
  email,
  name,
  role,
  note,
  school_name,
  team,
  status,
  created_at,
  programs(id, school_name, team, division, state, staff_page_url, review_reasons, primary_domain, crest_path)
`;

/** "invite_request" → "Invite request", for the `for` column. */
const REQUEST_KIND_LABEL: Record<string, string> = {
  invite_request: "Invite request",
  ownership_dispute: "Ownership dispute",
  unlisted_program: "Unlisted program",
};

function requestKindLabel(kind: string): string {
  return REQUEST_KIND_LABEL[kind] ?? kind.replace(/_/g, " ");
}

function toRequestRow(
  request: RawRequestRow,
  resolvedCrestUrl: string | null,
): AdminRequestRow {
  const program = programOf(request.programs);
  const schoolName = program?.school_name ?? request.school_name;
  const team = teamOf(program?.team ?? request.team);

  const detail: AdminRequestRequestDetail = {
    source: "request",
    requestId: request.id,
    kind: request.kind,
    programId: program?.id ?? null,
    schoolName,
    team,
    division: program?.division ?? null,
    state: program?.state ?? null,
    staffPageUrl: program?.staff_page_url ?? null,
    note: request.note,
    role: request.role,
    roleLabel: request.role ? claimRoleLabel(request.role) : null,
  };

  return {
    id: request.id,
    source: "request",
    date: request.created_at,
    team: schoolName
      ? programDisplayName(schoolName, team)
      : "Unlisted program",
    crestUrl: resolvedCrestUrl,
    for: requestKindLabel(request.kind),
    from: { name: request.name ?? request.email, email: request.email },
    // `program_requests` carries none of the verification/matching columns
    // `program_claims` does — there is nothing for this column to report.
    emailCheck: "none",
    status: request.status,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Merge — pure, unit-tested
// ---------------------------------------------------------------------------

/**
 * Total order for the merged feed: `created_at` desc, then `source` asc
 * (`'claim'` before `'request'`), then `id` asc. The two-character tie-break
 * matters only when a claim and a request share a `created_at` down to the
 * microsecond, which is rare but not impossible (both can be written by the
 * same request in different code paths); without it, which row lands first
 * would depend on array order rather than being deterministic.
 */
function compareRowsDesc(a: AdminRequestRow, b: AdminRequestRow): number {
  const ta = Date.parse(a.date);
  const tb = Date.parse(b.date);
  if (ta !== tb) return tb - ta;
  if (a.source !== b.source) return a.source === "claim" ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merge two feeds, each already sorted by `compareRowsDesc`, into one page.
 *
 * Pure and I/O-free on purpose: the interleaving logic is the one part of
 * this loader worth unit-testing without a database, and a k-way merge of two
 * sorted lists needs only their first `limit + 1` elements each to produce a
 * correct first `limit + 1` elements of the combined list — which is exactly
 * what `listAdminRequests` fetches, so `hasMore` here is exact, not a guess.
 */
export function mergeRequestRows(
  claims: AdminRequestRow[],
  requests: AdminRequestRow[],
  limit: number,
): AdminRequestsPage {
  const merged: AdminRequestRow[] = [];
  let ci = 0;
  let ri = 0;
  while (ci < claims.length && ri < requests.length) {
    if (compareRowsDesc(claims[ci], requests[ri]) <= 0) {
      merged.push(claims[ci]);
      ci++;
    } else {
      merged.push(requests[ri]);
      ri++;
    }
  }
  while (ci < claims.length) merged.push(claims[ci++]);
  while (ri < requests.length) merged.push(requests[ri++]);

  const hasMore = merged.length > limit;
  const rows = hasMore ? merged.slice(0, limit) : merged;
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last
      ? cursorFor({ date: last.date, source: last.source, id: last.id })
      : null;

  return { rows, nextCursor };
}

// ---------------------------------------------------------------------------
// Cursor application per source table
// ---------------------------------------------------------------------------

/**
 * Narrow a `program_claims` query to rows strictly after `cursor` in the
 * total order.
 *
 * If the boundary row was itself a claim, this is an ordinary keyset filter
 * on `(created_at, id)`. If the boundary row was a request, every claim at
 * the exact same `created_at` sorted *before* it (`'claim' < 'request'`) and
 * was therefore already emitted on an earlier page — so the filter only
 * needs `created_at < cursor.date`, with no tie-break against `cursor.id`
 * (that id belongs to the other table and would compare incorrectly here).
 *
 * `query`/return type is `any`: the supabase-js filter-builder type returned
 * by `.select(<string>)` is not worth threading through a generic here —
 * every caller immediately narrows the result back to a known row shape
 * (see `RawClaimRow`/`RawRequestRow`).
 */
function applyClaimsCursor(query: any, cursor: RequestsCursorKey | null): any {
  if (!cursor) return query;
  if (cursor.source === "claim") {
    const t = pgQuoteValue(cursor.date);
    return query.or(
      `created_at.lt.${t},and(created_at.eq.${t},id.gt.${cursor.id})`,
    );
  }
  return query.lt("created_at", cursor.date);
}

/**
 * Narrow a `program_requests` query to rows strictly after `cursor`.
 *
 * Mirrors `applyClaimsCursor`, flipped: a request sorts *after* a claim at
 * the same `created_at` (`'claim' < 'request'`), so when the boundary row was
 * a claim, every request at that same timestamp still belongs on the next
 * page — the filter is `created_at <= cursor.date` with no id tie-break.
 *
 * `query`/return type is `any` for the same reason as `applyClaimsCursor`.
 */
function applyRequestsCursor(
  query: any,
  cursor: RequestsCursorKey | null,
): any {
  if (!cursor) return query;
  if (cursor.source === "request") {
    const t = pgQuoteValue(cursor.date);
    return query.or(
      `created_at.lt.${t},and(created_at.eq.${t},id.gt.${cursor.id})`,
    );
  }
  return query.lte("created_at", cursor.date);
}

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

const NEEDS_DECISION_CLAIM_STATUSES = ["pending_review", "objected"];
const LIVE_CLAIM_STATUSES = ["objection_window", "approved"];

/**
 * One page of the admin requests feed.
 *
 * View mapping (see the T13 task block for the source of truth this mirrors):
 *  - `waiting`   — claims `pending_review`/`objected` + open `program_requests`
 *  - `verifying` — claims with `verification_sent_at` set and `verified_at`
 *    null (no `program_requests` row can ever match; today this is
 *    correctly empty on the live database — see the loader's own comment)
 *  - `live`      — claims `objection_window`/`approved` (no matching requests)
 *  - `closed`    — claims `rejected` (deliberately NOT `objected` — an
 *    objected claim still needs a decision, so it stays in `waiting`) +
 *    requests `resolved`/`dismissed`
 */
export async function listAdminRequests({
  view,
  after = null,
  limit = 50,
}: AdminRequestsQuery): Promise<AdminRequestsPage> {
  await requireAdminOrNotFound();
  const admin = createAdminClient();

  const cursor = after ? parseCursor(after) : null;

  let claimsQuery = admin
    .from("program_claims")
    .select(CLAIMS_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (view === "waiting") {
    claimsQuery = claimsQuery.in("status", NEEDS_DECISION_CLAIM_STATUSES);
  } else if (view === "verifying") {
    claimsQuery = claimsQuery
      .not("verification_sent_at", "is", null)
      .is("verified_at", null);
  } else if (view === "live") {
    claimsQuery = claimsQuery.in("status", LIVE_CLAIM_STATUSES);
  } else {
    // closed
    claimsQuery = claimsQuery.eq("status", "rejected");
  }

  claimsQuery = applyClaimsCursor(claimsQuery, cursor).limit(limit + 1);

  // `program_requests` has nothing that maps to `verifying` or `live` — a
  // request is either open or settled, never mid-verification or "usable
  // now pending an objection window" the way a claim is. Skip the query
  // entirely for those two views rather than issuing one that can only ever
  // come back empty.
  const skipRequests = view === "verifying" || view === "live";

  let requestsQuery = skipRequests
    ? null
    : admin
        .from("program_requests")
        .select(REQUESTS_SELECT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

  if (requestsQuery) {
    requestsQuery =
      view === "waiting"
        ? requestsQuery.eq("status", "open")
        : requestsQuery.in("status", ["resolved", "dismissed"]);
    requestsQuery = applyRequestsCursor(requestsQuery, cursor).limit(limit + 1);
  }

  const [claimsResult, requestsResult] = await Promise.all([
    claimsQuery,
    requestsQuery ??
      Promise.resolve({ data: [] as RawRequestRow[], error: null }),
  ]);

  if (claimsResult.error) {
    console.error("[admin requests] could not read program_claims", {
      view,
      error: claimsResult.error.message,
    });
  }
  if (requestsResult.error) {
    console.error("[admin requests] could not read program_requests", {
      view,
      error: requestsResult.error.message,
    });
  }

  const rawClaims = (claimsResult.data ?? []) as unknown as RawClaimRow[];
  const rawRequests = (requestsResult.data ?? []) as unknown as RawRequestRow[];

  // Crest resolution is batched per source array, same pattern as
  // `admin-teams-server.ts`'s `listAdminTeams`: one `crestUrl()` call per row
  // (each is a cheap public-URL construction, not a network round trip), run
  // together and zipped back on by index so row order is untouched.
  const [claimCrests, requestCrests] = await Promise.all([
    Promise.all(
      rawClaims.map((claim) =>
        crestUrl(programOf(claim.programs)?.crest_path ?? null),
      ),
    ),
    Promise.all(
      rawRequests.map((request) =>
        crestUrl(programOf(request.programs)?.crest_path ?? null),
      ),
    ),
  ]);

  const claimRows = rawClaims.map((claim, index) =>
    toClaimRow(claim, claimCrests[index]),
  );
  const requestRows = rawRequests.map((request, index) =>
    toRequestRow(request, requestCrests[index]),
  );

  return mergeRequestRows(claimRows, requestRows, limit);
}
