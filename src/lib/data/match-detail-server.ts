import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analysedWindowSeconds } from "@/lib/data/match-video-choice";
import {
  getMatchKpiHistory,
  getMatchStatisticsFromSupabase,
  getPlayerAverageStats,
  type MatchKpiHistory,
} from "@/lib/data/match-stats-server";
import { getMyPlayerIds, isMe } from "@/lib/data/player-identity-server";
import { youSeat } from "@/lib/data/viewer-side";
import { getMatchPointsFromSupabase } from "@/lib/data/match-points-server";
import { scoreWinner } from "@/lib/data/match-utils";
import { formatDuration } from "@/components/dashboard/matches/new-match-wizard/utils";
import type { Match, SetScore } from "@/lib/data/types";

interface DbMatch {
  id: string;
  program_id: string | null;
  created_by: string | null;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string;
  player2_name: string;
  tournament_name: string | null;
  round: string | null;
  date: string;
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
    /** Set when the games don't decide it — a retirement or default. */
    winner?: "player1" | "player2";
  } | null;
  result: string | null;
  match_type: string | null;
  court_type: string | null;
  event_entry_id: string | null;
  verified: boolean | null;
  duration: number | null;
  source_provider: string | null;
  player_hand: string | null;
  player_backhand: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
  key_moments: Array<{ moment: string; description: string }> | null;
  insights: {
    player1?: {
      summary?: string;
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
    player2?: {
      summary?: string;
      strengths?: Array<{ name: string; value: number; description: string }>;
      weaknesses?: Array<{ name: string; value: number; description: string }>;
    };
  } | null;
}

function formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildSets(row: DbMatch): SetScore[] {
  const scores1 = row.score?.player1 ?? [];
  const scores2 = row.score?.player2 ?? [];
  const tiebreaks1 = row.score?.player1_tiebreaks ?? [];
  const tiebreaks2 = row.score?.player2_tiebreaks ?? [];

  return scores1.map((player1Score, i) => {
    const t1 = tiebreaks1[i] ?? null;
    const t2 = tiebreaks2[i] ?? null;
    return {
      player1: player1Score,
      player2: scores2[i] ?? 0,
      player1Tiebreak: t1,
      player2Tiebreak: t2,
    };
  });
}

type PlayerProfile = { hand: string | null; backhand: string | null };

/**
 * Which seat on the row is "you", and the id sitting in it.
 *
 * Decided here and nowhere else on this page. `transformDbMatchToMatch`
 * orients everything the viewer sees from its `isUserPlayer1`, and the KPI
 * history is drawn for its `playerId`; both ask this function so the average
 * under a number cannot belong to a different person than the number does.
 * That is the failure guardrails §4 describes — nothing on screen looks wrong,
 * the baseline is simply someone else's — and two spellings of one test, kept
 * in step by hand, is how it starts.
 *
 * The seat is tested against every id that names the viewer, never
 * `=== userId`: a match recorded against a roster profile before the athlete
 * claimed it carries the PROFILE's id, and a login-only comparison read all of
 * those as somebody else's.
 *
 * The rule itself is `youSeat` (`viewer-side.ts`): the viewer's seat, else the
 * seat of a player on the match's program roster, else seat two. The roster
 * step is what keeps a coach's view of an athlete's match the right way up —
 * without it the page oriented from seat two and drew the opponent on top,
 * with the team's crest beside their name.
 */
function resolveYouSide(
  row: Pick<DbMatch, "player1_id" | "player2_id">,
  myPlayerIds: readonly string[],
  rosterIds: readonly string[],
): { isUserPlayer1: boolean; playerId: string | null } {
  const isUserPlayer1 = youSeat(row, myPlayerIds, rosterIds) === "player1";
  return {
    isUserPlayer1,
    playerId: isUserPlayer1 ? row.player1_id : row.player2_id,
  };
}

/**
 * Which of the row's two seat ids are players on the match's own program
 * roster. Empty for a personal match, without a round trip.
 */
async function resolveRosterSeatIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: Pick<DbMatch, "program_id" | "player1_id" | "player2_id">,
): Promise<string[]> {
  const seatIds = [row.player1_id, row.player2_id].filter(
    (id): id is string => id != null,
  );
  if (!row.program_id || seatIds.length === 0) return [];
  const { data } = await supabase
    .from("program_players")
    .select("id")
    .eq("program_id", row.program_id)
    .in("id", seatIds);
  return (data ?? []).map((player) => player.id as string);
}

function transformDbMatchToMatch(
  row: DbMatch,
  /**
   * Every id that names the viewer as a player — their login, plus any roster
   * profile they have claimed. One id is not enough: a match a coach recorded
   * for this athlete before they had an account carries the PROFILE's id.
   */
  playerIds: readonly string[],
  profiles: Map<string, PlayerProfile>,
  /** The row's seat ids that are on its program's roster (`youSeat`). */
  rosterIds: readonly string[],
): Match {
  const sets = buildSets(row);
  // The shared rule (a stored winner, then sets). A level score has always
  // read as player2 here.
  const winner = scoreWinner(row.score) ?? "player2";
  const finalScore = sets.map((s) => `${s.player1}-${s.player2}`).join(", ");
  const { isUserPlayer1 } = resolveYouSide(row, playerIds, rosterIds);
  const userWon = isUserPlayer1 ? winner === "player1" : winner === "player2";

  const p1Profile = row.player1_id ? profiles.get(row.player1_id) : undefined;
  const p2Profile = row.player2_id ? profiles.get(row.player2_id) : undefined;

  // Match-row hand/backhand columns are captured at upload time and represent
  // what was true for THIS match; they win over generic users-table profile.
  // The "player_*" columns track the user (creator); "opponent_*" tracks the other side.
  const userHand = row.player_hand ?? undefined;
  const userBackhand = row.player_backhand ?? undefined;
  const oppHand = row.opponent_hand ?? undefined;
  const oppBackhand = row.opponent_backhand ?? undefined;

  const p1Hand = isUserPlayer1 ? userHand : oppHand;
  const p1Backhand = isUserPlayer1 ? userBackhand : oppBackhand;
  const p2Hand = isUserPlayer1 ? oppHand : userHand;
  const p2Backhand = isUserPlayer1 ? oppBackhand : userBackhand;

  return {
    id: row.id,
    tournamentName: row.tournament_name ?? "Unknown Event",
    date: formatDisplayDate(row.date),
    matchType: row.match_type ?? "Match",
    courtType: row.court_type ?? undefined,
    verificationStatus: row.verified ? "Verified Result" : undefined,
    sourceProvider: row.source_provider ?? undefined,
    round: row.round ?? undefined,
    matchContext: row.result ?? "Final Score",
    duration: formatDuration(row.duration ?? undefined),
    durationSec: row.duration != null ? Math.round(row.duration / 1000) : null,
    player1: {
      name: row.player1_name,
      school: "",
      hand: p1Hand ?? p1Profile?.hand ?? undefined,
      backhand: p1Backhand ?? p1Profile?.backhand ?? undefined,
    },
    player2: {
      name: row.player2_name,
      school: "",
      hand: p2Hand ?? p2Profile?.hand ?? undefined,
      backhand: p2Backhand ?? p2Profile?.backhand ?? undefined,
    },
    score: { sets, winner, finalScore },
    won: userWon,
    isUserPlayer1,
  };
}

const FILLER_KEY_MOMENTS = [
  {
    moment: "Early Break",
    description:
      "Broke serve in the opening game with an aggressive return winner down the line, setting the tone for the first set.",
  },
  {
    moment: "Momentum Shift",
    description:
      "After dropping serve at 4-3, you responded immediately with a break back, demonstrating strong mental resilience under pressure.",
  },
  {
    moment: "Clutch Serving",
    description:
      "Saved three break points at 5-4 in the second set with consecutive first-serve winners to close out the match.",
  },
  {
    moment: "Rally Dominance",
    description:
      "Won 8 of 10 rallies lasting longer than 9 shots, wearing down your opponent physically in the second set.",
  },
  {
    moment: "Set Point Conversion",
    description:
      "Closed out the first set with a forehand winner up the line on your second set point, refusing to let the opportunity slip.",
  },
  {
    moment: "Strong Finish",
    description:
      "Won the final four games in a row to seal the match, mixing aggressive returning with high first-serve percentage on the closing hold.",
  },
];

/**
 * Which event a match's line belongs to, or null if it has no line.
 *
 * One hop, not two: the event's name is already on the match row, so the page
 * needs the id and nothing else to build a link back to the lineup it came
 * from. RLS answers this the same way it answers the schedule — a viewer
 * outside the program gets no row, and the link simply does not render.
 */
async function getEventIdForEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entryId: string | null,
): Promise<string | null> {
  if (!entryId) return null;
  const { data } = await supabase
    .from("program_event_entries")
    .select("event_id")
    .eq("id", entryId)
    .maybeSingle();
  return data?.event_id ?? null;
}

/** One row of `program_roster_full`, narrowed to what the uploader lookup uses. */
interface DbRosterMember {
  /** The id this person's matches carry — a `program_players.id`, or a staff seat's user id. */
  player_id: string;
  /** Their login, or null for a coach-managed player who has never claimed one. */
  user_id: string | null;
  display_name: string | null;
  email: string | null;
}

/**
 * Who filed this match, when that is not the player it belongs to.
 *
 * `created_by` has always been on the row and has never been rendered: it was
 * a query filter and nothing else. Inside a program that leaves a real gap —
 * a coach files for their squad, and a player may file for a teammate
 * (`players_can_upload`, and the roster page advertises it) — so an athlete
 * opening a match they did not upload had no way to see where it came from.
 *
 * **The two columns cannot be compared directly.** They hold different KINDS
 * of id: `created_by` is always a login, while `player1_id` is normally the
 * roster PROFILE's id (`program_players.id`), which is what survives a claim.
 * So a player filing their own match produces two different uuids for one
 * person, and `created_by !== player1_id` would label almost every match as
 * filed by somebody else. `program_roster_full` is the mapping between the two
 * — it returns `player_id` beside the `user_id` that claimed it — so the
 * comparison happens in login space.
 *
 * That RPC is SECURITY DEFINER and gated on the caller being a member of the
 * program, which is what makes this safe to ask for: a viewer outside the
 * program gets an empty set and the line simply does not render. Personal
 * matches never ask at all — with no program there is no roster, and the
 * uploader is the player.
 */
async function resolveUploadedBy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: Pick<DbMatch, "program_id" | "created_by" | "player1_id">,
): Promise<string | null> {
  if (!row.program_id || !row.created_by) return null;
  // A match filed by the player it is attributed to has nothing to report, and
  // that is the shape the ordinary wizard writes — `player1_id` is the
  // uploader's own login. Answering it here rather than after the fetch skips
  // a whole-roster RPC on the commonest case, on the app's heaviest page.
  if (row.created_by === row.player1_id) return null;

  const { data } = await supabase.rpc("program_roster_full", {
    p_program_id: row.program_id,
  });
  const roster = (data ?? []) as DbRosterMember[];

  // The login behind whoever this match is attributed to. An id the roster
  // does not know — an archived or merged profile, or a member id written by
  // the ordinary wizard — stands for itself rather than resolving to nobody.
  const attributed = roster.find(
    (member) => member.player_id === row.player1_id,
  );
  if ((attributed?.user_id ?? row.player1_id) === row.created_by) return null;

  const uploader = roster.find((member) => member.user_id === row.created_by);
  if (!uploader) return null;

  // Same fallback the ladder uses: `program_players` requires both names, so a
  // player row always has one, and only a staff seat with an unfilled profile
  // reaches the address.
  return (
    uploader.display_name?.trim() ||
    (uploader.email ?? "").split("@")[0] ||
    null
  );
}

/**
 * The KPI strip's baseline and sparklines, for whoever the page calls "you".
 *
 * Whose history this is comes from `resolveYouSide` and nowhere else, so it is
 * the same person the tile's own number belongs to. The id is read off the
 * already-authorised match row — never taken from the request — and RLS under
 * the reads is what bounds the answer; this decides only who the figures are
 * attributed to, never who may see them.
 *
 * `viewerIsPlayer` is the caller's to set (the loader says so): true exactly
 * when the you-side id is one of the viewer's own. When it is, the history is
 * drawn over the viewer's whole id set rather than the one id on the row. A
 * claimed athlete's matches sit under two ids — their login on personal
 * uploads, their roster profile on program ones — and a history read from one
 * of them is half a season under a label that says "your avg";
 * `getPlayerAverageStats` averages over the full set for the same reason.
 * Anyone else — a coach — is known to this page only by the id on the row.
 */
async function resolveKpiHistory(
  row: Pick<DbMatch, "id" | "player1_id" | "player2_id">,
  myPlayerIds: readonly string[],
  rosterIds: readonly string[],
): Promise<MatchKpiHistory | null> {
  const { playerId } = resolveYouSide(row, myPlayerIds, rosterIds);
  const viewerIsPlayer = isMe(playerId, myPlayerIds);
  const history = await getMatchKpiHistory(
    viewerIsPlayer ? myPlayerIds : playerId ? [playerId] : [],
    row.id,
  );
  return history ? { ...history, viewerIsPlayer } : null;
}

/**
 * Cached data fetcher for match detail pages.
 * React.cache deduplicates calls within the same request,
 * so both layout.tsx and page.tsx can call this without double-fetching.
 */
/**
 * The analysed window of a video match with no stored duration, in seconds.
 *
 * `matches.duration` is 0 on every video match the wizard created (it only
 * reads a length out of a SwingVision export), so without this the report's
 * scoreboard has no clock. The newest completed job's
 * `end_time_seconds − start_time_seconds` is the part of the video the player
 * marked as the match (`analysedWindowSeconds`).
 *
 * Read through the admin client only after the RLS-scoped `matches` read has
 * returned this row, the same order `getMatchVideo` uses: `processing_jobs`
 * RLS is per-creator, so a coach viewing a player's match would otherwise read
 * nothing. Only the two window columns leave the query.
 */
async function resolveAnalysedWindowSeconds(
  dbRow: DbMatch,
): Promise<number | null> {
  if (dbRow.source_provider !== "splitstep") return null;
  if (dbRow.duration != null && dbRow.duration > 0) return null;

  const { data: jobs, error } = await createAdminClient()
    .from("processing_jobs")
    .select("start_time_seconds, end_time_seconds")
    .eq("match_id", dbRow.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[match-detail] could not read the analysed window", {
      matchId: dbRow.id,
      message: error.message,
    });
    return null;
  }
  return analysedWindowSeconds(jobs ?? []);
}

export const getMatchDetailData = cache(async (matchId: string) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from("matches")
    .select(
      "id, program_id, created_by, player1_id, player2_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, event_entry_id, verified, duration, source_provider, player_hand, player_backhand, opponent_hand, opponent_backhand, key_moments, insights",
    )
    .eq("id", matchId)
    .single();

  if (error) {
    // PGRST116 = "Results contain 0 rows" — the match genuinely doesn't exist.
    // Anything else is a transient/server error; throw so the route's error.tsx
    // boundary renders the retry surface instead of collapsing to a 404.
    if (error.code === "PGRST116") return null;
    throw error;
  }
  if (!row) {
    return null;
  }

  const dbRow = row as DbMatch;

  const playerIds = [dbRow.player1_id, dbRow.player2_id].filter(
    (id): id is string => id != null,
  );
  // Started ahead of the batch and awaited inside it, so the history and the
  // transform below orient from one answer without a serial round trip.
  const rosterIdsPromise = resolveRosterSeatIds(supabase, dbRow);
  const [
    statsResult,
    points,
    playerAverages,
    kpiHistory,
    eventId,
    uploadedBy,
    profileResult,
    windowSeconds,
  ] = await Promise.all([
    getMatchStatisticsFromSupabase(matchId),
    getMatchPointsFromSupabase(matchId),
    // The averages need to know which ids mean "me" — a coach may have recorded
    // this athlete's earlier matches against a roster profile they only claimed
    // later. Chained inside the batch rather than awaited in front of it, so
    // only this branch waits on the lookup.
    (async () =>
      getPlayerAverageStats(user?.id ? await getMyPlayerIds() : [], matchId))(),
    // The history hangs off the same lookup, one step further: which seat on
    // the row is "you" — and so whose baseline this is — is decided from the
    // viewer's ids. Chained for the same reason as the averages.
    (async () =>
      resolveKpiHistory(
        dbRow,
        user?.id ? await getMyPlayerIds() : [],
        await rosterIdsPromise,
      ))(),
    // The entry lookup rides this wave rather than following it: it needs only
    // `dbRow`, which is already in hand, and nothing else here reads its answer.
    // It resolves to null for every match with no line behind it, which is every
    // personal match and every challenge or practice a program records.
    getEventIdForEntry(supabase, dbRow.event_entry_id),
    // Same wave, same reason: it needs only `dbRow`, and it resolves to null
    // without a round trip for every personal match.
    resolveUploadedBy(supabase, dbRow),
    // Profile metadata is independent of stats, points, and history.
    playerIds.length > 0
      ? supabase.from("users").select("id, hand, backhand").in("id", playerIds)
      : Promise.resolve({ data: [] }),
    // A video match's length, for the rail scoreboard's clock, when the row
    // has none (the wizard writes 0 for video). Same wave: it needs only
    // `dbRow`, and it skips the round trip for every match that has one.
    resolveAnalysedWindowSeconds(dbRow),
  ]);

  const profiles = new Map<string, PlayerProfile>();
  for (const profile of profileResult.data ?? []) {
    profiles.set(profile.id, {
      hand: profile.hand,
      backhand: profile.backhand,
    });
  }

  // `getMyPlayerIds` is `cache()`d and already resolved inside the batch above,
  // so this is a map lookup rather than a second round trip.
  const myPlayerIds = user?.id ? await getMyPlayerIds() : [];
  const match = transformDbMatchToMatch(
    dbRow,
    myPlayerIds,
    profiles,
    await rosterIdsPromise,
  );
  match.eventId = eventId;
  match.uploadedBy = uploadedBy;
  if (!(match.durationSec && match.durationSec > 0) && windowSeconds) {
    match.durationSec = windowSeconds;
    match.duration = formatDuration(windowSeconds * 1000);
  }

  return {
    match,
    statsResult,
    points,
    keyMoments: dbRow.key_moments?.length
      ? dbRow.key_moments
      : FILLER_KEY_MOMENTS,
    // Read raw, never substituted: a match with no stored insight gets
    // `null` and the report draws no insight card. A stand-in paragraph
    // here would be attributed on screen to Advantage Intelligence
    // (spec 2026-09-15 match report › Decisions 4).
    insights: dbRow.insights ?? null,
    playerAverages,
    kpiHistory,
  };
});
