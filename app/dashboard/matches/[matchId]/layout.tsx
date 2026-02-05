import { notFound } from "next/navigation";

import { MatchEventHeader } from "@/components/dashboard/matches/match-event-header";
import { MatchNavigationTabs } from "@/components/dashboard/matches/match-navigation-tabs";
import { MatchSidebar } from "@/components/dashboard/matches/match-sidebar";
import { getMatchStatisticsFromSupabase } from "@/lib/data/match-stats-server";
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
      "id, player1_id, player2_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration"
    )
    .eq("id", matchId)
    .single();

  if (error || !row) {
    notFound();
  }

  const match = transformDbMatchToMatch(row as DbMatch, user?.id ?? "");
  const statsResult = await getMatchStatisticsFromSupabase(matchId);

  return (
    <div className="flex-1 w-full bg-white">
      <div className="relative z-10 pt-[88px] px-8">
        <div className="flex flex-row py-6 gap-8">
          <div className="flex-1 min-w-0 flex flex-col gap-10">
            <MatchEventHeader
              tournamentName={match.tournamentName}
              date={match.date}
              matchType={match.matchType}
              courtType={match.courtType}
              verificationStatus={match.verificationStatus}
            />
            <MatchNavigationTabs matchId={matchId} />
            <div className="flex flex-col gap-10 min-w-0">{children}</div>
          </div>

          <div className="sticky top-8 w-[320px] flex-shrink-0 self-start h-fit">
            <MatchSidebar
              match={match}
              matchId={matchId}
              statsResult={statsResult}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
