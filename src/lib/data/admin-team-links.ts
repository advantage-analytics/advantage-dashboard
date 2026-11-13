/**
 * Admin › Teams detail — the player join link and the latest matches, as pure
 * mappers. No I/O and no server import, so `tests/admin-team-links.spec.ts`
 * can pin them offline; `admin-team-server.ts` and `admin-matches-server.ts`
 * do the reads and hand the rows here.
 */

import type { MatchAnalysis } from "@/lib/data/match-analysis";
import type { JoinLinkMode } from "@/lib/services/programs/join-links";

// ---------------------------------------------------------------------------
// Player join link
// ---------------------------------------------------------------------------

/**
 * The program's live player join link (`/join/<token>`), as the admin page
 * shows it. `url` carries the raw token — it is the thing an admin copies —
 * so this value goes to the page and nowhere else: never a log line.
 */
export interface AdminTeamJoinLink {
  url: string;
  /** `open` — anyone with it joins; `approve` — it files a join request. */
  mode: JoinLinkMode;
}

/**
 * A `program_join_links` row as `AdminTeamJoinLink`, or null for no live link.
 *
 * `toUrl` builds the absolute URL from the token — `joinLinkUrl()` in the
 * loader, which is `siteUrl()` + `joinHref()`. Passed in rather than imported
 * because `siteUrl()` is a server-side resolver and this file stays a leaf.
 * The mode falls back to `open` exactly as `loadProgramJoinLink` does.
 */
export function adminTeamJoinLink(
  row: { token: string | null; mode: string | null } | null | undefined,
  toUrl: (token: string) => string,
): AdminTeamJoinLink | null {
  if (!row?.token) return null;
  return {
    url: toUrl(row.token),
    mode: row.mode === "approve" ? "approve" : "open",
  };
}

// ---------------------------------------------------------------------------
// Latest matches
// ---------------------------------------------------------------------------

/** How many matches the team page lists. */
export const ADMIN_TEAM_LATEST_MATCHES = 3;

/**
 * Admin › Matches' filter buckets. Declared here so this leaf does not import
 * the server module; `admin-matches-server.ts` re-exports it as
 * `AdminMatchBucket` and its `bucketFor()` is the one rule that fills it.
 */
export type AdminTeamMatchBucket =
  "uploading" | "analyzing" | "failed" | "settled";

/** What ordering by upload needs: the moment, then the match day, then the id. */
export interface UploadOrderKey {
  id: string;
  /** ISO moment, or null when nothing recorded one. */
  uploadedAt: string | null;
  /** `matches.date` as stored; compared as text, never parsed. */
  date: string | null;
}

/**
 * Newest upload first — Admin › Matches' order, and the one the team page's
 * latest matches use. A match with no known upload moment sorts last, by its
 * match day, then by id so the order is total.
 */
export function compareNewestUpload(
  a: UploadOrderKey,
  b: UploadOrderKey,
): number {
  if (a.uploadedAt && b.uploadedAt) {
    const diff = Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt);
    if (diff !== 0) return diff;
  } else if (a.uploadedAt) return -1;
  else if (b.uploadedAt) return 1;
  const day = (b.date ?? "").localeCompare(a.date ?? "");
  return day !== 0 ? day : b.id.localeCompare(a.id);
}

/** The `limit` newest uploads, newest first. Never mutates `rows`. */
export function newestUploads<T extends UploadOrderKey>(
  rows: readonly T[],
  limit: number = ADMIN_TEAM_LATEST_MATCHES,
): T[] {
  return [...rows].sort(compareNewestUpload).slice(0, Math.max(0, limit));
}

/** One of the program's newest matches, as the team page lists it. */
export interface AdminTeamLatestMatch {
  id: string;
  /** The uploader's side, then the other — Admin › Matches' seat rule. */
  player: string;
  opponent: string;
  /** ISO moment, or null when nothing recorded one. */
  uploadedAt: string | null;
  /** The analysis exactly as Admin › Matches resolves it. */
  analysis: MatchAnalysis;
  /** Admin › Matches' bucket for `analysis` — what a status chip keys on. */
  bucket: AdminTeamMatchBucket;
}

/** A match with everything `adminTeamLatestMatches` reads, before trimming. */
export interface AdminTeamMatchFacts extends UploadOrderKey {
  player: string;
  opponent: string;
  analysis: MatchAnalysis;
  bucket: AdminTeamMatchBucket;
}

/**
 * The team page's latest-matches list: the `limit` newest uploads, newest
 * first, each trimmed to what the page prints.
 */
export function adminTeamLatestMatches(
  rows: readonly AdminTeamMatchFacts[],
  limit: number = ADMIN_TEAM_LATEST_MATCHES,
): AdminTeamLatestMatch[] {
  return newestUploads(rows, limit).map((row) => ({
    id: row.id,
    player: row.player,
    opponent: row.opponent,
    uploadedAt: row.uploadedAt,
    analysis: row.analysis,
    bucket: row.bucket,
  }));
}
