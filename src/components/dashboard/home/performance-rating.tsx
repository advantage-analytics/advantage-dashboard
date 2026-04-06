// Performance Rating Component
export function PerformanceRating({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-row items-center justify-between py-3">
      <span className="text-xs font-normal text-[#999999]">{label}</span>
      <span className="text-xl font-medium text-[var(--color-text-primary)]">
        {value.toFixed(1)}
      </span>
    </div>
  );
}
