import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMatchStatisticsFromSupabase, getPlayerAverageStats } from "@/lib/data/match-stats-server";
import { getMatchPointsFromSupabase } from "@/lib/data/match-points-server";
import { formatDuration } from "@/components/dashboard/home/upload-match-modal/utils";
import type { Match, SetScore } from "@/lib/data/types";

interface DbMatch {
  id: string;
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
  } | null;
  result: string | null;
  match_type: string | null;
  court_type: string | null;
  verified: boolean | null;
  duration: number | null;
  player_hand: string | null;
  player_backhand: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
  key_moments: Array<{ moment: string; description: string }> | null;
  insights: {
    player1?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
    player2?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
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
      tiebreak: t1 != null || t2 != null,
      player1Tiebreak: t1,
      player2Tiebreak: t2,
    };
  });
}

function determineWinner(sets: SetScore[]): "player1" | "player2" {
  let player1Sets = 0;
  let player2Sets = 0;
  for (const set of sets) {
    if (set.player1 > set.player2) player1Sets++;
    else if (set.player2 > set.player1) player2Sets++;
  }
  return player1Sets > player2Sets ? "player1" : "player2";
}

type PlayerProfile = { hand: string | null; backhand: string | null };

function transformDbMatchToMatch(
  row: DbMatch,
  userId: string,
  profiles: Map<string, PlayerProfile>,
): Match {
  const sets = buildSets(row);
  const winner = determineWinner(sets);
  const finalScore = sets.map((s) => `${s.player1}-${s.player2}`).join(", ");
  const isUserPlayer1 = row.player1_id === userId;
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
    round: row.round ?? undefined,
    matchContext: row.result ?? "Final Score",
    duration: formatDuration(row.duration ?? undefined),
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

const FILLER_INSIGHTS: NonNullable<DbMatch["insights"]> = {
  player1: {
    strengths: [
      { name: "Reliable Second Serve", value: 75, description: "Your second serve was a consistent weapon, putting pressure on your opponent and preventing easy returns. The high placement accuracy forced defensive returns on the majority of second-serve points." },
      { name: "Strong Baseline Endurance", value: 67, description: "You consistently outlasted your opponent in longer rallies, showcasing your fitness and consistency under pressure." },
      { name: "Effective Return Pressure", value: 56, description: "Your ability to win return games and convert break points kept your opponent on the defensive throughout the match." },
    ],
    weaknesses: [
      { name: "Backhand Error Rate", value: 71, description: "Focus on reducing unforced errors on your backhand to turn more defensive shots into offensive opportunities." },
      { name: "Net Play Integration", value: 12, description: "Look for opportunities to come to the net and finish points proactively, adding variety to your game plan." },
      { name: "First Serve Point Conversion", value: 68, description: "While your first serve percentage is solid, aim to win a higher percentage of those points to gain an even greater advantage." },
    ],
  },
};

const FILLER_KEY_MOMENTS = [
  { moment: "Early Break", description: "Broke serve in the opening game with an aggressive return winner down the line, setting the tone for the first set." },
  { moment: "Momentum Shift", description: "After dropping serve at 4-3, you responded immediately with a break back, demonstrating strong mental resilience under pressure." },
  { moment: "Clutch Serving", description: "Saved three break points at 5-4 in the second set with consecutive first-serve winners to close out the match." },
  { moment: "Rally Dominance", description: "Won 8 of 10 rallies lasting longer than 9 shots, wearing down your opponent physically in the second set." },
];

/**
 * Returns the user's previous/next match ids in chronological order:
 * `previousId` = older match (earlier date), `nextId` = newer match (later date).
 * Used for arrow-key navigation between adjacent matches.
 * Returns null on either side at the list bounds.
 */
export const getAdjacentMatchIds = cache(async (currentMatchId: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { previousId: null, nextId: null };

  const { data } = await supabase
    .from("matches")
    .select("id")
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  if (!data) return { previousId: null, nextId: null };

  const idx = data.findIndex((m) => m.id === currentMatchId);
  if (idx === -1) return { previousId: null, nextId: null };

  // Array is date desc, so a smaller index = newer match.
  return {
    previousId: idx < data.length - 1 ? data[idx + 1].id : null,
    nextId: idx > 0 ? data[idx - 1].id : null,
  };
});

/**
 * Cached data fetcher for match detail pages.
 * React.cache deduplicates calls within the same request,
 * so both layout.tsx and page.tsx can call this without double-fetching.
 */
export const getMatchDetailData = cache(async (matchId: string) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player2_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, player_hand, player_backhand, opponent_hand, opponent_backhand, key_moments, insights",
    )
    .eq("id", matchId)
    .single();

  if (error || !row) {
    return null;
  }

  const dbRow = row as DbMatch;

  const playerIds = [dbRow.player1_id, dbRow.player2_id].filter(
    (id): id is string => id != null,
  );
  const profiles = new Map<string, PlayerProfile>();
  if (playerIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, hand, backhand")
      .in("id", playerIds);
    if (users) {
      for (const u of users) {
        profiles.set(u.id, { hand: u.hand, backhand: u.backhand });
      }
    }
  }

  const match = transformDbMatchToMatch(dbRow, user?.id ?? "", profiles);
  const [statsResult, points, playerAverages] = await Promise.all([
    getMatchStatisticsFromSupabase(matchId),
    getMatchPointsFromSupabase(matchId),
    user?.id ? getPlayerAverageStats(user.id) : Promise.resolve(null),
  ]);

  return {
    match,
    statsResult,
    points,
    keyMoments: dbRow.key_moments?.length ? dbRow.key_moments : FILLER_KEY_MOMENTS,
    insights: dbRow.insights ?? FILLER_INSIGHTS,
    playerAverages,
  };
});
