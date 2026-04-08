import type { HeatmapDay } from "@/lib/data/performance-server";

interface MatchHeatmapProps {
  heatmap: HeatmapDay[];
  matchCount: number;
  wins: number;
  losses: number;
  form: ("W" | "L")[];
}

function getCellColor(count: number): string {
  if (count === 0) return "bg-[#F2F2F2]";
  if (count === 1) return "bg-[#B8D4F9]";
  if (count === 2) return "bg-[#6AABFF]";
  return "bg-[#3B82F6]";
}

function getCellTextColor(count: number): string {
  if (count > 0) return "text-white";
  return "text-[#BFBFBF]";
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function MatchHeatmap({
  heatmap,
  matchCount,
  wins,
  losses,
  form,
}: MatchHeatmapProps) {
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear();

  // Determine the first day of the month (0 = Sunday, convert to Monday-start)
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  // Convert from Sunday-start (0=Sun) to Monday-start (0=Mon)
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  // Build grid cells: empty cells for offset, then day cells
  const gridCells: (HeatmapDay | null)[] = [];
  for (let i = 0; i < startOffset; i++) {
    gridCells.push(null);
  }
  for (const day of heatmap) {
    gridCells.push(day);
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <p className="text-[10px] font-medium text-[#AAAAAA] tracking-[2.5px] uppercase">
          MATCH ACTIVITY
        </p>
        <p className="text-[10px] font-medium text-[#AAAAAA]">
          {monthName} {year}
        </p>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Day labels */}
        <div className="grid grid-cols-7 gap-[4px] sm:gap-[6px]">
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
            >
              <span className="text-[8px] font-medium text-[#AAAAAA]">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-[4px] sm:gap-[6px]" role="grid" aria-label="Match activity calendar">
          {gridCells.map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} className="aspect-square rounded-[4px]" aria-hidden="true" />;
            }
            const dayNum = parseInt(cell.date.slice(-2), 10);
            const isToday = dayNum === now.getDate();
            return (
              <div
                key={cell.date}
                className={`aspect-square rounded-[4px] ${getCellColor(cell.count)} flex items-center justify-center relative transition-colors duration-200 ${isToday ? "ring-1 ring-[#3B82F6] ring-offset-1" : ""}`}
                role="gridcell"
                aria-label={`${cell.date}: ${cell.count} match${cell.count !== 1 ? "es" : ""}`}
                title={`${cell.date}: ${cell.count} match${cell.count !== 1 ? "es" : ""}`}
              >
                <span
                  className={`text-[8px] font-medium ${getCellTextColor(cell.count)}`}
                >
                  {dayNum}
                </span>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-[#F3F3F3]" />

        {/* Summary row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-[#525252]">
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
            <span className="text-[11px] font-normal text-[#888888]">
              {wins}W – {losses}L
            </span>
          </div>

          {/* Form pills */}
          {form.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1px] mr-1">
                Form
              </span>
              {form.map((result, i) => (
                <span
                  key={i}
                  className={`w-5 h-5 rounded-[3px] flex items-center justify-center text-[9px] font-semibold ${
                    result === "W"
                      ? "bg-[rgba(115,230,104,0.2)] text-[#3D8B38]"
                      : "bg-[rgba(229,24,55,0.2)] text-[#B81430]"
                  }`}
                >
                  {result}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
