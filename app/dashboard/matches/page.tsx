import Link from "next/link";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/components/dashboard/home/upload-match-modal/utils";

interface DbMatch {
  id: string;
  player1_id: string | null;
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

interface DisplayMatch {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
  round?: string;
  matchContext?: string;
  duration?: string;
  player1: { name: string };
  player2: { name: string };
  score: {
    sets: { player1: number; player2: number; tiebreak?: boolean }[];
    winner: "player1" | "player2";
  };
}

function formatDisplayDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function transformDbMatch(row: DbMatch, userId: string): DisplayMatch | null {
  if (!row.score?.player1?.length || !row.score?.player2?.length) return null;

  const sets = row.score.player1.map((p1Score, i) => ({
    player1: p1Score,
    player2: row.score?.player2[i] ?? 0,
    tiebreak:
      ((row.score?.player1_tiebreaks?.[i] ?? 0) > 0 ||
        (row.score?.player2_tiebreaks?.[i] ?? 0) > 0),
  }));

  let p1Sets = 0;
  let p2Sets = 0;
  for (const set of sets) {
    if (set.player1 > set.player2) p1Sets++;
    else if (set.player2 > set.player1) p2Sets++;
  }

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
    player1: { name: row.player1_name },
    player2: { name: row.player2_name },
    score: {
      sets,
      winner: p1Sets > p2Sets ? "player1" : "player2",
    },
  };
}

export default async function MatchesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let matches: DisplayMatch[] = [];

  if (user) {
    const { data: rows } = await supabase
      .from("matches")
      .select(
        "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration"
      )
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (rows) {
      matches = (rows as DbMatch[])
        .map((row) => transformDbMatch(row, user.id))
        .filter((m): m is DisplayMatch => m !== null);
    }
  }

  return (
    <div className="flex-1 w-full bg-white">
      <div className="relative z-10 px-8 py-12 pt-[136px]">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-medium text-[#0D0D0D] mb-2">
              Matches
            </h1>
            <p className="text-base font-normal text-[#999999]">
              View and manage all your tennis matches. Click on any match to see
              detailed statistics and insights.
            </p>
          </div>

          {/* Matches Grid */}
          {matches.length > 0 ? (
            <div className="space-y-4">
              {matches.map((match) => (
                <Link
                  key={match.id}
                  href={`/dashboard/matches/${match.id}`}
                  className="block bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl hover:border-[#999999] transition-colors"
                >
                  <div className="flex flex-row justify-between items-start">
                    <div className="flex-1">
                      <div className="flex flex-row justify-between items-center mb-4">
                        <h2 className="text-lg font-medium text-[#0D0D0D]">
                          {match.tournamentName}
                        </h2>
                        <p className="text-sm font-medium text-[#999999]">
                          {match.date}
                        </p>
                      </div>

                      {/* Match Type and Status */}
                      <div className="flex flex-row gap-4 items-center mb-4">
                        <p className="text-xs font-medium text-[#999999]">
                          {match.matchType}
                        </p>
                        {match.courtType && (
                          <p className="text-xs font-medium text-[#999999]">
                            {match.courtType}
                          </p>
                        )}
                        {match.verificationStatus && (
                          <p className="text-xs font-medium text-[#999999]">
                            {match.verificationStatus}
                          </p>
                        )}
                      </div>

                      {/* Players and Score */}
                      <div className="space-y-2">
                        <div className="flex flex-row justify-between items-center">
                          <p
                            className={`font-semibold text-sm ${
                              match.score.winner === "player1"
                                ? "text-[#0D0D0D]"
                                : "text-[#B3B3B3]"
                            }`}
                          >
                            {match.player1.name}
                          </p>
                          <div className="flex flex-row gap-4 font-semibold text-base">
                            {match.score.sets.map((set, idx) => (
                              <p
                                key={idx}
                                className={
                                  set.player1 > set.player2
                                    ? "text-[#0D0D0D]"
                                    : "text-[#B3B3B3]"
                                }
                              >
                                {set.player1}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-row justify-between items-center">
                          <p
                            className={`font-semibold text-sm ${
                              match.score.winner === "player2"
                                ? "text-[#0D0D0D]"
                                : "text-[#B3B3B3]"
                            }`}
                          >
                            {match.player2.name}
                          </p>
                          <div className="flex flex-row gap-4 font-semibold text-base">
                            {match.score.sets.map((set, idx) => (
                              <p
                                key={idx}
                                className={
                                  set.player2 > set.player1
                                    ? "text-[#0D0D0D]"
                                    : "text-[#B3B3B3]"
                                }
                              >
                                {set.player2}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Match Context */}
                      <p className="text-xs font-medium text-[#999999] mt-3">
                        {match.matchContext}
                        {match.round && ` | ${match.round}`}
                        {match.duration && ` | ${match.duration}`}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
              <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
                <Inbox className="h-8 w-8 text-[#999999]" />
              </div>
              <p className="font-medium text-[#000000] mb-1">No matches yet</p>
              <p className="text-sm text-[#999999]">
                Upload your first match to see it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
