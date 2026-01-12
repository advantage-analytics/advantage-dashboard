"use client";

import { ChevronRight } from "lucide-react";
import { CircularProgressRing } from "@/components/dashboard/home/circular-progress-ring";
import { PerformanceRating } from "@/components/dashboard/home/performance-rating";
import { RecentPerformance } from "@/components/dashboard/home/recent-performance";

export default function OverallPerformance() {
  // Constant values as requested
  const wins = 0;
  const losses = 0;

  const serveRating = 0.0;
  const returnRating = 0.0;
  const netRating = 0.0; // Assuming third is "Net" based on tennis context

  const firstServeInPercentage = 0.0;
  const firstServeWonPercentage = 0.0;
  const secondServeWonPercentage = 0.0;
  const firstServeInChange = 4.5;
  const firstServeWonChange = 4.5;
  const secondServeWonChange = 4.5;

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
        <CircularProgressRing wins={wins} losses={losses} />
        {/* Pagination dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          <div className="w-1.5 h-1.5 rounded-full bg-[#E5E5E5]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-[#E5E5E5]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-[#E5E5E5]"></div>
        </div>
      </div>

      {/* Performance Rating Section */}
      <div className="mb-5">
        <p className="font-medium text-base text-[#0D0D0D] mb-4">
          Performance Rating
        </p>
        <div className="space-y-5 px-2">
          <PerformanceRating
            label="Serve"
            value={serveRating}
            barColor="#666666"
          />
          <PerformanceRating
            label="Return"
            value={returnRating}
            barColor="#4A90E2"
          />
          <PerformanceRating
            label="Serve"
            value={netRating}
            barColor="#666666"
          />
        </div>
      </div>

      {/* Recent Performance Section */}
      <div>
        <p className="font-medium text-base text-[#0D0D0D] mb-4">
          Recent Performance
        </p>
        <div className="space-y-5">
          <RecentPerformance
            value={firstServeInPercentage}
            change={firstServeInChange}
            label="First Serve In Percentage"
          />
          <RecentPerformance
            value={firstServeWonPercentage}
            change={firstServeWonChange}
            label="First Serve Won Percentage"
          />
          <RecentPerformance
            value={secondServeWonPercentage}
            change={secondServeWonChange}
            label="Second Serve Won Percentage"
          />
        </div>
      </div>
    </div>
  );
}
