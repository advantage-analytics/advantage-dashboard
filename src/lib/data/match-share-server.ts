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
import { formatMatchDuration } from "@/lib/format/duration";
import { siteUrl } from "@/lib/site-url";
import { matchShareUrl } from "@/lib/data/match-share-url";
import { displayName } from "@/lib/services/programs/invite-acceptance";
import { getInitials } from "@/lib/data/match-utils";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  realTournamentName,
  sharedMatchWinner,
  sharedVideoAllowed,
} from "@/lib/data/match-share-format";
import type { Match } from "@/lib/data/types";
import { matchPageKind, withStatsPublished } from "@/lib/data/match-analysis";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import {
  DEFAULT_BANDS,
  rowToBandSettings,
  type BandSettings,
  type BandSettingsDbRow,
} from "@/lib/data/viz-bands";
import { BAND_COLUMNS } from "@/lib/data/viz-bands-write";

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
 * A link carries the Statistics view always and the Visualizations view when
 * its maker left that on (`include_visualizations`); the shot rows the court
 * charts read are sent only then. The match video is on it only when someone
 * allowed to (`can_share_match_video`: staff, or players where the program
 * lets them) ticked `include_video` — and only while `sharedVideoAllowed`
 * still holds for that person (`video_shared_by`), asked again on every read.
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
  /** The link also shows the Visualizations view (`include_visualizations`). */
  includesVisualizations: boolean;
  /** The link also shows the match video (`include_video`). */
  includesVideo: boolean;
  /**
   * Who turned the link on and when ("Sep 26"), for the popover's closing
   * note. Null right after the viewer turns it on — the action hands back
   * the URL alone, and the page's revalidation fills these in a beat later —
   * and when the maker's account is gone or has no name.
   */
  madeBy?: (SharePerson & { isViewer: boolean }) | null;
  madeOn?: string | null;
}

// Re-exported for the actions; the spelling lives in `match-share-url.ts`.
export { matchShareUrl };

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
      /**
       * `programs.school_name` — the workspace's own name. Null when the
       * viewer cannot read the program (a custom org they are not in).
       */
      programName: string | null;
      /**
       * The match's `/dashboard` URL. Only a signed-in member of the program
       * can open it, which is exactly what the team rung promises — so it is
       * null for a viewer who is not a member themselves (the uploader or a
       * seated player from outside the program), who has no team to hand it
       * to.
       */
      teamUrl: string | null;
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
  /**
   * May this viewer put the match's video on its public link? The database's
   * rule (`can_share_match_video`), asked rather than re-derived: on a team
   * match that is the program's staff, and its players only where the program
   * allows it. Taking the video off again is anyone's who `canShare`.
   */
  canShareVideo: boolean;
  audience: ShareAudience;
}

/** "Sep 26" — the note's date. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Logs a failed read in this module's own voice, `matchId`/`programId` and all. */
function logShareError(
  action: string,
  error: { message: string } | null,
  context: Record<string, unknown>,
): void {
  if (!error) return;
  console.error(`[match-share] could not ${action}`, {
    ...context,
    message: error.message,
  });
}

/**
 * The team rung's facts: the program's name, how many seats it has and the
 * first three faces. `program_roster` and `program_member_avatars` both
 * answer any member of the program, so a player sees the same stack a coach
 * does. A failed roster read keeps the rung and drops the count and faces.
 *
 * `matches` RLS also lets a NON-member open a team match — its uploader, or a
 * seated player from outside the program — and for them the roster reads
 * come back empty rather than failing. `user_program_role` says which case
 * this is, so a non-member gets the rung without a team link, faces or a
 * headcount that would all be guesses.
 */
async function loadTeamAudience(
  supabase: SupabaseClient,
  matchId: string,
  programId: string,
): Promise<ShareAudience> {
  const [programResult, roleResult, rosterResult, avatars] = await Promise.all([
    supabase
      .from("programs")
      .select("school_name")
      .eq("id", programId)
      .maybeSingle(),
    supabase.rpc("user_program_role", { p_program_id: programId }),
    supabase.rpc("program_roster", { p_program_id: programId }),
    getMemberAvatarUrls(supabase, programId),
  ]);
  const programName =
    (programResult.data?.school_name as string | undefined) ?? null;
  // A failed role read is "not a member" — the quiet reading: no team link.
  if (typeof roleResult.data !== "string") {
    logShareError("read the viewer's team role", roleResult.error, {
      programId,
    });
    return {
      kind: "team",
      programName,
      teamUrl: null,
      memberCount: null,
      faces: [],
    };
  }
  logShareError("read the team roster", rosterResult.error, { programId });
  const roster = (rosterResult.data ?? []) as {
    user_id: string;
    display_name: string | null;
    email: string | null;
  }[];
  return {
    kind: "team",
    programName,
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
  const [
    linkResult,
    canShareResult,
    canShareVideoResult,
    matchResult,
    workspace,
  ] = await Promise.all([
    supabase
      .from("match_share_links")
      .select(
        "token, created_by, created_at, include_visualizations, include_video",
      )
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase.rpc("can_share_match", { p_match_id: matchId }),
    supabase.rpc("can_share_match_video", { p_match_id: matchId }),
    supabase
      .from("matches")
      .select("program_id")
      .eq("id", matchId)
      .maybeSingle(),
    getWorkspaceContext(),
  ]);
  logShareError("read the share link", linkResult.error, { matchId });
  logShareError("read share permission", canShareResult.error, { matchId });
  logShareError("read video share permission", canShareVideoResult.error, {
    matchId,
  });
  logShareError("read the match's program", matchResult.error, { matchId });
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
    resolveLinkMaker(createdBy, viewer),
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
          includesVisualizations:
            linkResult.data?.include_visualizations === true,
          includesVideo: linkResult.data?.include_video === true,
          madeBy,
          madeOn: createdAt ? shortDate(createdAt) : null,
        }
      : null,
    canShare,
    canShareVideo: canShare && canShareVideoResult.data === true,
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
  const person = await resolveUserIdentity(lazyAdminClient(), makerId);
  return person ? { ...person, isViewer: false } : null;
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
  /**
   * The link also shows the Visualizations view — its option is on AND the
   * match is past analysis (see the `settled` note). `points` carry their shots
   * when it does, or when `videoShared` (the film room reads them too).
   */
  includesVisualizations: boolean;
  /**
   * The link carries the match video AND whoever added it may still share it
   * (`sharedVideoAllowed`) AND the match is past analysis — the page's leave
   * to call `getSharedMatchVideo`.
   * Nothing is signed here: this loader also feeds the layout, the page
   * metadata and the Open Graph image, none of which play anything.
   */
  videoShared: boolean;
  /**
   * The depth/contact bands the Visualizations view buckets by: the ones the
   * match's own workspace follows (its program's, or the sharer's personal
   * ones), so the public court reads as the sharer's does. `DEFAULT_BANDS`
   * when that workspace never saved any, or the link has no visualizations.
   */
  bandSettings: BandSettings;
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
 * A user's display name and photo, by id. Their name is what they chose to
 * show to their team; their email is not, so a profile with no name yields
 * null rather than a fallback to the address.
 */
async function resolveUserIdentity(
  admin: SupabaseClient,
  userId: string,
): Promise<SharePerson | null> {
  const { data } = await admin
    .from("users")
    .select("first_name, last_name, avatar_path")
    .eq("id", userId)
    .maybeSingle();
  const name = displayName(data?.first_name ?? null, data?.last_name ?? null);
  if (!name) return null;
  const photoUrl = data?.avatar_path
    ? admin.storage.from(USER_AVATARS_BUCKET).getPublicUrl(data.avatar_path)
        .data.publicUrl
    : null;
  return { name, initials: getInitials(name), photoUrl };
}

/** The sharer's identity, dated for the rail footer. */
async function resolveSharedBy(
  admin: SupabaseClient,
  sharerUserId: string | null,
  createdAt: string,
): Promise<SharedBy | null> {
  if (!sharerUserId) return null;
  const person = await resolveUserIdentity(admin, sharerUserId);
  if (!person) return null;
  const sharedOn = new Date(createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { ...person, sharedOn };
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
 * The bands of the workspace a shared match lives in — `viz_band_settings`
 * is keyed by `Workspace.id`, the program's id for a team match and the
 * user's own for a personal one. Any miss is `DEFAULT_BANDS`, as in
 * `getBandSettings`.
 */
async function resolveSharedBands(
  admin: SupabaseClient,
  accountId: string | null,
): Promise<BandSettings> {
  if (!accountId) return DEFAULT_BANDS;
  const { data, error } = await admin
    .from("viz_band_settings")
    .select(BAND_COLUMNS)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    logShareError("read the shared match's bands", error, { accountId });
    return DEFAULT_BANDS;
  }
  return rowToBandSettings((data as BandSettingsDbRow | null) ?? null);
}

/** What `videoStillAllowed` reads off the match and its link. */
interface SharedVideoSubject {
  /** `match_share_links.video_shared_by` — who added the video. */
  sharerId: string | null;
  match: Pick<
    DbMatch,
    "created_by" | "player1_id" | "player2_id" | "program_id"
  >;
}

/**
 * `sharedVideoAllowed` over the live rows, on the service role: the
 * service-role spelling of `can_share_match_video` for an explicit user,
 * since that function reads `auth.uid()` and an anonymous request has none.
 * It asks about whoever ADDED the video — their seat on the match (their
 * login or a roster profile they claimed, as `my_player_ids()` names them),
 * their role on the match's program, and the program's own setting. A failed
 * read is "not allowed": the video is the one thing here that must not be
 * shown on a guess.
 */
async function videoStillAllowed(
  admin: SupabaseClient,
  { sharerId, match }: SharedVideoSubject,
): Promise<boolean> {
  if (!sharerId) return false;
  const programId = match.program_id;
  const [profiles, member, program] = await Promise.all([
    admin
      .from("program_players")
      .select("id")
      .eq("claimed_by_user_id", sharerId)
      .is("merged_into_id", null),
    programId
      ? admin
          .from("program_members")
          .select("role")
          .eq("program_id", programId)
          .eq("user_id", sharerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    programId
      ? admin
          .from("programs")
          .select("players_can_share_video")
          .eq("id", programId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const failed = profiles.error ?? member.error ?? program.error;
  if (failed) {
    logShareError("read who may share the video", failed, { programId });
    return false;
  }
  const playerIds = new Set<string>([
    sharerId,
    ...(profiles.data ?? []).map((row) => row.id as string),
  ]);
  return sharedVideoAllowed({
    sharerId,
    programId,
    sharerRole: (member.data?.role as string | undefined) ?? null,
    sharerOnMatch:
      match.created_by === sharerId ||
      (match.player1_id !== null && playerIds.has(match.player1_id)) ||
      (match.player2_id !== null && playerIds.has(match.player2_id)),
    playersCanShareVideo: program.data?.players_can_share_video === true,
  });
}

/**
 * The match a share token may play the video of, or null — the gate in front
 * of `getSharedMatchVideo` and of `GET /api/share/[token]/video`. One null
 * covers a bad token, a link without the video and a link whose video was
 * added by someone who may no longer share it, so the route cannot tell a
 * stranger which it was.
 */
export async function sharedVideoMatchId(
  token: string,
): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const admin = lazyAdminClient();
  const { data: link, error } = await admin
    .from("match_share_links")
    .select("match_id, video_shared_by, include_video")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    logShareError("resolve a share token for video", error, {});
    return null;
  }
  if (!link || link.include_video !== true) return null;
  const matchId = link.match_id as string;
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("created_by, player1_id, player2_id, program_id")
    .eq("id", matchId)
    .maybeSingle();
  if (matchError || !match) {
    logShareError("read the shared match's program", matchError, { matchId });
    return null;
  }
  const allowed = await videoStillAllowed(admin, {
    sharerId: (link.video_shared_by as string | null) ?? null,
    match: match as SharedVideoSubject["match"],
  });
  return allowed ? matchId : null;
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
      .select(
        "match_id, created_by, created_at, include_visualizations, include_video, video_shared_by",
      )
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
    const includesVisualizations = link.include_visualizations === true;
    const [
      statsResult,
      points,
      sharerIds,
      rosterIds,
      profileResult,
      windowSeconds,
      sharedBy,
      bandSettings,
      videoAllowed,
      jobs,
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
      includesVisualizations
        ? resolveSharedBands(admin, dbRow.program_id ?? sharerUserId)
        : Promise.resolve(DEFAULT_BANDS),
      link.include_video === true
        ? videoStillAllowed(admin, {
            sharerId: (link.video_shared_by as string | null) ?? null,
            match: dbRow,
          })
        : Promise.resolve(false),
      // The job's state, read as the dashboard reads it — never reaped or
      // reconciled from here: an anonymous page view must not move a job.
      loadMatchAnalysis(admin, [matchId]),
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
      match.duration = formatMatchDuration(windowSeconds * 1000);
    }

    // The single attribution point (guardrails §4), same as `page.tsx`.
    const sides = getMatchSides(match, statsResult);
    const insight = sides.pick(
      dbRow.insights?.player1,
      dbRow.insights?.player2,
    );
    const summary = insight?.summary?.trim() || null;

    const winner = sharedMatchWinner(dbRow.score, match.matchContext);

    // Guardrails §3.3, for a reader with a link. The dashboard stops at the
    // analysis steps while a match is in flight or failed, and never draws
    // its views; this page has no steps to show, so it keeps to Statistics
    // (which says there is no point-by-point data yet) and offers neither the
    // courts nor the film. The same predicates as `matches/[matchId]/page.tsx`
    // — a match can already hold points and a file mid-derivation, so "has
    // points" alone would let both views through.
    const jobAnalysis = analysisFor(jobs, {
      id: matchId,
      sourceProvider: match.sourceProvider,
      verificationStatus: match.verificationStatus,
    });
    const statsPublished = Boolean(
      statsResult?.statistics?.player1Stats &&
      statsResult?.statistics?.player2Stats,
    );
    const settled =
      matchPageKind({
        ...jobAnalysis,
        status: withStatsPublished(jobAnalysis.status, statsPublished),
      }) !== "steps";
    const showsVisualizations = includesVisualizations && settled;
    const videoShared = videoAllowed && settled;

    // Shot rows stay on the server unless a view that reads `point.shots` is
    // on the page — Visualizations, or the Video view's point card and court.
    // Shipping every shot of a full match to the browser would otherwise be
    // most of the page's serialized payload for nothing. `shots` is optional
    // on `MatchPoint`.
    const pagePoints =
      showsVisualizations || videoShared
        ? points
        : points.map((point) => ({ ...point, shots: undefined }));

    return {
      match,
      statsResult,
      points: pagePoints,
      includesVisualizations: showsVisualizations,
      videoShared,
      bandSettings,
      summary,
      sharedBy,
      winner,
    };
  },
);
