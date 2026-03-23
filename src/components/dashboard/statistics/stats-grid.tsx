import { Zap, XCircle, Trophy, AlertCircle, Target, ArrowLeftRight } from "lucide-react";
import type { StatisticsPageData } from "@/lib/data/statistics-server";

interface StatsGridProps {
  data: StatisticsPageData;
}

export function StatsGrid({ data }: StatsGridProps) {
  const stats = [
    {
      label: "Aces / Match",
      value: data.avgAces !== null ? String(data.avgAces) : "—",
      icon: Zap,
    },
    {
      label: "Double Faults",
      value: data.avgDoubleFaults !== null ? String(data.avgDoubleFaults) : "—",
      icon: XCircle,
    },
    {
      label: "Winners",
      value: data.avgWinners !== null ? String(data.avgWinners) : "—",
      icon: Trophy,
    },
    {
      label: "Unforced Errors",
      value: data.avgUnforcedErrors !== null ? String(data.avgUnforcedErrors) : "—",
      icon: AlertCircle,
    },
    {
      label: "1st Serve In",
      value: data.avgFirstServePct !== null ? `${data.avgFirstServePct}%` : "—",
      icon: Target,
    },
    {
      label: "Break Conversion",
      value:
        data.avgBreakPointsConvertedPct !== null
          ? `${data.avgBreakPointsConvertedPct}%`
          : "—",
      icon: ArrowLeftRight,
    },
  ];

  const hasData = stats.some((s) => s.value !== "—");

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-[#0D0D0D]">Key Stats</h2>
        <p className="text-xs text-[#999999] mt-0.5">
          {hasData ? "Averages across all tracked matches" : "Upload matches with stats to see averages"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex flex-col gap-2 bg-[#FAFAFA] rounded-xl p-4 border border-[rgba(0,0,0,0.04)]"
          >
            <Icon className="w-4 h-4 text-[#CCCCCC]" />
            <div>
              <p className="text-[10px] font-medium text-[#999999] uppercase tracking-wide leading-tight mb-1">
                {label}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-[#0D0D0D] leading-none">
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
