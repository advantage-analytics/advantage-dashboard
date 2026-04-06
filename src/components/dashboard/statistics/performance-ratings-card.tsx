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
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden transition-[box-shadow,border-color,transform] duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] hover:border-[#E7E7E7] hover:scale-[1.008]">
      <div className="mb-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Performance Ratings
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
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
