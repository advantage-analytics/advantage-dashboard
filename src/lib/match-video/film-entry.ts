/**
 * What the match report's Video view may offer, and what it must never offer
 * (plan step 14, Film-entry half).
 *
 * The whole capability is three fields, and each one exists because leaving it
 * out produced a specific wrong screen:
 *
 *   `actions`     which wizard entries to draw. Server-derived, always: a
 *                 client that decided for itself whether the viewer may add or
 *                 replace would be answering a question only
 *                 `authorizeMatchVideoMutation` can answer, and would answer it
 *                 differently from the endpoints the button is about to call.
 *                 Empty is the normal answer — every viewer who is not the
 *                 match's own creator gets it, and an empty list draws NO
 *                 control at all rather than a disabled one.
 *
 *   `attachment`  whether a saved video is active right now. Read for anyone
 *                 who can SEE the match, exactly as playback is (T12), because
 *                 "is there a video" and "may you change it" are different
 *                 questions and the Video view asks the first one of everybody.
 *                 `null` means the state could not be read — never "no".
 *
 *   `problem`     storage could not be reached, or the active row's file is
 *                 gone. Both are errors about a match that HAS a video.
 *
 * ── The rule this file exists to keep ───────────────────────────────────────
 *
 * A storage failure and a missing file must never render as "no video for this
 * match — add one". `playback.ts` refuses the same fold at the API layer, and
 * for the same reason: telling a creator their match has no video invites them
 * to upload a duplicate over a row that is still active, and that is a second
 * multi-gigabyte blob and a replacement nobody asked for. {@link filmEntryView}
 * is that rule as one pure function, so a test can hold it.
 *
 * Dependency-free on purpose — the server resolver, the Film view and the
 * specs all import it, and only a module with no Supabase and no Azure in it
 * can be imported from a `"use client"` file.
 */

import type { MatchVideoMode } from "./types";

/* -------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------- */

/**
 * A wizard entry the viewer may take. One per mode, and named the same, so
 * there is no second vocabulary to keep in step with
 * `/dashboard/matches/new?mode=`.
 */
export type FilmEntryAction = MatchVideoMode;

/**
 * Why a match that has a video cannot show one.
 *
 *   storage_unavailable  the store could not be asked — retry
 *   stale_attachment     the active row's file is not there — replacing it is
 *                        the repair, and retrying the same read is not
 *
 * Kept apart for the reason `playback.ts` keeps them apart: one is worth
 * another attempt and the other never will be.
 */
export type FilmEntryProblem = "storage_unavailable" | "stale_attachment";

export interface MatchFilmEntry {
  /** `null` when the saved state could not be read. Never a stand-in for "no". */
  attachment: "present" | "absent" | null;
  /** Empty for every viewer but the authorized creator. */
  actions: readonly FilmEntryAction[];
  problem: FilmEntryProblem | null;
  /**
   * The workspace's match-video allowance, for a viewer who may `add`.
   * `null` for everyone else, and when the count could not be read — the
   * empty state then keeps its plain copy rather than guessing a number.
   */
  quota: FilmEntryQuota | null;
  /**
   * ISO 8601 — when the match's video was removed for going a year unwatched
   * (SwingVision Add video T10): the `retired_at` of the match's LATEST
   * retired row, when that row's `retired_reason` is `'expired'`. Read only
   * when no video is active, so it is null whenever `attachment` is not
   * `"absent"`; null too when the read failed or the column is not there yet —
   * the page then falls back to the plain empty state, which is still true.
   */
  expiredAt: string | null;
}

/**
 * The one match currently holding a personal workspace's only video — what
 * the at-cap empty state points at ("Open Reid vs Cho"). Names and date are
 * `matches` columns as stored; formatting is the view's job.
 */
export interface FilmEntryQuotaHolder {
  matchId: string;
  playerName: string | null;
  opponentName: string | null;
  /** ISO 8601 — `matches.date`. */
  date: string | null;
}

/**
 * `used` of `cap` active match videos in the active workspace (T4's
 * `getMatchVideoUsage`). `holder` is set for a personal workspace holding its
 * video and null for a team, whose at-cap offer is Settings › Usage instead.
 */
export interface FilmEntryQuota {
  used: number;
  cap: number;
  holder: FilmEntryQuotaHolder | null;
}

/**
 * Nothing known, nothing offered — the answer for a viewer the access ladder
 * refused outright, and the safe default for any caller that has not resolved
 * a capability yet. It offers no action, so it can never invite an upload.
 */
export const NO_FILM_ENTRY: MatchFilmEntry = {
  attachment: null,
  actions: [],
  problem: null,
  quota: null,
  expiredAt: null,
};

/* -------------------------------------------------------------------------
 * The rule
 * ---------------------------------------------------------------------- */

/**
 * Which state the Video view draws when no playable video reached it.
 *
 *   empty        there is demonstrably no video — the only state that may
 *                carry an "Add video" offer
 *   unavailable  something is attached, or the state could not be read; a
 *                retryable error
 *   stale        something is attached and its file is gone; an error, and
 *                not one a retry fixes
 *   expired      there is demonstrably no video, and the last one was removed
 *                for going a year unwatched (T10). Carries the same "Add
 *                video" offer as `empty`, under different copy
 *
 * Note what does NOT reach `empty`: a `problem` of either kind, and an
 * attachment that is `present` or unknown. A match whose attachment state
 * could not be read is not a match with no video, and a view that said so
 * would be handing the creator a duplicate-upload button on the strength of a
 * failed query.
 */
export function filmEntryView(
  entry: MatchFilmEntry,
): "empty" | "expired" | "unavailable" | "stale" {
  if (entry.problem === "stale_attachment") return "stale";
  if (entry.problem === "storage_unavailable") return "unavailable";
  if (entry.attachment !== "absent") return "unavailable";
  // Only an established absence can be "expired" — the same guard `empty`
  // has, so a failed read can never tell anyone their video was removed.
  return entry.expiredAt ? "expired" : "empty";
}

/** Whether the viewer may take a given entry. Never computed from match data. */
export function canTakeFilmAction(
  entry: MatchFilmEntry,
  action: FilmEntryAction,
): boolean {
  return entry.actions.includes(action);
}

/** Whether the workspace has no match video left to spend. */
export function atMatchVideoCap(quota: FilmEntryQuota | null): boolean {
  return quota !== null && quota.used >= quota.cap;
}

/** "1 of 1 match video used" / "3 of 25 match videos used". */
export function matchVideoCountLabel(quota: FilmEntryQuota): string {
  const noun = quota.cap === 1 ? "match video" : "match videos";
  return `${quota.used} of ${quota.cap} ${noun} used`;
}

/** The last word of a full name — "Marcus Reid" → "Reid". */
function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/**
 * "Aug 30" from `matches.date`. A bare `YYYY-MM-DD` is a calendar day, so it
 * is read in UTC — local time would print the day before west of Greenwich.
 */
function shortMatchDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso,
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * How the at-cap copy names the holder: "Marcus Reid vs Daniel Cho (Aug 30)"
 * in the sentence, "Reid vs Cho" on the button. Either name missing falls back
 * to "another match", which is true and names nobody wrongly.
 */
export function quotaHolderLabels(holder: FilmEntryQuotaHolder): {
  full: string;
  short: string;
} {
  const a = holder.playerName?.trim();
  const b = holder.opponentName?.trim();
  if (!a || !b) return { full: "another match", short: "that match" };
  const date = shortMatchDate(holder.date);
  return {
    full: `${a} vs ${b}${date ? ` (${date})` : ""}`,
    short: `${surname(a)} vs ${surname(b)}`,
  };
}

/* -------------------------------------------------------------------------
 * Expiry copy (T10)
 * ---------------------------------------------------------------------- */

/**
 * "Oct 23" / "Oct 23, 2026" from an ISO timestamp, in UTC — the zone the
 * warning email (`templates/match-video-expiry.ts`) prints the same date in,
 * so the notice and the email never name two different days. Null for a
 * value that does not parse, so no copy ever says "Invalid Date".
 */
function expiryDate(iso: string, withYear: boolean): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * The Video view's expiry notice: "Not watched in 11 months, so this video
 * will be removed on Oct 23. The statistics stay."
 */
export function expiryNoticeCopy(
  monthsUnwatched: number,
  expiresAt: string,
): string {
  const months = `${monthsUnwatched} ${monthsUnwatched === 1 ? "month" : "months"}`;
  const date = expiryDate(expiresAt, false);
  const when = date ? `on ${date}` : "soon";
  return `Not watched in ${months}, so this video will be removed ${when}. The statistics stay.`;
}

/** The expired state's body, dated with the year the removal happened in. */
export function expiredBodyCopy(expiredAt: string): string {
  const date = expiryDate(expiredAt, true);
  const when = date ? ` on ${date}` : "";
  return `Nobody watched it for a year, so it was removed${when}. The statistics and the point list are unchanged. Add the film again to get the clips back.`;
}

/* -------------------------------------------------------------------------
 * Where the actions go
 * ---------------------------------------------------------------------- */

/**
 * The attachment wizard, opened for one match in one mode — the route T21
 * resolves, and the only entry point to it.
 *
 * Client-safe, so a `<Link>` can import it; the page it points at runs the
 * whole authorization ladder again before drawing anything, so this href is a
 * destination and never a permission. Separate from `addVideoHref()`, which
 * opens the video-ANALYSIS wizard (`?match=`) for a different set of matches.
 */
export function matchVideoWizardHref(
  matchId: string,
  mode: MatchVideoMode,
): string {
  return `/dashboard/matches/new?videoFor=${encodeURIComponent(matchId)}&mode=${mode}`;
}

/**
 * A match's Video view.
 *
 * `?tab=film` is the EXISTING selection contract — `parseReportView()` in
 * `components/dashboard/matches/match-detail/report-view.ts` reads it, and
 * `reportViewQuery()` writes it. Lives here, client-safe, so the empty
 * state's "Open Reid vs Cho" can link with it;
 * `match-video-attachment-server.ts` re-exports it for the wizard route.
 */
export function matchFilmHref(matchId: string): string {
  return `/dashboard/matches/${encodeURIComponent(matchId)}?tab=film`;
}

/** Settings › Usage, where a team manages its match videos. */
export const MATCH_VIDEO_USAGE_HREF = "/dashboard/settings/usage";
