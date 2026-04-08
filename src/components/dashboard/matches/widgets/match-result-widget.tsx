"use client";

import { Calendar, GraduationCap, Clock } from "lucide-react";
import Image from "next/image";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export function MatchResultWidget() {
  const { match, insights } = useMatchData();

  const aiSummary =
    insights?.player1?.strengths?.[0]?.description ??
    insights?.player2?.strengths?.[0]?.description ??
    null;

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.05)] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-[25px]">
      <div className="flex flex-col gap-[25px]">
        {/* Top section */}
        <div className="flex flex-col gap-[14px]">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Match Result
          </p>

          {/* Score + badge */}
          <div className="flex items-center gap-2.5">
            <span className="text-[32px] font-light text-[#0A0A0C] leading-[60px]">
              {match.score.finalScore}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium leading-[15px] ${
                match.won
                  ? "bg-[rgba(115,230,104,0.15)] text-[#5DB955]"
                  : "bg-[rgba(229,24,55,0.15)] text-[#E51837]"
              }`}
            >
              {match.won ? "Won" : "Lost"}
            </span>
          </div>

          {/* Opponent + metadata */}
          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-normal text-[#0D0D0D] leading-[21px]">
              {match.player2.name}
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="flex items-center gap-1 text-[10px] text-[#888888] leading-[16px]">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {match.date}
              </span>
              {match.matchType && (
                <span className="flex items-center gap-1 text-[10px] text-[#888888] leading-[16px]">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {match.matchType}
                </span>
              )}
              {match.courtType && (
                <span className="flex items-center gap-1 text-[10px] text-[#888888] leading-[16px]">
                  <Image src="/icons/tennis-court-icon.svg" alt="" width={14} height={14} className="shrink-0" />
                  {match.courtType}
                </span>
              )}
              {match.verificationStatus && (
                <span className="flex items-center gap-1 text-[10px] text-[#888888] leading-[16px]">
                  <Image src="/icons/verified-check-icon.svg" alt="" width={14} height={14} className="shrink-0" />
                  {match.verificationStatus}
                </span>
              )}
              {match.duration && (
                <span className="flex items-center gap-1 text-[10px] text-[#888888] leading-[16px]">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {match.duration}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* AI Analysis */}
        {aiSummary && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
              AI Analysis
            </p>
            <p className="text-[13px] font-normal text-[#71717A] leading-[21.125px]">
              {aiSummary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
