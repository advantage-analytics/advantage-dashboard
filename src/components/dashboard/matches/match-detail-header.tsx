"use client";

import Link from "next/link";
import { ArrowLeft, Calendar, BadgeCheck, Trophy } from "lucide-react";
import Image from "next/image";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

interface MatchDetailHeaderProps {
  matchId: string;
}

export function MatchDetailHeader({ matchId }: MatchDetailHeaderProps) {
  const { match } = useMatchData();

  return (
    <div className="px-8 pt-6 pb-4">
      {/* Section label + back link */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
          Match Detail
        </p>
        <Link
          href="/dashboard/matches"
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] hover:text-[#2563EB] transition-colors duration-200 rounded-[6px] h-7 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
      </div>

      {/* Heading */}
      <h1 className="text-[30px] font-light text-[#0D0D0D] tracking-[-0.6px] leading-[36px] mb-2">
        {match.player1.name} vs {match.player2.name}
      </h1>

      {/* Metadata row */}
      <div className="flex items-center gap-4">
        {match.date && (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-[#767676]" aria-hidden="true" />
            <span className="text-[12px] font-medium text-[#767676]">
              {match.date}
            </span>
          </div>
        )}
        {match.tournamentName && match.tournamentName !== "Unknown Event" && (
          <div className="flex items-center gap-1">
            <Trophy className="h-3 w-3 text-[#8A8A8E]" aria-hidden="true" />
            <span className="text-[12px] font-medium text-[#767676]">
              {match.tournamentName}
            </span>
          </div>
        )}
        {match.courtType && (
          <div className="flex items-center gap-1">
            <Image
              src="/icons/tennis-court-icon.svg"
              alt=""
              width={14}
              height={14}
            />
            <span className="text-[12px] font-medium text-[#767676]">
              {match.courtType}
            </span>
          </div>
        )}
        {match.matchType && (
          <span className="text-[12px] font-medium text-[#767676]">
            {match.matchType}
          </span>
        )}
        {match.verificationStatus && (
          <div className="flex items-center gap-1">
            <BadgeCheck className="h-3 w-3 text-[#767676]" aria-hidden="true" />
            <span className="text-[12px] font-medium text-[#767676]">
              {match.verificationStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
