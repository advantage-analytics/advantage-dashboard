import Link from "next/link";
import type { Match } from "@/lib/data/types";
import mockData from "@/lib/data/mock.json";

export default function MatchesPage() {
  // Flatten mock data to get all matches
  const allMatches: (Match & {
    tournamentName: string;
    date: string;
    matchType: string;
    courtType?: string;
    verificationStatus?: string;
  })[] = (mockData as any).recentEvents.flatMap((event: any) =>
    event.matches.map((match: any) => ({
      ...match,
      tournamentName: event.tournamentName,
      date: event.date,
      matchType: event.matchType,
      courtType: event.courtType,
      verificationStatus: event.verificationStatus,
    }))
  );

  return (
    <div className="flex-1 w-full bg-white">
      {/* Main Content */}
      <div className="relative z-10 px-8 py-12 pt-[136px]">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-medium text-[#0D0D0D] mb-2">Matches</h1>
            <p className="text-base font-normal text-[#999999]">
              View and manage all your tennis matches. Click on any match to see detailed statistics and insights.
            </p>
          </div>

          {/* Matches Grid */}
          {allMatches && allMatches.length > 0 ? (
            <div className="space-y-4">
              {allMatches.map((match) => (
                <Link
                  key={match.id}
                  href={`/dashboard/matches/${match.id}`}
                  className="block bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl hover:border-[#999999] transition-colors"
                >
                  <div className="flex flex-row justify-between items-start">
                    {/* Left Column - Match Info */}
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
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium text-[#999999]">
                            {match.matchType}
                          </p>
                        </div>
                        {match.courtType && (
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium text-[#999999]">
                              {match.courtType}
                            </p>
                          </div>
                        )}
                        {match.verificationStatus && (
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium text-[#999999]">
                              {match.verificationStatus}
                            </p>
                          </div>
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
                        {match.matchContext} | {match.round} | {match.duration}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
              <p className="text-base font-normal text-[#999999]">
                No matches found.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
