"use client";

import Link from "next/link";
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
        {/* Tournament Name */}
        <p className="text-xl font-medium text-[#000000]">
          {match.tournamentName}
        </p>

        <MatchMetadataRow
          date={match.date}
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
