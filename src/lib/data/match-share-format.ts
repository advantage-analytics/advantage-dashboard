import {
  formatScoreboardStatus,
  scoreWinner,
  type MatchScore,
} from "@/lib/data/match-utils";

/**
 * Pure helpers for the public share page (`/m/[token]`). No server imports,
 * so the offline specs can load them directly.
 */

/**
 * The token in a share URL, decoded — or "" when the percent-encoding is
 * malformed (a link cut off mid-escape by a mail client). "" reads as an
 * unknown token everywhere, so the reader lands on "That link isn't valid"
 * rather than an error screen. `decodeURIComponent` throws `URIError` on bad
 * input; nothing on the public route may let that escape.
 */
export function readShareToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/**
 * Who the public page may say won: "player1", "player2", or null when the
 * match does not settle it.
 *
 * Read from the RAW score, never from `Match.score.winner` — the dashboard
 * transform defaults that to player2 when the score cannot say (no score,
 * level sets), which is harmless inside the app and a false "def." on a
 * public link. An unfinished match has no winner either, whatever the sets
 * show.
 */
export function sharedMatchWinner(
  score: MatchScore | null | undefined,
  matchContext: string | undefined,
): "player1" | "player2" | null {
  if (formatScoreboardStatus(matchContext) === "UNFINISHED") return null;
  return scoreWinner(score);
}

/** "A def. B" with the winner first, or "A vs B" when nobody won. */
export function sharedMatchPair(
  player1: string,
  player2: string,
  winner: "player1" | "player2" | null,
): string {
  if (winner === "player1") return `${player1} def. ${player2}`;
  if (winner === "player2") return `${player2} def. ${player1}`;
  return `${player1} vs ${player2}`;
}

/**
 * The dashboard's match transforms used to fill a missing tournament with the
 * placeholder "Unknown Event"; they now carry null, and the app prints a muted
 * "No event". The literal can still arrive — a row stored with it, or a caller
 * that predates the change — and on a public link, a preview card or an email
 * subject it would read as a fact about the match. Public surfaces ask this
 * instead: the real name, or null.
 */
export const UNKNOWN_EVENT_PLACEHOLDER = "Unknown Event";

export function realTournamentName(
  name: string | null | undefined,
): string | null {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === UNKNOWN_EVENT_PLACEHOLDER) return null;
  return trimmed;
}

/**
 * May a public link show the match's video right now? Asked every time the
 * link is read, about the person who ADDED the video
 * (`match_share_links.video_shared_by`) — the database asked the same
 * question of them when they ticked the box, and this is its twin
 * (`can_share_match_video`), so the answer changing is what takes the video
 * back off the page: a program that turns "players can share video" off, a
 * coach who leaves the staff, a player no longer on the match, an account
 * that is gone.
 *
 *   - nobody on record → never;
 *   - they may no longer share the match at all (`can_share_match`: its
 *     uploader, a seated player, or the program's staff) → no;
 *   - a personal match → yes;
 *   - a team match → they are on the program's staff today, or the program
 *     lets its players share video.
 */
export function sharedVideoAllowed(link: {
  /** Who added the video; null when their account is gone. */
  sharerId: string | null;
  programId: string | null;
  /** The sharer's role on the match's program today; null when not a member. */
  sharerRole: string | null;
  /** The sharer uploaded the match or holds one of its two seats. */
  sharerOnMatch: boolean;
  playersCanShareVideo: boolean;
}): boolean {
  if (!link.sharerId) return false;
  const isStaff =
    link.programId !== null &&
    (link.sharerRole === "owner" ||
      link.sharerRole === "coach" ||
      link.sharerRole === "staff");
  if (!link.sharerOnMatch && !isStaff) return false;
  if (!link.programId) return true;
  return isStaff || link.playersCanShareVideo;
}

/**
 * What a public link shows, in words — the rail footer on `/m/[token]` and
 * the Share popover's closing note print the same phrase, after a date, in
 * about 220px, so it names the one fact the rail's own switcher does not
 * make obvious rather than listing every view ("Statistics and
 * visualizations" wrapped the footer onto a second line): whether the video
 * is there.
 */
export function shareScopeLabel(scope: {
  visualizations: boolean;
  video: boolean;
}): string {
  if (scope.video) return "With video";
  return scope.visualizations ? "No video" : "Statistics only";
}

/* ── The Video tab's cut, on a link ──────────────────────────────────────── */

/**
 * What the Share popover may put on a public link beside the token: the
 * Video tab's applied cut, as the address bar carries it — `?f=` (the
 * shared filters, `match-filters/model.ts`) and/or `?pn=` (a point set,
 * `lib/match-video/point-set.ts`). An answer's "Watch" link lands with
 * both, so a coach or a parent can be sent exactly those points
 * (roadmap 6.3).
 */
export interface FilmSharePreset {
  /** The serialized shared filters, or null. */
  filters: string | null;
  /** The serialized point set, or null. */
  points: string | null;
}

/**
 * The preset the current page holds, read off its query string: only on
 * the Video tab (`tab=film`), and only while a cut is applied. Null for
 * every other page and for an unfiltered film — there is nothing to carry.
 */
export function filmSharePresetOf(
  search: string | URLSearchParams,
): FilmSharePreset | null {
  const query = new URLSearchParams(search.toString());
  if (query.get("tab") !== "film") return null;
  const filters = query.get("f")?.trim() || null;
  const points = query.get("pn")?.trim() || null;
  return filters || points ? { filters, points } : null;
}

/**
 * The public URL with the preset on it: `?tab=film` (the share page's own
 * view parameter, `report-view.ts`), then `f` and `pn` as the Video tab
 * reads them. Whatever query the URL already carried is kept.
 */
export function withFilmSharePreset(
  url: string,
  preset: FilmSharePreset,
): string {
  const [base, hash = ""] = url.split("#", 2);
  const [path, search = ""] = base.split("?", 2);
  const query = new URLSearchParams(search);
  query.set("tab", "film");
  if (preset.filters) query.set("f", preset.filters);
  else query.delete("f");
  if (preset.points) query.set("pn", preset.points);
  else query.delete("pn");
  return `${path}?${query.toString()}${hash ? `#${hash}` : ""}`;
}
