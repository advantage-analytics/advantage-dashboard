"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { CircularProgressRing } from "@/components/dashboard/home/circular-progress-ring";
import { PerformanceRating } from "@/components/dashboard/home/performance-rating";
import { RecentPerformance } from "@/components/dashboard/home/recent-performance";
import mockData from "@/lib/data/mock.json";

export default function OverallPerformance() {
  const { views, performanceRatings, recentPerformance } =
    mockData.overallPerformance;

  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const currentView = views[currentViewIndex];

  const handleCycleView = () => {
    setCurrentViewIndex((prev) => (prev + 1) % views.length);
  };

  return (
    <div className="bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl flex flex-col">
      {/* Heading */}
      <div className="flex flex-row justify-between items-center mb-6">
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

      {/* Overall Performance Section */}
      <div className="mb-5">
        <CircularProgressRing
          wins={currentView.wins}
          losses={currentView.losses}
          label={currentView.label}
          onClick={handleCycleView}
        />
        {/* Pagination dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {views.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentViewIndex(index)}
              className={`rounded-full transition-all ${
                index === currentViewIndex
                  ? "w-4 h-1 bg-[#4A90E2]"
                  : "w-1 h-1 bg-[#E5E5E5]"
              }`}
              aria-label={`View ${index + 1}: ${views[index].label}`}
            />
          ))}
        </div>
      </div>

      {/* Performance Rating Section */}
      <div className="mb-5">
        <p className="font-medium text-base text-[#0D0D0D] mb-4">
          Performance Rating
        </p>
        <div className="space-y-4 px-2">
          {performanceRatings.map((rating, index) => (
            <PerformanceRating
              key={index}
              label={rating.label}
              value={rating.value}
              barColor={rating.barColor}
            />
          ))}
        </div>
      </div>

      {/* Recent Performance Section */}
      <div className="flex flex-col space-y-4">
        <p className="font-medium text-base text-[#0D0D0D]">
          Recent Performance
        </p>
        <div className="flex flex-col space-y-4">
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
    </div>
  );
}
