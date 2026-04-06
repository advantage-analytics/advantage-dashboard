import { PerformanceRating } from "@/components/dashboard/home/performance-rating";

interface PerformanceRatingsCardProps {
  serveRating: number;
  returnRating: number;
  underPressureRating: number;
}

export function PerformanceRatingsCard({
  serveRating,
  returnRating,
  underPressureRating,
}: PerformanceRatingsCardProps) {
  const hasData = serveRating > 0 || returnRating > 0 || underPressureRating > 0;

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[#0D0D0D]">Performance Ratings</h2>
        <p className="text-xs text-[#888888] mt-0.5">
          {hasData ? "Averaged across all tracked matches" : "No stats data yet"}
        </p>
      </div>

      <div className="divide-y divide-[#F0F0F0]">
        <PerformanceRating label="Serve Rating" value={serveRating} />
        <PerformanceRating label="Return Rating" value={returnRating} />
        <PerformanceRating label="Under Pressure" value={underPressureRating} />
      </div>
    </div>
  );
}
