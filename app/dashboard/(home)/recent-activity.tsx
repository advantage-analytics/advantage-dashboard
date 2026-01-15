"use client";

import { ChevronRight } from "lucide-react";
import RecentMatches from "@/components/dashboard/home/recent-matches";
import mockData from "@/lib/data/mock.json";

export default function RecentActivity() {
  const { recentEvents } = mockData;

  return (
    // Widget Container
    <div className="bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl h-fit">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center mb-6">
        <div className="flex flex-col">
          <p className="font-medium text-xl text-[#000000]">Recent Activity</p>
          <p className="font-normal text-sm text-[#999999] mt-1">
            Your Last 3 Events with Insights
          </p>
        </div>
        {/* Navigation Button */}
        <button className="h-6 w-6 rounded-full bg-[#1D1D1F] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors">
          <ChevronRight className="h-3 w-3 text-white" />
        </button>
      </div>

      {/* Recent Events */}
      <div className="space-y-4">
        {recentEvents.slice(0, 3).map((event) => (
          <RecentMatches
            key={event.id}
            tournamentName={event.tournamentName}
            date={event.date}
            matchType={event.matchType}
            courtType={event.courtType}
            verificationStatus={event.verificationStatus}
            matches={event.matches}
          />
        ))}
      </div>
    </div>
  );
}
