"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchMetadataRow } from "./match-metadata-row";
import { MatchScoreSection } from "./match-score-section";

interface MatchCardListProps {
  match: DisplayMatch;
}

export function MatchCardList({ match }: MatchCardListProps): React.JSX.Element {
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group block rounded-2xl"
    >
      <div className="flex flex-col gap-4">
        {/* Tournament Name and Date */}
        <div className="flex flex-row items-center justify-between">
          <p className="text-xl font-medium text-[#000000]">
            {match.tournamentName}
          </p>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-[#999999]" />
            <p className="text-xs font-medium text-[#999999]">{match.date}</p>
          </div>
        </div>

        <MatchMetadataRow
          matchType={match.matchType}
          courtType={match.courtType}
          verificationStatus={match.verificationStatus}
        />

        <div className="transition-transform group-hover:scale-[1.005] origin-left">
          <MatchScoreSection match={match} />
        </div>
      </div>
    </Link>
  );
}
