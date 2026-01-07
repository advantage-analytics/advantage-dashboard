"use client";

import { GraduationCap } from "lucide-react";
import Image from "next/image";

interface TournamentHeaderProps {
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
}

export default function TournamentHeader({
  tournamentName,
  date,
  matchType,
  courtType,
  verificationStatus,
}: TournamentHeaderProps) {
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-row justify-between items-center">
        <p className="text-xl font-medium text-[#0D0D0D]">
          {tournamentName}
        </p>
        <p className="text-sm font-medium text-[#999999]">{date}</p>
      </div>
      <div className="flex flex-row gap-4 items-center">
        {/* Match Type */}
        <div className="flex items-center gap-2">
          {matchType === "Tournament" ? (
            <Image
              src="/tournament-icon.svg"
              alt="Tournament"
              width={15}
              height={15}
            />
          ) : (
            <GraduationCap className="h-4 w-4 text-[#999999]" />
          )}
          <p className="text-xs font-medium text-[#999999]">{matchType}</p>
        </div>

        {/* Court Type */}
        {courtType && (
          <>
            <div className="flex items-center gap-2">
              <Image
                src="/tennis-court-icon.svg"
                alt="Court"
                width={16}
                height={16}
                className="text-[#999999]"
              />
              <p className="text-xs font-medium text-[#999999]">{courtType}</p>
            </div>
          </>
        )}

        {/* Verification Status */}
        {verificationStatus && (
          <>
            <div className="flex items-center gap-2">
            <Image
                src="/verified-check-icon.svg"
                alt="Check"
                width={16}
                height={16}
                className="text-[#0088FF]"
              />
              <p className="text-xs font-medium text-[#999999]">{verificationStatus}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
