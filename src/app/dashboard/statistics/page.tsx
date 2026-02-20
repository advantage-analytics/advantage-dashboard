import { ChartColumnIncreasing } from "lucide-react";

export default function StatisticsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 pt-[136px]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <ChartColumnIncreasing className="h-8 w-8 text-gray-400" />
        </div>
        <h1 className="font-medium text-2xl text-[#0D0D0D]">Statistics</h1>
        <p className="font-normal text-base text-[#999999] max-w-md">
          Dive deep into your performance analytics. Discover patterns and insights to improve your game.
        </p>
      </div>
    </div>
  );
}
