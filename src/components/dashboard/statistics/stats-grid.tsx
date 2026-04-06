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
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden transition-[box-shadow,border-color,transform] duration-200 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)] hover:border-[#E7E7E7] hover:scale-[1.008]">
      <div className="mb-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Key Stats
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          {hasData ? "Averages across all tracked matches" : "Upload matches with stats to see averages"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex flex-col gap-2 bg-[#FAFAFA] rounded-xl p-4 border border-[#F3F3F3]"
          >
            <Icon className="size-4 text-[#AAAAAA]" strokeWidth={1.5} aria-hidden="true" />
            <div>
              <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] leading-[13.5px] mb-1">
                {label}
              </p>
              <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-none tabular-nums">
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
