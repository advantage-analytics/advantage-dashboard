import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { lazyAdminClient } from "@/lib/supabase/admin";
import {
  MATCH_DETAIL_COLUMNS,
  resolveAnalysedWindowSeconds,
  resolveRosterSeatIds,
  transformDbMatchToMatch,
  type DbMatch,
  type PlayerProfile,
} from "@/lib/data/match-detail-server";
import {
  getMatchStatisticsFromSupabase,
  type MatchStatisticsResult,
} from "@/lib/data/match-stats-server";
import {
  getMatchPointsFromSupabase,
  type MatchPoint,
} from "@/lib/data/match-points-server";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { formatDuration } from "@/components/dashboard/matches/new-match-wizard/utils";
import { siteUrl } from "@/lib/site-url";
import { displayName } from "@/lib/services/programs/invite-acceptance";
import { getInitials } from "@/lib/data/match-utils";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import {
  realTournamentName,
  sharedMatchWinner,
} from "@/lib/data/match-share-format";
import type { Match } from "@/lib/data/types";

/**
 * Public read-only match links (`/m/[token]`).
 *
 * Two readers, on two clients, on purpose:
 *
 * - `getMatchShareState` runs on the request's cookie client. RLS on
 *   `match_share_links` answers whether THIS viewer may see the match's link
 *   (`can_share_match`), so the Share popover shows a link only to someone
 *   who could have minted it.
 * - `getSharedMatchData` runs on the service role. An anonymous visitor has no
 *   grant on anything the report reads, and that is the point: the token is
 *   the only key, it is looked up here and nowhere else, and one `null`
 *   covers "never existed", "mistyped" and "turned off" alike — a bad token
 *   must not learn whether it was ever a good one (same rule as
 *   `/join/[token]`).
 *
 * The public page draws the sharer's view of the match: `transformDbMatchToMatch`
 * is oriented from the ids that name the person who made the link (their
 * login plus any roster profile they have claimed), through the same `youSeat`
 * the dashboard uses, so a match reads the same way up on both pages. A match
 * shared by a coach falls to the roster seat, exactly as the coach sees it.
 * The columns are read as stored and never reordered (guardrails §4).
 *
 * What the public page does NOT get: point bookmarks (they carry teammates'
 * user ids), the viewer's averages and KPI history (an anonymous reader has
 * no baseline), and nothing from `processing_jobs` beyond the analysed window
 * the dashboard already reads through the admin client.
 */

export interface MatchShareLink {
  /** The absolute public URL, from `siteUrl()` — the one to copy and mail. */
  url: string;
}

/** `${siteUrl()}/m/${token}` — one spelling, shared by the loader and the actions. */
export function matchShareUrl(token: string): string {
  return `${siteUrl()}/m/${encodeURIComponent(token)}`;
}

/** What the Share popover needs to know about this viewer and this match. */
export interface MatchShareState {
  /** The public link, if one is on and this viewer may see it. */
  link: MatchShareLink | null;
  /**
   * May this viewer turn the link on or off? The database's own rule
   * (`can_share_match`: the uploader, either seated player, or program
   * staff), asked rather than re-derived here, so the popover and the RLS
   * policies can never disagree. A plain teammate can open the match but
   * not publish it; the popover shows them the switch disabled and says why,
   * instead of letting them flip it into an error.
   */
  canShare: boolean;
}

/**
 * The match's share state for the signed-in viewer. RLS-scoped on both
 * reads: a viewer who cannot share reads no link row and `can_share_match`
 * answers false. A failed read degrades to "no link, cannot share" — the
 * quiet, safe reading — rather than failing the page.
 */
export async function getMatchShareState(
  matchId: string,
): Promise<MatchShareState> {
  const supabase = await createClient();
  const [linkResult, canShareResult] = await Promise.all([
    supabase
      .from("match_share_links")
      .select("token")
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase.rpc("can_share_match", { p_match_id: matchId }),
  ]);
  if (linkResult.error) {
    console.error("[match-share] could not read the share link", {
      matchId,
      message: linkResult.error.message,
    });
  }
  if (canShareResult.error) {
    console.error("[match-share] could not read share permission", {
      matchId,
      message: canShareResult.error.message,
    });
  }
  const token = linkResult.data?.token as string | undefined;
  return {
    link: token ? { url: matchShareUrl(token) } : null,
    canShare: canShareResult.data === true,
  };
}

/** Who turned the link on, for the rail's footer. */
export interface SharedBy {
  name: string;
  initials: string;
  photoUrl: string | null;
  /** When the link was made, formatted for display ("September 26, 2026"). */
  sharedOn: string;
}

export interface SharedMatchData {
  match: Match;
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
  /** The sharer's insight summary, already `sides.pick`ed; null when none. */
  summary: string | null;
  /**
   * The person who shared it. Null when their account is gone
   * (`created_by` nulls on delete) or their profile has no name to show —
   * the footer then falls back to the product alone rather than an email.
   */
  sharedBy: SharedBy | null;
  /**
   * Who the public page may name as the winner, from the RAW score
   * (`sharedMatchWinner`); null for an unscored, level or unfinished match.
   * Never `match.score.winner`, which defaults to player2 when the score
   * cannot say.
   */
  winner: "player1" | "player2" | null;
}

/**
 * The sharer's name and photo. Their name is what they chose to show to
 * their team; their email is not, so a profile with no name yields null
 * rather than a fallback to the address.
 */
async function resolveSharedBy(
  admin: SupabaseClient,
  sharerUserId: string | null,
  createdAt: string,
): Promise<SharedBy | null> {
  if (!sharerUserId) return null;
  const { data } = await admin
    .from("users")
    .select("first_name, last_name, avatar_path")
    .eq("id", sharerUserId)
    .maybeSingle();
  const name = displayName(data?.first_name ?? null, data?.last_name ?? null);
  if (!name) return null;
  const photoUrl = data?.avatar_path
    ? admin.storage.from(USER_AVATARS_BUCKET).getPublicUrl(data.avatar_path)
        .data.publicUrl
    : null;
  const sharedOn = new Date(createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { name, initials: getInitials(name), photoUrl, sharedOn };
}

/**
 * Every id that names the sharer as a player: their login, plus every roster
 * profile they have claimed. The service-role spelling of `my_player_ids()`,
 * which cannot run for an anonymous request.
 */
async function resolveSharerIds(
  admin: SupabaseClient,
  sharerUserId: string | null,
): Promise<string[]> {
  if (!sharerUserId) return [];
  const { data } = await admin
    .from("program_players")
    .select("id")
    .eq("claimed_by_user_id", sharerUserId);
  return [sharerUserId, ...(data ?? []).map((row) => row.id as string)];
}

/**
 * The match behind a share token, or null. `cache()`d so `page.tsx`,
 * `generateMetadata` and `opengraph-image.tsx` share one read per request.
 */
export const getSharedMatchData = cache(
  async (token: string): Promise<SharedMatchData | null> => {
    if (!token || token.length > 128) return null;
    const admin = lazyAdminClient();

    const { data: link, error: linkError } = await admin
      .from("match_share_links")
      .select("match_id, created_by, created_at")
      .eq("token", token)
      .maybeSingle();
    if (linkError) {
      console.error("[match-share] could not resolve a share token", {
        message: linkError.message,
      });
      return null;
    }
    if (!link) return null;

    const matchId = link.match_id as string;
    const { data: row, error } = await admin
      .from("matches")
      .select(MATCH_DETAIL_COLUMNS)
      .eq("id", matchId)
      .maybeSingle();
    if (error) {
      console.error("[match-share] could not read the shared match", {
        matchId,
        message: error.message,
      });
      return null;
    }
    if (!row) return null;
    const dbRow = row as unknown as DbMatch;

    const seatIds = [dbRow.player1_id, dbRow.player2_id].filter(
      (id): id is string => id != null,
    );
    const sharerUserId = (link.created_by as string | null) ?? null;
    const [
      statsResult,
      points,
      sharerIds,
      rosterIds,
      profileResult,
      windowSeconds,
      sharedBy,
    ] = await Promise.all([
      getMatchStatisticsFromSupabase(matchId, admin),
      getMatchPointsFromSupabase(matchId, admin, { includeBookmarks: false }),
      resolveSharerIds(admin, sharerUserId),
      resolveRosterSeatIds(admin, dbRow),
      seatIds.length > 0
        ? admin.from("users").select("id, hand, backhand").in("id", seatIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              hand: string | null;
              backhand: string | null;
            }[],
          }),
      resolveAnalysedWindowSeconds(dbRow),
      resolveSharedBy(admin, sharerUserId, link.created_at as string),
    ]);

    const profiles = new Map<string, PlayerProfile>();
    for (const profile of profileResult.data ?? []) {
      profiles.set(profile.id, {
        hand: profile.hand,
        backhand: profile.backhand,
      });
    }

    const match = transformDbMatchToMatch(
      dbRow,
      sharerIds,
      profiles,
      rosterIds,
    );
    // No "Unknown Event" on a public page: the facts line, the preview card
    // and the page description all skip an empty name.
    match.tournamentName = realTournamentName(dbRow.tournament_name) ?? "";
    if (!(match.durationSec && match.durationSec > 0) && windowSeconds) {
      match.durationSec = windowSeconds;
      match.duration = formatDuration(windowSeconds * 1000);
    }

    // The single attribution point (guardrails §4), same as `page.tsx`.
    const sides = getMatchSides(match, statsResult);
    const insight = sides.pick(
      dbRow.insights?.player1,
      dbRow.insights?.player2,
    );
    const summary = insight?.summary?.trim() || null;

    // Shot rows stay on the server. Only the Video and Visualizations views
    // read `point.shots`, and the public page renders neither — shipping
    // every shot of a full match to the browser would be most of the page's
    // serialized payload for nothing. `shots` is optional on `MatchPoint`.
    const pagePoints = points.map((point) => ({ ...point, shots: undefined }));

    const winner = sharedMatchWinner(dbRow.score, match.matchContext);

    return {
      match,
      statsResult,
      points: pagePoints,
      summary,
      sharedBy,
      winner,
    };
  },
);
