function Sparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 28;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#5DB955" : "#E51837"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface WinRateCardProps {
  value: number;
  change: number;
  sparkline: number[];
}

export default function WinRateCard({
  value,
  change,
  sparkline,
}: WinRateCardProps) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[16px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden flex flex-col gap-4">
      <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
        WIN RATE
      </p>
      <div className="flex items-end justify-between overflow-hidden">
        <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-none">
          {value}%
        </p>
        <Sparkline data={sparkline} positive={change >= 0} />
      </div>
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span
          className={`text-[10px] font-semibold ${change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
        >
          {change >= 0 ? "↑" : "↓"}
        </span>
        <span
          className={`text-[11px] font-medium ${change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
        >
          {change >= 0 ? "+" : ""}
          {change}%
        </span>
        <span className="text-[10px] font-normal text-[#AAAAAA]">
          last 30 days
        </span>
      </div>
    </div>
  );
}
