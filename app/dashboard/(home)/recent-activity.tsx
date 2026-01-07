"use client";

import { ChevronRight } from "lucide-react";

export default function RecentActivity() {
  return (
    // Widget Container
    <div className="bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl h-[1200px]">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center">
          <div className="space-y-2">
            <p className="font-medium text-2xl text-[#0D0D0D]">Recent Activity</p>
            <p className="font-regular text-md text-gray-400">Your Last 3 Events with Insights</p>
          </div>
        {/* Navigation Button */}
        <button className="h-8 w-8 rounded-full bg-[#0D0D0D] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors">
          <ChevronRight className="h-4 w-4 text-white" />
        </button>
      </div>
      {/* Add more Content Here */}
    </div>
  );
}
