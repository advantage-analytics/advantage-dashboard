import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import type { Match } from "@/lib/data/types";

interface MatchDetailHeaderProps {
  match: Match;
}

export function MatchDetailHeader({ match }: MatchDetailHeaderProps) {
  const eyebrow = [match.tournamentName, match.round]
    .filter((p): p is string => !!p?.trim())
    .join(" · ");

  return (
    <header className="px-8 pt-10 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3 min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] truncate">
              {eyebrow}
            </p>
          )}
          <h1
            aria-label={`${match.player1.name} versus ${match.player2.name}`}
            className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px] truncate"
          >
            {match.player1.name}
            <span className="text-[#AAAAAA] font-light mx-2" aria-hidden="true">
              vs
            </span>
            {match.player2.name}
          </h1>
        </div>

        <Link
          href="/dashboard/matches"
          aria-label="Back to all matches"
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#525252] uppercase tracking-[1px] hover:text-[#0D0D0D] transition-colors duration-200 rounded-[6px] h-7 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          Back
        </Link>
      </div>

      <MatchMetadataRow
        date={match.date}
        matchType={match.matchType}
        courtType={match.courtType}
        verificationStatus={match.verificationStatus}
      />
    </header>
  );
}
