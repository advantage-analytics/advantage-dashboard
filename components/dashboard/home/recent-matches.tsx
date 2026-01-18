"use client";

import { GraduationCap } from "lucide-react";
import Image from "next/image";

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
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
  matches: Match[];
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
        {/* Tournament Name and Date Row */}
        <div className="flex flex-row justify-between items-center gap-2">
          <p className="text-xl font-medium text-[#000000]">{tournamentName}</p>
          <p className="text-sm font-medium text-[#999999]">{date}</p>
        </div>

        {/* Match Details Row */}
        <div className="flex flex-row gap-4 items-center">
          {/* Match Type */}
          <div className="flex items-center gap-1">
            {matchType === "Tournament" ? (
              <Image
                src="/icons/tournament-icon.svg"
                alt="Tournament"
                width={16}
                height={16}
              />
            ) : (
              <GraduationCap className="h-4 w-4 text-[#999999]" />
            )}
            <p className="text-xs font-medium text-[#999999]">{matchType}</p>
          </div>

          {/* Court Type */}
          {courtType && (
            <div className="flex items-center gap-1">
              <Image
                src="/icons/tennis-court-icon.svg"
                alt="Court"
                width={16}
                height={16}
              />
              <p className="text-xs font-medium text-[#999999]">{courtType}</p>
            </div>
          )}

          {/* Verification Status */}
          {verificationStatus && (
            <div className="flex items-center gap-1">
              <Image
                src="/icons/verified-check-icon.svg"
                alt="Check"
                width={16}
                height={16}
              />
              <p className="text-xs font-medium text-[#999999]">
                {verificationStatus}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Individual Matches */}
      {matches.map((match) => (
        <div key={match.id} className="pl-2 pr-4 py-3 flex flex-row gap-6">
          {/* Vertical Separator */}
          <div className="w-0.5 bg-[#DDDDDD] self-stretch rounded-full"></div>
          <div className="flex flex-col space-y-4 flex-1">
            {/* Match Header */}
            <div className="flex flex-row justify-between items-center font-normal text-xs text-[#999999]">
              <p>{match.matchContext} | {match.round}</p>
              <p>{match.duration}</p>
            </div>
            {/* Player Names + Information */}
            <div className="flex flex-col space-y-2">
              <div className="flex flex-row justify-between items-center">
                <div className="flex flex-row items-center gap-4">
                  <div className="h-10 w-10 rounded-sm bg-gray-200"></div>
                  <p className={`font-semibold text-sm ${match.score.winner === "player1" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                    {match.player1.name}
                  </p>
                </div>
                <div className="flex flex-row gap-4 font-semibold text-[18px]">
                  {match.score.sets.map((set, idx) => (
                    <p key={idx} className={set.player1 > set.player2 ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}>
                      {set.player1}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex flex-row justify-between items-center">
                <div className="flex flex-row items-center gap-4">
                  <div className="h-10 w-10 rounded-sm bg-gray-200"></div>
                  <p className={`font-semibold text-sm ${match.score.winner === "player2" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                    {match.player2.name}
                  </p>
                </div>
                <div className="flex flex-row gap-4 font-semibold text-[18px]">
                  {match.score.sets.map((set, idx) => (
                    <p key={idx} className={set.player2 > set.player1 ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}>
                      {set.player2}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
