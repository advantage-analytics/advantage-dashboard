import { notFound } from "next/navigation";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { MatchDetailHeader } from "@/components/dashboard/matches/match-detail-header";
import { getMatchStatisticsFromSupabase, getPlayerAverageStats } from "@/lib/data/match-stats-server";
import { getMatchPointsFromSupabase } from "@/lib/data/match-points-server";
import { formatDuration } from "@/components/dashboard/home/upload-match-modal/utils";
import type { Match, SetScore } from "@/lib/data/types";
import { createClient } from "@/lib/supabase/server";

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
  key_moments: Array<{ moment: string; description: string }> | null;
  insights: {
    player1?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
    player2?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
  } | null;
}

interface MatchLayoutProps {
  children: React.ReactNode;
  params: Promise<{ matchId: string }>;
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

  return scores1.map((player1Score, i) => ({
    player1: player1Score,
    player2: scores2[i] ?? 0,
    tiebreak: Boolean(tiebreaks1[i] || tiebreaks2[i]),
  }));
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

function transformDbMatchToMatch(row: DbMatch, userId: string): Match {
  const sets = buildSets(row);
  const winner = determineWinner(sets);
  const finalScore = sets.map((s) => `${s.player1}-${s.player2}`).join(", ");

  const isUserPlayer1 = row.player1_id === userId;
  const userWon = isUserPlayer1 ? winner === "player1" : winner === "player2";

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
    player1: { name: row.player1_name, school: "" },
    player2: { name: row.player2_name, school: "" },
    score: { sets, winner, finalScore },
    won: userWon,
  };
}

/* ── Filler data when AI analysis hasn't run yet ────── */

const FILLER_INSIGHTS = {
  player1: {
    strengths: [
      {
        name: "Reliable Second Serve",
        value: 75,
        description:
          "Your second serve was a consistent weapon, putting pressure on your opponent and preventing easy returns. The high placement accuracy forced defensive returns on the majority of second-serve points.",
      },
      {
        name: "Strong Baseline Endurance",
        value: 67,
        description:
          "You consistently outlasted your opponent in longer rallies, showcasing your fitness and consistency under pressure.",
      },
      {
        name: "Effective Return Pressure",
        value: 56,
        description:
          "Your ability to win return games and convert break points kept your opponent on the defensive throughout the match.",
      },
    ],
    weaknesses: [
      {
        name: "Backhand Error Rate",
        value: 71,
        description:
          "Focus on reducing unforced errors on your backhand to turn more defensive shots into offensive opportunities.",
      },
      {
        name: "Net Play Integration",
        value: 12,
        description:
          "Look for opportunities to come to the net and finish points proactively, adding variety to your game plan.",
      },
      {
        name: "First Serve Point Conversion",
        value: 68,
        description:
          "While your first serve percentage is solid, aim to win a higher percentage of those points to gain an even greater advantage.",
      },
    ],
  },
};

const FILLER_KEY_MOMENTS = [
  { moment: "Early Break", description: "Broke serve in the opening game with an aggressive return winner down the line, setting the tone for the first set." },
  { moment: "Momentum Shift", description: "After dropping serve at 4-3, you responded immediately with a break back, demonstrating strong mental resilience under pressure." },
  { moment: "Clutch Serving", description: "Saved three break points at 5-4 in the second set with consecutive first-serve winners to close out the match." },
  { moment: "Rally Dominance", description: "Won 8 of 10 rallies lasting longer than 9 shots, wearing down your opponent physically in the second set." },
];

export default async function MatchLayout({
  children,
  params,
}: MatchLayoutProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from("matches")
    .select(
      "id, player1_id, player2_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, key_moments, insights",
    )
    .eq("id", matchId)
    .single();

  if (error || !row) {
    notFound();
  }

  const match = transformDbMatchToMatch(row as DbMatch, user?.id ?? "");
  const [statsResult, points, playerAverages] = await Promise.all([
    getMatchStatisticsFromSupabase(matchId),
    getMatchPointsFromSupabase(matchId),
    user?.id ? getPlayerAverageStats(user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="flex-1 w-full bg-white">
      <MatchDataProvider
        match={match}
        statsResult={statsResult}
        points={points}
        keyMoments={row.key_moments?.length ? row.key_moments : FILLER_KEY_MOMENTS}
        insights={row.insights ?? FILLER_INSIGHTS}
        playerAverages={playerAverages}
      >
        <MatchDetailHeader matchId={matchId} />
        {children}
      </MatchDataProvider>
    </div>
  );
}
