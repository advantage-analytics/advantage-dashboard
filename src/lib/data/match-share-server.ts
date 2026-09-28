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
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
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

/** A person drawn in the Share popover: a face and a name. */
export interface SharePerson {
  name: string;
  initials: string;
  photoUrl: string | null;
}

export interface MatchShareLink {
  /** The absolute public URL, from `siteUrl()` — the one to copy and mail. */
  url: string;
  /**
   * Who turned the link on and when ("Sep 26"), for the popover's closing
   * note. Null right after the viewer turns it on — the action hands back
   * the URL alone, and the page's revalidation fills these in a beat later —
   * and when the maker's account is gone or has no name.
   */
  madeBy?: (SharePerson & { isViewer: boolean }) | null;
  madeOn?: string | null;
}

/** `${siteUrl()}/m/${token}` — one spelling, shared by the loader and the actions. */
export function matchShareUrl(token: string): string {
  return `${siteUrl()}/m/${encodeURIComponent(token)}`;
}

/**
 * Who can open the match inside Advantage today — the first rung of the
 * popover's access choice. Decided by the MATCH's program, not the active
 * workspace: `matches` RLS lets every member of `program_id` read it, and
 * nobody else but its uploader and seated players.
 */
export type ShareAudience =
  | { kind: "personal" }
  | {
      kind: "team";
      /** `programs.school_name` — the workspace's own name. */
      programName: string;
      /**
       * The match's `/dashboard` URL. Only a signed-in member of the program
       * can open it, which is exactly what the team rung promises.
       */
      teamUrl: string;
      /** Seats on the program, or null when the roster could not be read. */
      memberCount: number | null;
      /** The first few members, owner and coaches first, for the face stack. */
      faces: SharePerson[];
    };

/** What the Share popover needs to know about this viewer and this match. */
export interface MatchShareState {
  /** The public link, if one is on and this viewer may see it. */
  link: MatchShareLink | null;
  /**
   * May this viewer turn the link on or off? The database's own rule
   * (`can_share_match`: the uploader, either seated player, or program
   * staff), asked rather than re-derived here, so the popover and the RLS
   * policies can never disagree. A plain teammate can open the match but
   * not publish it; the popover shows them the choice unavailable and says
   * who can, instead of letting them flip it into an error.
   */
  canShare: boolean;
  /**
   * Whether a public link exists at all — true whenever `link` is set, and
   * also for a teammate who may not read the link row itself. Without it,
   * the teammate's panel would mark "Meridian State" as the chosen rung on a
   * match that is in fact public. Carries no token.
   */
  publicLinkOn: boolean;
  audience: ShareAudience;
}

/** "Sep 26" — the note's date. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The team rung's facts: the program's name, how many seats it has and the
 * first three faces. `program_roster` and `program_member_avatars` both
 * answer any member of the program, so a player sees the same stack a coach
 * does. A failed roster read keeps the rung and drops the count and faces.
 */
async function loadTeamAudience(
  supabase: SupabaseClient,
  matchId: string,
  programId: string,
): Promise<ShareAudience> {
  const [programResult, rosterResult, avatars] = await Promise.all([
    supabase
      .from("programs")
      .select("school_name")
      .eq("id", programId)
      .maybeSingle(),
    supabase.rpc("program_roster", { p_program_id: programId }),
    getMemberAvatarUrls(supabase, programId),
  ]);
  if (rosterResult.error) {
    console.error("[match-share] could not read the team roster", {
      programId,
      message: rosterResult.error.message,
    });
  }
  const roster = (rosterResult.data ?? []) as {
    user_id: string;
    display_name: string | null;
    email: string | null;
  }[];
  return {
    kind: "team",
    programName:
      (programResult.data?.school_name as string | undefined) ?? "Team",
    teamUrl: `${siteUrl()}/dashboard/matches/${encodeURIComponent(matchId)}`,
    memberCount: rosterResult.error ? null : roster.length,
    faces: roster.slice(0, 3).map((member) => {
      const name = member.display_name ?? member.email?.split("@")[0] ?? "";
      return {
        name,
        initials: getInitials(name),
        photoUrl: avatars.get(member.user_id) ?? null,
      };
    }),
  };
}

/**
 * The match's share state for the signed-in viewer. The link row and the
 * permission are RLS-scoped: a viewer who cannot share reads no link row and
 * `can_share_match` answers false. Two reads go through the service role,
 * each only after the viewer's own `matches` read proved they can open the
 * match: the name of whoever made the link (the public page prints it to
 * anyone anyway), and — for a viewer who cannot read the link row — whether
 * one exists. A failed read degrades to "no link, cannot share, personal" —
 * the quiet, safe reading — rather than failing the page.
 */
export async function getMatchShareState(
  matchId: string,
): Promise<MatchShareState> {
  const supabase = await createClient();
  const [linkResult, canShareResult, matchResult, workspace] =
    await Promise.all([
      supabase
        .from("match_share_links")
        .select("token, created_by, created_at")
        .eq("match_id", matchId)
        .maybeSingle(),
      supabase.rpc("can_share_match", { p_match_id: matchId }),
      supabase
        .from("matches")
        .select("program_id")
        .eq("id", matchId)
        .maybeSingle(),
      getWorkspaceContext(),
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
  if (matchResult.error) {
    console.error("[match-share] could not read the match's program", {
      matchId,
      message: matchResult.error.message,
    });
  }
  const canShare = canShareResult.data === true;
  const visible = Boolean(matchResult.data);
  const programId =
    (matchResult.data?.program_id as string | null | undefined) ?? null;
  const token = linkResult.data?.token as string | undefined;
  const createdBy = (linkResult.data?.created_by as string | null) ?? null;
  const createdAt = linkResult.data?.created_at as string | undefined;
  const viewer = workspace?.viewer ?? null;

  const [audience, madeBy, linkExists] = await Promise.all([
    programId
      ? loadTeamAudience(supabase, matchId, programId)
      : Promise.resolve<ShareAudience>({ kind: "personal" }),
    resolveLinkMaker(token ? createdBy : null, viewer),
    // Only a viewer who could not read the row needs asking, and only once
    // they have shown they can open the match.
    !token && !canShare && visible
      ? lazyAdminClient()
          .from("match_share_links")
          .select("match_id")
          .eq("match_id", matchId)
          .maybeSingle()
          .then(({ data }) => Boolean(data))
      : Promise.resolve(false),
  ]);

  return {
    link: token
      ? {
          url: matchShareUrl(token),
          madeBy,
          madeOn: createdAt ? shortDate(createdAt) : null,
        }
      : null,
    canShare,
    publicLinkOn: Boolean(token) || linkExists,
    audience,
  };
}

/** The link's maker: the viewer from their own session, anyone else by id. */
async function resolveLinkMaker(
  makerId: string | null,
  viewer: {
    id: string;
    name: string;
    initials: string;
    avatarUrl: string | null;
  } | null,
): Promise<(SharePerson & { isViewer: boolean }) | null> {
  if (!makerId) return null;
  if (viewer && makerId === viewer.id) {
    return {
      name: viewer.name,
      initials: viewer.initials,
      photoUrl: viewer.avatarUrl,
      isViewer: true,
    };
  }
  const person = await resolveSharedBy(
    lazyAdminClient(),
    makerId,
    new Date().toISOString(),
  );
  return person
    ? {
        name: person.name,
        initials: person.initials,
        photoUrl: person.photoUrl,
        isViewer: false,
      }
    : null;
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

    // A failed points read is unknown, not zero points: same as every other
    // failed read here, never draw a report built on it.
    if (!points) {
      console.error("[match-share] could not read the shared match's points", {
        matchId,
      });
      return null;
    }

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
