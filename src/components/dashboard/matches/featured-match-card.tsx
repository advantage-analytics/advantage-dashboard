"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchMetadataRow } from "./match-metadata-row";
import { MatchScoreSection } from "./match-score-section";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";

interface FeaturedMatchCardProps {
  match: DisplayMatch;
}

export function FeaturedMatchCard({
  match,
}: FeaturedMatchCardProps): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="group relative"
    >
      <div className="absolute top-4 right-4 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
        <MatchActionsMenu
          matchId={match.id}
          matchLabel={match.tournamentName}
        />
      </div>
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="block bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] overflow-hidden transition-transform hover:scale-[1.01]"
      >
        <div className="p-6">
          <div className="flex flex-col gap-6">
            {/* Header: Tournament name + badge | Date */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <p className="text-xl font-medium text-[#000000]">
                  {match.tournamentName}
                </p>
                <span className="text-[10px] font-medium text-[#3B82F6] bg-[#EBF2FD] px-2.5 py-1 rounded-xl">
                  Latest Match
                </span>
              </div>

              <MatchMetadataRow
                date={match.date}
                matchType={match.matchType}
                courtType={match.courtType}
                verificationStatus={match.verificationStatus}
              />
            </div>
            <MatchScoreSection match={match} />
          </div>

          {/* Hover CTA — expands into view */}
          <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-300">
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-[#3B82F6] pt-6 pb-1">
                View match details →
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
