"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CourtPlacementSection } from "@/components/dashboard/matches/sections/court-placement-section";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

export default function VisualsPage() {
  const { match } = useMatchData();

  return (
    <div className="flex flex-col px-8 py-10 gap-6">
      <CourtPlacementSection />

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[#F3F3F3] pt-5">
        <Link
          href="/dashboard/matches"
          className="flex items-center gap-1.5 text-[12px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          All Matches
        </Link>
        <p className="text-[12px] text-[#888888]">
          {match.player1.name} vs {match.player2.name}
          {match.date && <span className="ml-1.5">&middot; {match.date}</span>}
        </p>
      </div>
    </div>
  );
}
