import type { TrendData, StatTrend } from "./trend-utils";

interface PerformanceRatingsCardProps {
  serveRating: number;
  returnRating: number;
  underPressureRating: number;
  trends: TrendData;
}

function RatingRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: number;
  trend: StatTrend | null;
}) {
  const showTrend = trend && trend.direction !== "flat";
  const trendColor = showTrend
    ? (trend.direction === "up") === trend.isPositive
      ? "text-[#5DB955]"
      : "text-[#E51837]"
    : "";

  return (
    <div className="flex items-center justify-between px-1 py-4">
      <span className="text-xs font-medium text-[#888888] uppercase tracking-[1.6px]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {showTrend && (
          <span className={`text-[10px] font-medium tabular-nums ${trendColor}`}>
            {trend.direction === "up" ? "+" : "−"}
            {trend.delta}
          </span>
        )}
        <span className="text-xl font-medium text-[#525252] leading-[1.1] tabular-nums">
          {value.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

export function PerformanceRatingsCard({
  serveRating,
  returnRating,
  underPressureRating,
  trends,
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
        <RatingRow
          label="Serve Rating"
          value={serveRating}
          trend={trends.serveRating}
        />
        <RatingRow
          label="Return Rating"
          value={returnRating}
          trend={trends.returnRating}
        />
        <RatingRow
          label="Under Pressure"
          value={underPressureRating}
          trend={trends.underPressureRating}
        />
      </div>
    </div>
  );
}
