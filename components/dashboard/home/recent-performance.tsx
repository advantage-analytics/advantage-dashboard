// Recent Performance Component
export function RecentPerformance({ 
  value, 
  change, 
  label 
}: { 
  value: number; 
  change: number; 
  label: string;
}) {
  const changeColor = change >= 0 ? "bg-[#90EE90]" : "bg-red-200";
  const changeText = change >= 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
  
  return (
    <div className="flex flex-col gap-1 pl-4">
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-normal text-[#0D0D0D]">
          {value.toFixed(1).padStart(4, '0')}%
        </p>
        <span className={`px-2 py-0.5 rounded text-xs font-normal ${changeColor} text-[#0D0D0D]`}>
          {changeText}
        </span>
      </div>
      <p className="text-xs font-normal text-[#999999]">{label}</p>
    </div>
  );
}
