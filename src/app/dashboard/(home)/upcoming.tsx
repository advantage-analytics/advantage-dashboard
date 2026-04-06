"use client";

import { ChevronRight } from "lucide-react";

export default function Upcoming() {
  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-6 rounded-2xl h-fit">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center mb-6">
        <div className="flex flex-col">
          <p className="font-medium text-xl text-[#000000]">Upcoming Matches</p>
          <p className="font-normal text-sm text-[#999999] mt-2">
            Your Scheduled Events
          </p>
        </div>
        {/* Navigation Button */}
        <button
          type="button"
          aria-label="View upcoming matches"
          className="h-6 w-6 rounded-full bg-[var(--color-dark-action)] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-dark-action)]"
        >
          <ChevronRight className="h-3 w-3 text-white" aria-hidden />
        </button>
      </div>

      {/* Placeholder Content */}
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-[#999999]">No upcoming matches scheduled</p>
      </div>
    </div>
  );
}
