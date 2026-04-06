import { notFound } from "next/navigation";
import Image from "next/image";
import { Calendar, Check, Clock, GraduationCap } from "lucide-react";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { MatchNavigationTabs } from "@/components/dashboard/matches/match-navigation-tabs";
import { MatchTabSidebar } from "@/components/dashboard/matches/match-tab-sidebar";
import { getMatchStatisticsFromSupabase } from "@/lib/data/match-stats-server";
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
  const [statsResult, points] = await Promise.all([
    getMatchStatisticsFromSupabase(matchId),
    getMatchPointsFromSupabase(matchId),
  ]);

  return (
    <div className="flex-1 w-full bg-white">
      {/* Light hero header */}
      <section className="bg-white pt-8 pb-8 px-8 border-b border-[#F0F0F0]">
        {/* Compact inline strip */}
        <div className="flex items-center justify-between gap-8 min-w-0">
          {/* Left player */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="text-[30px] font-light text-[#0D0D0D] tracking-[-0.6px] leading-tight truncate">
              {match.player1.name}
            </span>
            {match.score.winner === "player1" && (
              <span className="shrink-0 inline-flex items-center gap-1 bg-[rgba(93,185,85,0.1)] text-[#5DB955] rounded-full px-2.5 py-0.5 text-[10px] font-medium leading-none">
                <Check className="h-3 w-3 shrink-0" />
                Winner
              </span>
            )}
          </div>

          {/* Set scores */}
          <div className="flex items-center gap-8 shrink-0">
            {match.score.sets.map((set, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
                  Set {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-3xl font-bold tabular-nums leading-none ${set.player1 > set.player2 ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                    {set.player1}{set.tiebreak ? <sup className="text-sm">*</sup> : null}
                  </span>
                  <span className="text-sm text-[#D9D9D9]">&ndash;</span>
                  <span className={`text-3xl font-bold tabular-nums leading-none ${set.player2 > set.player1 ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                    {set.player2}{set.tiebreak ? <sup className="text-sm">*</sup> : null}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Right player */}
          <div className="flex items-center justify-end gap-2.5 min-w-0 flex-1">
            {match.score.winner === "player2" && (
              <span className="shrink-0 inline-flex items-center gap-1 bg-[rgba(93,185,85,0.1)] text-[#5DB955] rounded-full px-2.5 py-0.5 text-[10px] font-medium leading-none">
                <Check className="h-3 w-3 shrink-0" />
                Winner
              </span>
            )}
            <span className="text-[30px] font-light text-[#0D0D0D] tracking-[-0.6px] leading-tight truncate">
              {match.player2.name}
            </span>
          </div>
        </div>

        {/* Metadata pills */}
        <div className="mt-4 flex gap-2 flex-wrap items-center">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-inset ring-[#E7E7E7] bg-white text-[#888888] text-xs font-medium">
            <Calendar className="h-3 w-3 shrink-0 text-[#888888]" />
            {match.date}
          </span>
          {match.courtType && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-inset ring-[#E7E7E7] bg-white text-[#888888] text-xs font-medium">
              <Image src="/icons/tennis-court-icon.svg" alt="Court" width={12} height={12} className="shrink-0" />
              {match.courtType}
            </span>
          )}
          {match.matchType && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-inset ring-[#E7E7E7] bg-white text-[#888888] text-xs font-medium">
              {match.matchType === "Tournament" ? (
                <Image src="/icons/tournament-icon.svg" alt="Tournament" width={12} height={12} className="shrink-0" />
              ) : (
                <GraduationCap className="h-3 w-3 shrink-0 text-[#888888]" />
              )}
              {match.matchType}
            </span>
          )}
          {match.duration && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-inset ring-[#E7E7E7] bg-white text-[#888888] text-xs font-medium">
              <Clock className="h-3 w-3 shrink-0 text-[#888888]" />
              {match.duration}
            </span>
          )}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-inset ring-[#E7E7E7] bg-white text-[#888888] text-xs font-medium">
            <Image
              src="/icons/verified-check-icon.svg"
              alt="Verified"
              width={12}
              height={12}
              className={`shrink-0 ${match.verificationStatus ? "" : "grayscale"}`}
            />
            {match.verificationStatus ?? "Unverified Result"}
          </span>
        </div>
      </section>

      {/* Tabs + content */}
      <div className="px-8 pb-16">
        <div>
          <div className="pt-6">
            <MatchNavigationTabs matchId={matchId} />
          </div>
          <MatchDataProvider match={match} statsResult={statsResult} points={points} keyMoments={row.key_moments ?? []} insights={row.insights ?? null}>
            <div className="flex flex-row mt-6 pb-6 gap-8">
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-10 min-w-0">{children}</div>
              </div>

              <div className="sticky top-8 w-[384px] flex-shrink-0 self-start h-fit">
                <MatchTabSidebar
                  match={match}
                  matchId={matchId}
                  statsResult={statsResult}
                  points={points}
                />
              </div>
            </div>
          </MatchDataProvider>
        </div>
      </div>
    </div>
  );
}
