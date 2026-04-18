"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#6366F1";

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  payload?: { stat?: string };
}

interface RadarTooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  p1Name: string;
  p2Name: string;
}

function RadarTooltipContent({
  active,
  payload,
  label,
  p1Name,
  p2Name,
}: RadarTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const p1Raw = payload.find((p) => p.dataKey === "p1")?.value ?? 0;
  const p2Raw = payload.find((p) => p.dataKey === "p2")?.value ?? 0;
  const p1 = Math.round(p1Raw);
  const p2 = Math.round(p2Raw);
  const delta = p1 - p2;
  const leader = delta === 0 ? "even" : delta > 0 ? "p1" : "p2";
  const statLabel = label ?? payload[0]?.payload?.stat ?? "";

  return (
    <div className="bg-white rounded-xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] border border-[#F3F3F3] overflow-hidden min-w-[180px]">
      <div className="px-3 py-2 border-b border-[#F3F3F3]">
        <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">
          {statLabel}
        </span>
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full shrink-0"
              style={{ backgroundColor: P1_COLOR }}
            />
            <span className="text-[10px] text-[#525252] truncate">{p1Name}</span>
          </span>
          <span
            className="text-[11px] font-medium tabular-nums tracking-[0.3px] shrink-0"
            style={{ color: leader === "p1" ? P1_COLOR : "#0D0D0D" }}
          >
            {p1}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full shrink-0"
              style={{ backgroundColor: P2_COLOR }}
            />
            <span className="text-[10px] text-[#525252] truncate">{p2Name}</span>
          </span>
          <span
            className="text-[11px] font-medium tabular-nums tracking-[0.3px] shrink-0"
            style={{ color: leader === "p2" ? P2_COLOR : "#0D0D0D" }}
          >
            {p2}%
          </span>
        </div>
        {delta !== 0 ? (
          <>
            <div className="h-px bg-[#F3F3F3] mt-1" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] text-[#AAAAAA] uppercase tracking-[1px]">
                Lead
              </span>
              <span
                className="text-[10px] font-medium tabular-nums tracking-[0.3px]"
                style={{ color: leader === "p1" ? P1_COLOR : P2_COLOR }}
              >
                +{Math.abs(delta)}%
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function renderPolarAngleLabel(props: {
  payload: { value: string };
  x: number;
  y: number;
  cx: number;
  cy: number;
}) {
  const { payload, x, y, cx, cy } = props;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const offsetX = (dx / dist) * 14;
  const offsetY = (dy / dist) * 14;

  return (
    <text
      x={x + offsetX}
      y={y + offsetY}
      textAnchor={x > cx ? "start" : x < cx ? "end" : "middle"}
      dominantBaseline={y > cy ? "hanging" : y < cy ? "auto" : "central"}
      className="fill-[#AAAAAA] text-[8px] font-medium tracking-[1px] uppercase"
    >
      {payload.value}
    </text>
  );
}

interface RadarChartSectionProps {
  data: Array<{ stat: string; p1: number; p2: number }>;
  p1Name: string;
  p2Name: string;
}

export function RadarChartSection({
  data,
  p1Name,
  p2Name,
}: RadarChartSectionProps) {
  // Empty state — keep the widget shape so the carousel height is stable.
  if (data.length === 0) {
    return (
      <div
        className="flex-1 min-w-0 h-[340px] flex items-center justify-center"
        role="status"
        aria-label="No comparison data"
      >
        <p className="text-[11px] font-normal text-[#888888] leading-[1.6]">
          Comparison data unavailable.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-w-0 flex flex-col gap-3"
      role="img"
      aria-label={`Radar chart comparing ${p1Name} and ${p2Name} across ${data.length} stats`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart cx="50%" cy="50%" outerRadius="68%" data={data}>
          <PolarGrid stroke="#EFEFEF" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="stat"
            tick={renderPolarAngleLabel as never}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name={p1Name}
            dataKey="p1"
            stroke={P1_COLOR}
            fill={P1_COLOR}
            fillOpacity={0.1}
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: P1_COLOR, strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: P1_COLOR,
              stroke: "#FFFFFF",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          <Radar
            name={p2Name}
            dataKey="p2"
            stroke={P2_COLOR}
            fill={P2_COLOR}
            fillOpacity={0.08}
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: P2_COLOR, strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: P2_COLOR,
              stroke: "#FFFFFF",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          <Tooltip
            cursor={{
              stroke: "#3B82F6",
              strokeWidth: 1,
              strokeDasharray: "2 3",
              opacity: 0.4,
            }}
            wrapperStyle={{ outline: "none" }}
            content={(props) => (
              <RadarTooltipContent
                {...(props as RadarTooltipContentProps)}
                p1Name={p1Name}
                p2Name={p2Name}
              />
            )}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Custom legend — matches the rest of the design system's typography tokens */}
      <div className="flex items-center justify-center gap-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: P1_COLOR }}
          />
          <span className="text-[10px] font-medium text-[#525252] uppercase tracking-[1px]">
            {p1Name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: P2_COLOR }}
          />
          <span className="text-[10px] font-medium text-[#525252] uppercase tracking-[1px]">
            {p2Name}
          </span>
        </div>
      </div>
    </div>
  );
}
