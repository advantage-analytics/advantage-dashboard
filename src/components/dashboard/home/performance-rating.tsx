export function PerformanceRating({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between px-1 py-4">
      <span className="text-xs font-medium text-[#888888] uppercase tracking-[1.6px]">
        {label}
      </span>
      <span className="text-xl font-medium text-[#525252] leading-[1.1] tabular-nums">
        {value.toFixed(0)}
      </span>
    </div>
  );
}
