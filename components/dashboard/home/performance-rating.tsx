// Performance Rating Component
export function PerformanceRating({
  label,
  value,
  barColor = "#4A90E2",
}: {
  label: string;
  value: number;
  barColor?: string;
}) {
  // Normalize value to 0-100 for display (assuming value is 0-1000 based on "000.0" format)
  const normalizedValue = Math.min(value / 10, 100);

  return (
    <div className="flex flex-row items-end justify-between gap-4">
      <div className="flex flex-col space-y-1">
        <span className="text-xs font-medium text-[#999999]">{label}</span>
        <div className="flex-1 h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all min-w-[172px]"
            style={{ width: `${normalizedValue}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
      <span className="text-2xl font-medium text-[#0D0D0D] min-w-[50px] leading-none text-right">
        {value.toFixed(1).padStart(5, "0")}
      </span>
    </div>
  );
}
