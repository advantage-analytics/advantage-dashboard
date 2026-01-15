"use client";

import { Calendar, Clock } from "lucide-react";

export function UpcomingMatch() {
  // Placeholder data
  const schoolName = "Stanford University";
  const conference = "BIG 10 Conference";
  const date = "March 16, 2025";
  const time = "2:00 PM";

  return (
    <div className="relative bg-gradient-to-r from-[#8B1538] to-[#7A0F2E] rounded-2xl p-6 overflow-hidden min-h-[180px] flex flex-col">
      {/* Content */}
      <div className="relative z-10 flex flex-col h-full flex-1">
        {/* Top Section - School Name and Conference */}
        <div className="mb-auto">
          <h2 className="text-lg font-normal text-white mb-1">{schoolName}</h2>
          <p className="text-xs font-normal text-white opacity-90">{conference}</p>
        </div>
      </div>

      {/* Bottom Section - Date and Time */}
      <div className="relative z-10 flex items-center gap-4 mt-auto">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-white" />
          <span className="text-xs font-normal text-white">{date}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-white" />
          <span className="text-xs font-normal text-white">{time}</span>
        </div>
      </div>

      {/* Logo on Right Side */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-10">
        <div className="relative w-28 h-28 flex items-center justify-center">
          {/* Placeholder logo - white S with border */}
          <div className="w-24 h-24 flex items-center justify-center border-2 border-white rounded-full">
            <span className="text-white text-4xl font-normal">S</span>
          </div>
        </div>
      </div>
    </div>
  );
}
