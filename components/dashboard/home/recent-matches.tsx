"use client";

import Link from "next/link";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";

interface Match {
  id: string;
  round: string;
  matchContext: string;
  duration: string;
  player1: {
    name: string;
    school: string;
  };
  player2: {
    name: string;
    school: string;
  };
  score: {
    sets: Array<{ player1: number; player2: number; tiebreak?: boolean }>;
    winner: string;
    finalScore: string;
  };
  won: boolean;
}

interface RecentMatchesProps {
  tournamentName: string;
  date: string;
  matchType?: string;
  courtType?: string;
  verificationStatus?: string;
  matches: Match[];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function RecentMatches({
  tournamentName,
  date,
  matchType,
  courtType,
  verificationStatus,
  matches,
}: RecentMatchesProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <p className="text-xl font-medium text-[#000000]">{tournamentName}</p>

        <MatchMetadataRow
          date={date}
          matchType={matchType}
          courtType={courtType}
          verificationStatus={verificationStatus}
        />
      </div>

      {/* Individual Matches */}
      {matches.map((match) => (
        <Link
          key={match.id}
          href={`/dashboard/matches/${match.id}`}
          className="group block rounded-2xl transition-transform hover:scale-[1.01]"
        >
          <div className="pl-2 pr-4 py-3 flex flex-row gap-6">
            {/* Vertical Separator */}
            <div className="w-0.5 bg-[#DDDDDD] group-hover:bg-[#6AABFF] self-stretch rounded-full transition-colors"></div>
            <div className="flex flex-col space-y-4 flex-1">
              {/* Match Header */}
              <div className="flex flex-row justify-between items-center font-normal text-xs text-[#999999]">
                <div className="flex items-center gap-2">
                  <p>{match.matchContext}</p>
                  {match.round && (
                    <>
                      <span className="w-px h-3 bg-[#999999]" />
                      <p>{match.round}</p>
                    </>
                  )}
                </div>
                <span className="rounded-[10px] px-1.5 py-0.5 text-xs font-medium bg-[#F3F3F3] text-[#999999] group-hover:bg-[#6AABFF] group-hover:text-white transition-colors">
                  {match.duration}
                </span>
              </div>
              {/* Player Names + Information */}
              <div className="flex flex-col space-y-2">
                <div className="flex flex-row justify-between items-center">
                  <div className="flex flex-row items-center gap-4">
                    <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-[#BFBFBF]">
                        {getInitials(match.player1.name)}
                      </span>
                    </div>
                    <p
                      className={`font-semibold text-sm ${match.score.winner === "player1" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}
                    >
                      {match.player1.name}
                    </p>
                  </div>
                  <div className="flex flex-row gap-4 font-semibold text-[18px]">
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
                  <div className="flex flex-row items-center gap-4">
                    <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-[#BFBFBF]">
                        {getInitials(match.player2.name)}
                      </span>
                    </div>
                    <p
                      className={`font-semibold text-sm ${match.score.winner === "player2" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}
                    >
                      {match.player2.name}
                    </p>
                  </div>
                  <div className="flex flex-row gap-4 font-semibold text-[18px]">
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
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
