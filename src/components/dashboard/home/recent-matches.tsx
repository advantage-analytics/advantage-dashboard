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
    <div className="flex flex-col gap-4">
      {/* Event Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-medium text-black">{tournamentName}</p>
          <p className="text-[12px] font-medium text-[#999999]">{date}</p>
        </div>

        <MatchMetadataRow
          date={date}
          matchType={matchType}
          courtType={courtType}
          verificationStatus={verificationStatus}
        />
      </div>

      {/* Individual Matches */}
      <div className="flex flex-col">
        {matches.map((match) => (
          <Link
            key={match.id}
            href={`/dashboard/matches/${match.id}`}
            className="group block rounded-2xl transition-transform hover:scale-[1.005]"
          >
            <div className="pl-2 pr-4 py-3 flex flex-row gap-6">
              {/* Vertical Separator */}
              <div className="w-0.5 bg-[#DDDDDD] group-hover:bg-[#6AABFF] self-stretch rounded-full transition-colors" />
              <div className="flex flex-col gap-4 flex-1 min-w-0 overflow-hidden">
                {/* Match Header — 14px regular for context */}
                <div className="flex items-center justify-between text-[14px] text-[#999999]">
                  <div className="flex items-center gap-2">
                    <span>{match.matchContext}</span>
                    {match.round && (
                      <>
                        <span className="w-px h-4 bg-[#999999]" />
                        <span>{match.round}</span>
                      </>
                    )}
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[#F3F3F3] text-[#999999] group-hover:bg-[#6AABFF] group-hover:text-white transition-colors tabular-nums">
                    {match.duration}
                  </span>
                </div>
                {/* Player Rows — 14px semibold names, 18px semibold scores */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-[#BFBFBF]">
                          {getInitials(match.player1.name)}
                        </span>
                      </div>
                      <p
                        className={`font-semibold text-[14px] ${match.score.winner === "player1" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}
                      >
                        {match.player1.name}
                      </p>
                    </div>
                    <div className="flex gap-4 font-semibold text-[18px] tabular-nums">
                      {match.score.sets.map((set, idx) => (
                        <span
                          key={idx}
                          className={
                            set.player1 > set.player2
                              ? "text-[#0D0D0D]"
                              : "text-[#BFBFBF]"
                          }
                        >
                          {set.player1}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-[#BFBFBF]">
                          {getInitials(match.player2.name)}
                        </span>
                      </div>
                      <p
                        className={`font-semibold text-[14px] ${match.score.winner === "player2" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}
                      >
                        {match.player2.name}
                      </p>
                    </div>
                    <div className="flex gap-4 font-semibold text-[18px] tabular-nums">
                      {match.score.sets.map((set, idx) => (
                        <span
                          key={idx}
                          className={
                            set.player2 > set.player1
                              ? "text-[#0D0D0D]"
                              : "text-[#BFBFBF]"
                          }
                        >
                          {set.player2}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
