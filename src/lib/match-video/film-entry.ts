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
 *
 * Note what does NOT reach `empty`: a `problem` of either kind, and an
 * attachment that is `present` or unknown. A match whose attachment state
 * could not be read is not a match with no video, and a view that said so
 * would be handing the creator a duplicate-upload button on the strength of a
 * failed query.
 */
export function filmEntryView(
  entry: MatchFilmEntry,
): "empty" | "unavailable" | "stale" {
  if (entry.problem === "stale_attachment") return "stale";
  if (entry.problem === "storage_unavailable") return "unavailable";
  return entry.attachment === "absent" ? "empty" : "unavailable";
}

/** Whether the viewer may take a given entry. Never computed from match data. */
export function canTakeFilmAction(
  entry: MatchFilmEntry,
  action: FilmEntryAction,
): boolean {
  return entry.actions.includes(action);
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
