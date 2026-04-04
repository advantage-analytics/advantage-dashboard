import type { KpiCardData } from "@/lib/data/performance-server";

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

  const id = positive ? "spark-pos" : "spark-neg";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop
            offset="0%"
            stopColor={positive ? "#5DB955" : "#E51837"}
            stopOpacity={0.3}
          />
          <stop
            offset="100%"
            stopColor={positive ? "#5DB955" : "#E51837"}
            stopOpacity={1}
          />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface KpiCardsProps {
  cards: KpiCardData[];
}

export default function KpiCards({ cards }: KpiCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div className="flex gap-3 w-full">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex-1 flex flex-col gap-3 bg-white/[0.07] border border-white/[0.1] rounded-xl p-5 overflow-hidden min-w-0 transition-colors duration-200 hover:bg-white/[0.1]"
        >
          <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] whitespace-nowrap">
            {card.label}
          </p>
          <div className="flex items-end justify-between overflow-hidden">
            <p className="text-[28px] font-light text-white tracking-[-0.5px] leading-none tabular-nums">
              {card.value}
            </p>
            <Sparkline data={card.sparkline} positive={card.change >= 0} />
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className={`text-[10px] font-semibold ${card.change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
            >
              {card.change >= 0 ? "↑" : "↓"}
            </span>
            <span
              className={`text-[11px] font-medium ${card.change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
            >
              {card.change >= 0 ? "+" : ""}
              {card.change}%
            </span>
            <span className="text-[10px] font-normal text-[#777777]">
              {card.changeLabel}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
