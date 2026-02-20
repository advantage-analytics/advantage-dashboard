"use client";

import { ChevronRight } from "lucide-react";

export default function About() {
  return (
    <div className="bg-white border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-6 rounded-2xl h-fit">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center mb-6">
        <div className="flex flex-col">
          <p className="font-medium text-xl text-[#000000]">About</p>
          <p className="font-normal text-sm text-[#999999] mt-2">
            Player Information & Stats
          </p>
        </div>
        {/* Navigation Button */}
        <button className="h-6 w-6 rounded-full bg-[#1D1D1F] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors">
          <ChevronRight className="h-3 w-3 text-white" />
        </button>
      </div>

      {/* Placeholder Content */}
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-[#999999]">Player information coming soon</p>
      </div>
    </div>
  );
}
