"use client";

import { ChevronRight } from "lucide-react";

export default function OverallPerformance() {
  return (
    // Widget Container
    <div className="sticky top-24 bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl h-[726px]">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center">
          <div className="space-y-2">
            <p className="font-medium text-xl text-[#0D0D0D]">Overall Performance</p>
            <p className="font-regular text-sm text-[#999999]">Your Recent Performance</p>
          </div>
        {/* Navigation Button */}
        <button className="h-6 w-6 rounded-full bg-[#0D0D0D] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors">
          <ChevronRight className="h-3 w-3 text-white" />
        </button>
      </div>
      {/* Add more Content Here */}
    </div>
  );
}
