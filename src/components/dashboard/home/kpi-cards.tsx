"use client";

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

  const pts = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const polylinePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${pts[0].x},${height} ${pts.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${pts[pts.length - 1].x},${height} Z`;

  const color = positive ? "#5DB955" : "#E51837";
  const lineId = `spark-line-${positive ? "pos" : "neg"}`;
  const areaId = `spark-area-${positive ? "pos" : "neg"}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={1} />
        </linearGradient>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${areaId})`} />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={`url(#${lineId})`}
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
          className="flex-1 flex flex-col gap-3 bg-white border border-[var(--color-border-card)] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden min-w-0 transition-[box-shadow,border-color,transform] duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] hover:border-[var(--color-border-default)] hover:scale-[1.008]"
        >
          <p className="text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2px] whitespace-nowrap">
            {card.label}
          </p>
          <div className="flex items-end justify-between overflow-hidden">
            <p className="text-[28px] font-light text-[var(--color-text-primary)] tracking-[-0.5px] leading-none tabular-nums">
              {card.value}
            </p>
            <Sparkline data={card.sparkline} positive={card.change >= 0} />
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className={`text-[10px] font-semibold ${card.change >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
            >
              {card.change >= 0 ? "↑" : "↓"}
            </span>
            <span
              className={`text-[11px] font-medium ${card.change >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
            >
              {card.change >= 0 ? "+" : ""}
              {card.change}%
            </span>
            <span className="text-[10px] font-normal text-[var(--color-text-change)]">
              {card.changeLabel}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
