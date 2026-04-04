"use client";

import { useState } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { CircularProgressRing } from "@/components/dashboard/home/circular-progress-ring";
import { PerformanceRating } from "@/components/dashboard/home/performance-rating";
import { RecentPerformance } from "@/components/dashboard/home/recent-performance";
import type { OverallPerformanceData } from "@/lib/data/performance-server";

interface OverallPerformanceProps {
  performanceData: OverallPerformanceData;
}

export default function OverallPerformance({
  performanceData,
}: OverallPerformanceProps) {
  const { views, performanceRatings, recentPerformance } = performanceData;

  const isEmpty = views.every((v) => v.wins === 0 && v.losses === 0);

  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const currentView = views[currentViewIndex];

  const handleCycleView = () => {
    setCurrentViewIndex((prev) => (prev + 1) % views.length);
  };

  return (
    <div className="bg-white border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-6 rounded-2xl flex flex-col">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-[16px] text-black">
            Overall Performance
          </p>
          <p className="text-[12px] text-[#999999]">
            Your Recent Performance
          </p>
        </div>
        <button
          type="button"
          aria-label="View overall performance details"
          className="h-6 w-6 rounded-full bg-[#1D1D1F] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1D1D1F]"
        >
          <ChevronRight className="h-3 w-3 text-white" aria-hidden />
        </button>
      </div>

      {isEmpty ? (
        <div
          className="flex flex-col items-center justify-center py-12 px-4 text-center"
          data-state="empty"
        >
          <div className="rounded-full bg-[#F5F5F5] p-4 mb-4">
            <Inbox className="h-8 w-8 text-[#999999]" aria-hidden />
          </div>
          <p className="font-medium text-[#000000] mb-1">No matches yet</p>
          <p className="text-sm text-[#999999] max-w-[260px]">
            Upload your first match to see your performance stats here.
          </p>
        </div>
      ) : (
        <>
          {/* Win/Loss Ring Section */}
          <div className="pt-5">
            <CircularProgressRing
              wins={currentView.wins}
              losses={currentView.losses}
              label={currentView.label}
              onClick={handleCycleView}
            />
            {/* Pagination dots */}
            <div className="flex justify-center gap-1 mt-3">
              {views.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentViewIndex(index)}
                  className={`rounded-full transition-[width,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#3986F3] ${
                    index === currentViewIndex
                      ? "w-3 h-1 bg-[#3986F3]"
                      : "w-1 h-1 bg-[#D9D9D9]"
                  }`}
                  aria-label={`View ${index + 1}: ${views[index].label}`}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#F0F0F0] mt-5" />

          {/* Performance Rating Section */}
          <div className="pt-5">
            <p className="font-medium text-[12px] text-[#AAAAAA] mb-5 uppercase tracking-[1.6px]">
              Performance breakdown
            </p>
            <div className="divide-y divide-[#F0F0F0]">
              {performanceRatings.map((rating, index) => (
                <PerformanceRating
                  key={index}
                  label={rating.label}
                  value={rating.value}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#F0F0F0] mt-5" />

          {/* Recent Performance Section */}
          <div className="pt-5">
            <p className="font-medium text-[12px] text-[#AAAAAA] mb-4 uppercase tracking-[1.6px]">
              Recent Performance
            </p>
            <div className="flex flex-col gap-1">
              {recentPerformance.map((perf, index) => (
                <RecentPerformance
                  key={index}
                  value={perf.value}
                  change={perf.change}
                  label={perf.label}
                  index={index}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
