"use client";

import { ChevronRight } from "lucide-react";
import TournamentHeader from "@/components/dashboard/home/tournament-header";
import mockData from "@/lib/data/mock.json";

export default function RecentActivity() {
  const { recentMatches } = mockData;

  return (
    // Widget Container
    <div className="bg-white border-[#D9D9D9] border-2 p-6 space-y-6 rounded-2xl h-[1200px]">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center">
        <div className="space-y-2">
          <p className="font-medium text-xl text-[#0D0D0D]">Recent Activity</p>
          <p className="font-regular text-sm text-[#999999]">
            Your Last 3 Events with Insights
          </p>
        </div>
        {/* Navigation Button */}
        <button className="h-6 w-6 rounded-full bg-[#0D0D0D] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors">
          <ChevronRight className="h-3 w-3 text-white" />
        </button>
      </div>

      {/* Recent Matches */}
      <div className="space-y-6">
        {recentMatches.map((match) => (
          <TournamentHeader
            key={match.id}
            tournamentName={match.tournamentName}
            date={match.date}
            matchType={match.matchType}
            courtType={match.courtType}
            verificationStatus={match.verificationStatus}
          />
        ))}
      </div>
    </div>
  );
}
