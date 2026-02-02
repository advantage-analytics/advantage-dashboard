"use client";

import { GraduationCap } from "lucide-react";
import Image from "next/image";

interface MatchEventHeaderProps {
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
}

export function MatchEventHeader({
  tournamentName,
  date,
  matchType,
  courtType,
  verificationStatus,
}: MatchEventHeaderProps) {
  return (
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
  );
}
