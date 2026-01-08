// Performance Rating Component
export function PerformanceRating({ 
  label, 
  value, 
  barColor = "#4A90E2" 
}: { 
  label: string; 
  value: number;
  barColor?: string;
}) {
  // Normalize value to 0-100 for display (assuming value is 0-1000 based on "000.0" format)
  const normalizedValue = Math.min(value / 10, 100);
  
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-normal text-[#0D0D0D] min-w-[60px]">{label}</span>
      <div className="flex-1 h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${normalizedValue}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-sm font-normal text-[#0D0D0D] min-w-[50px] text-right">
        {value.toFixed(1).padStart(5, '0')}
      </span>
    </div>
  );
}
