"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HeatmapDay } from "@/lib/data/performance-server";
import { VIZ_HEATMAP } from "@/lib/design/data-viz";

interface MatchHeatmapProps {
  heatmap: HeatmapDay[];
  matchCount: number;
  wins: number;
  losses: number;
  form: ("W" | "L")[];
}

function getCellLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

function getCellTextColor(count: number): string {
  return count > 0 ? "text-white" : "text-[#BFBFBF]";
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const LEGEND_COLORS = VIZ_HEATMAP;

export default function MatchHeatmap({
  heatmap,
  matchCount,
  wins,
  losses,
  form,
}: MatchHeatmapProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear();

  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const gridCells: (HeatmapDay | null)[] = [];
  for (let i = 0; i < startOffset; i++) gridCells.push(null);
  for (const day of heatmap) gridCells.push(day);

  const selectedDay = selectedDate
    ? heatmap.find((d) => d.date === selectedDate) ?? null
    : null;

  // Which row is the selected cell in? (0-indexed, after header row)
  const selectedCellIndex = selectedDate
    ? gridCells.findIndex((c) => c?.date === selectedDate)
    : -1;
  const selectedRow = selectedCellIndex >= 0 ? Math.floor(selectedCellIndex / 7) : -1;
  const selectedCol = selectedCellIndex >= 0 ? selectedCellIndex % 7 : -1;
  const totalRows = Math.ceil(gridCells.length / 7);
  const showAbove = selectedRow >= totalRows - 2; // flip if in bottom 2 rows

  // Navigable date indices (cells that have data)
  const navigableDates = heatmap.map((d) => d.date);

  // Dismiss on click outside
  useEffect(() => {
    if (!selectedDate) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedDate(null);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [selectedDate]);

  const handleCellClick = (cell: HeatmapDay) => {
    if (cell.count === 0) return;
    setSelectedDate((prev) => (prev === cell.date ? null : cell.date));
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, cellIndex: number) => {
      const cell = gridCells[cellIndex];
      if (!cell) return;

      if (e.key === "Escape" && selectedDate) {
        e.preventDefault();
        setSelectedDate(null);
        return;
      }

      let targetIndex = cellIndex;
      if (e.key === "ArrowRight") targetIndex = cellIndex + 1;
      else if (e.key === "ArrowLeft") targetIndex = cellIndex - 1;
      else if (e.key === "ArrowDown") targetIndex = cellIndex + 7;
      else if (e.key === "ArrowUp") targetIndex = cellIndex - 7;
      else return;

      e.preventDefault();
      const target = gridCells[targetIndex];
      if (target) {
        cellRefs.current.get(target.date)?.focus();
      }
    },
    [gridCells, selectedDate],
  );

  // Popover position: clamp so it doesn't overflow container edges
  const popoverWidth = 230; // matches w-[230px]
  // Cell center as a fraction 0-1
  const cellCenterFrac = selectedCol >= 0 ? (selectedCol + 0.5) / 7 : 0.5;
  // Shift the popover so it stays within bounds
  // translateX ranges from 0% (left-aligned) to -100% (right-aligned), default -50% (centered)
  let translateX = "-50%";
  if (selectedCol <= 1) {
    translateX = "-15%";
  } else if (selectedCol >= 5) {
    translateX = "-85%";
  }
  const popoverLeft = `${cellCenterFrac * 100}%`;

  return (
    <div
      ref={containerRef}
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] tracking-[2.5px] uppercase">
          Match Activity
        </p>
        <p className="text-[10px] font-medium text-[#AAAAAA]">
          {monthName} {year}
        </p>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Calendar grid */}
        <div className="relative">
          <div
            ref={gridRef}
            className="grid grid-cols-7 gap-[4px] sm:gap-[6px]"
            role="grid"
            aria-label="Match activity calendar"
          >
            {DAY_LABELS.map((label, i) => (
              <div key={`header-${i}`} className="flex items-center justify-center" role="columnheader">
                <span className="text-[8px] font-medium text-[#AAAAAA]">{label}</span>
              </div>
            ))}
            {gridCells.map((cell, i) => {
              if (!cell) {
                return <div key={`empty-${i}`} className="aspect-square rounded-[4px]" aria-hidden="true" />;
              }
              const dayNum = parseInt(cell.date.slice(-2), 10);
              const isToday = dayNum === now.getDate();
              const hasMatches = cell.count > 0;
              const isSelected = selectedDate === cell.date;
              const cellLabel = hasMatches
                ? `${dayNum}: ${cell.count} match${cell.count !== 1 ? "es" : ""}. Click for details.`
                : `${dayNum}: No matches`;

              return (
                <button
                  key={cell.date}
                  ref={(el) => { if (el) cellRefs.current.set(cell.date, el); }}
                  type="button"
                  tabIndex={isSelected || (!selectedDate && cell.date === navigableDates[0]) ? 0 : -1}
                  className={`aspect-square rounded-[4px] flex items-center justify-center relative transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
                    isToday && !isSelected ? "ring-1 ring-[#3B82F6] ring-offset-1" : ""
                  } ${isSelected ? "ring-2 ring-[#3B82F6] ring-offset-1 z-10" : ""} ${
                    hasMatches ? "cursor-pointer hover:brightness-90" : "cursor-default"
                  }`}
                  style={{ backgroundColor: VIZ_HEATMAP[getCellLevel(cell.count)] }}
                  role="gridcell"
                  aria-label={cellLabel}
                  aria-pressed={isSelected}
                  onClick={() => handleCellClick(cell)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                >
                  <span className={`text-[8px] font-medium ${getCellTextColor(cell.count)}`}>
                    {dayNum}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Anchored popover */}
          {selectedDay && selectedDay.count > 0 && (
            <div
              className="absolute z-20"
              style={{
                left: popoverLeft,
                transform: `translateX(${translateX})`,
                ...(showAbove
                  ? { bottom: `calc(100% - ${selectedRow * (100 / totalRows)}% + 8px)` }
                  : { top: `calc(${((selectedRow + 1) / totalRows) * 100}% + 28px)` }),
              }}
            >
              <div className="bg-white border border-[#F3F3F3] rounded-xl shadow-tooltip py-2.5 px-3 flex flex-col gap-2 w-[230px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">
                    {new Date(selectedDay.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-[10px] text-[#AAAAAA] tabular-nums">
                    {selectedDay.count} match{selectedDay.count !== 1 ? "es" : ""}
                  </span>
                </div>
                <div className="h-px bg-[#F3F3F3]" />
                <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto -mx-3 px-3">
                  {selectedDay.matches.map((m) => (
                    <Link
                      key={m.id}
                      href={`/dashboard/matches/${m.id}`}
                      className="flex items-center justify-between gap-2 -mx-3 px-3 py-1 hover:bg-[#F9FAFB] transition-colors duration-150 group rounded-lg"
                      onClick={() => setSelectedDate(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`size-[5px] rounded-full shrink-0 ${
                            m.won ? "bg-[#5DB955]" : "bg-[#E51837]"
                          }`}
                        />
                        <span className="text-[10px] text-[#525252] truncate">{m.opponent}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-[#AAAAAA] tabular-nums">{m.score}</span>
                        <ChevronRight className="w-3 h-3 text-[#CCCCCC] group-hover:text-[#3B82F6] transition-colors duration-150" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Color legend + discoverability hint */}
        <div className="flex items-center justify-between h-[14px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-[#AAAAAA]">Less</span>
            {LEGEND_COLORS.map((color, i) => (
              <span
                key={i}
                className="w-[10px] h-[10px] rounded-[2px]"
                style={{ backgroundColor: color }}
              />
            ))}
            <span className="text-[8px] text-[#AAAAAA]">More</span>
          </div>
          <span className={`text-[9px] text-[#CCCCCC] transition-opacity duration-150 ${selectedDate || matchCount === 0 ? "opacity-0" : "opacity-100"}`}>
            Tap a match day for details
          </span>
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

          {form.length > 0 && (
            <div className="flex items-center gap-1" aria-label="Recent form" role="group">
              <span className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1px] mr-1">
                Form
              </span>
              {form.map((result, i) => (
                <span
                  key={i}
                  className={`w-5 h-5 rounded-[3px] flex items-center justify-center text-[9px] font-semibold ${
                    result === "W"
                      ? "bg-[rgba(93,185,85,0.2)] text-[#5DB955]"
                      : "bg-[rgba(229,24,55,0.2)] text-[#E51837]"
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
