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
    <div className="bg-white border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-6 rounded-2xl flex flex-col gap-6 min-h-[580px]">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center">
        <div className="space-y-2">
          <p className="font-medium text-xl text-[#0D0D0D]">
            Overall Performance
          </p>
          <p className="font-normal text-sm text-[#999999]">
            Your Recent Performance
          </p>
        </div>
        <button className="h-6 w-6 rounded-full bg-[#0D0D0D] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors">
          <ChevronRight className="h-3 w-3 text-white" />
        </button>
      </div>

      {isEmpty ? (
        <div
          className="flex flex-col items-center justify-center flex-1 px-4 text-center"
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
          {/* Overall Performance Section */}
          <div>
            <CircularProgressRing
              wins={currentView.wins}
              losses={currentView.losses}
              label={currentView.label}
              onClick={handleCycleView}
            />
            {/* Pagination dots */}
            <div className="flex justify-center gap-1 mt-4">
              {views.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentViewIndex(index)}
                  className={`rounded-full transition-all ${
                    index === currentViewIndex
                      ? "w-3 h-1 bg-[#3986F3]"
                      : "w-1 h-1 bg-[#D9D9D9]"
                  }`}
                  aria-label={`View ${index + 1}: ${views[index].label}`}
                />
              ))}
            </div>
          </div>

          {/* Performance Rating Section */}
          <div>
            <p className="font-medium text-xs text-[#0D0D0D] mb-4 uppercase tracking-[0.16em]">
              Performance breakdown
            </p>
            <div className="divide-y divide-[#D9D9D9]">
              {performanceRatings.map((rating, index) => (
                <PerformanceRating
                  key={index}
                  label={rating.label}
                  value={rating.value}
                />
              ))}
            </div>
          </div>

          {/* Recent Performance Section */}
          <div className="flex flex-col space-y-3">
            <p className="font-medium text-xs text-[#0D0D0D] uppercase tracking-[0.16em]">
              Recent Performance
            </p>
            <div className="flex flex-col space-y-3">
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
