"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Match } from "@/lib/data/types";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import { Bookmark, MousePointerClick, SlidersHorizontal, X } from "lucide-react";
import type { VideoFilters } from "./video-filters";
import { applyFilters, getTotalActiveFilterCount } from "./video-filters";
import { useAutoAdvance } from "./use-video-auto-advance";
import { useDismissed } from "@/hooks/use-dismissed";

/* ── Constants ────────────────────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];
const SEEK_EVENT = "match:video-seek";
const PREROLL_SECONDS = 4;

function getSeekOffsetSeconds(videoTime: number): number {
  return Math.min(PREROLL_SECONDS, Math.max(0, videoTime));
}

/* ── Types ─────────────────────────────────────────────────── */

interface GameGroup {
  setNumber: number;
  gameScore: string;
  points: MatchPoint[];
}

/* ── Helpers ───────────────────────────────────────────────── */

function groupPointsByGame(points: MatchPoint[]): GameGroup[] {
  const groups: GameGroup[] = [];
  let current: GameGroup | null = null;

  for (const point of points) {
    if (
      !current ||
      current.setNumber !== point.setNumber ||
      current.gameScore !== point.gameScore
    ) {
      current = {
        setNumber: point.setNumber,
        gameScore: point.gameScore,
        points: [],
      };
      groups.push(current);
    }
    current.points.push(point);
  }

  return groups;
}

/* ── Sub-components ────────────────────────────────────────── */

function EventTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: "events" | "saved";
  onTabChange: (tab: "events" | "saved") => void;
}) {
  return (
    <div className="flex flex-row shadow-[inset_0_-1px_0_0_#E7E7E7]">
      <button
        type="button"
        onClick={() => onTabChange("events")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          activeTab === "events"
            ? "text-[#3B82F6] border-[#3B82F6]"
            : "text-[#AAAAAA] border-transparent hover:text-[#525252]"
        }`}
      >
        Events
      </button>
      <button
        type="button"
        onClick={() => onTabChange("saved")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          activeTab === "saved"
            ? "text-[#3B82F6] border-[#3B82F6]"
            : "text-[#AAAAAA] border-transparent hover:text-[#525252]"
        }`}
      >
        Saved
      </button>
    </div>
  );
}

function GameHeader({
  setNumber,
  gameScore,
}: {
  setNumber: number;
  gameScore: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-row justify-between items-center px-2 pt-4 pb-2 border-b border-[#F3F3F3] bg-white">
      <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1px]">
        Set {setNumber}
      </span>
      <span className="text-[10px] font-medium text-[#AAAAAA] tabular-nums">{gameScore}</span>
    </div>
  );
}

function SavedIcon({
  filled,
  onClick,
}: {
  filled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={filled ? "Remove from saved" : "Save event"}
      className="shrink-0 p-1 -m-1 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1 rounded-sm"
    >
      <Bookmark
        size={12}
        stroke="#3B82F6"
        strokeWidth={1.5}
        fill={filled ? "#3B82F6" : "white"}
        aria-hidden
      />
    </button>
  );
}

function AnimatedProgressBar({ duration }: { duration: number | null }) {
  const seconds = duration ?? 5;

  return (
    <motion.div
      key="progress-bar"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE_CURVE }}
    >
      <div className="w-full h-[2px] bg-[#F3F3F3] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#3B82F6] rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: seconds, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}

function EventRow({
  point,
  match,
  isActive,
  activeDurationOverride,
  onSelect,
  onToggleSaved,
}: {
  point: MatchPoint;
  match: Match;
  isActive: boolean;
  activeDurationOverride?: number | null;
  onSelect: () => void;
  onToggleSaved: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isDisabled = point.videoTime == null;
  const playerName =
    point.player === "player1" ? match.player1.name : match.player2.name;

  return (
    <div
      role={isDisabled ? undefined : "button"}
      tabIndex={isDisabled ? undefined : 0}
      className={cn(
        "flex flex-col gap-1 rounded-[6px] transition-colors",
        isDisabled
          ? "opacity-40 cursor-default"
          : "cursor-pointer hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1",
      )}
      onMouseEnter={() => { if (!isDisabled) setIsHovered(true); }}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (!isDisabled) onSelect();
      }}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <motion.div
        layout
        className="flex flex-row items-center gap-3 py-2 px-1.5"
      >
        {/* Player avatar */}
        <div className="w-10 h-10 rounded-[6px] bg-[#F5F5F5] flex items-center justify-center shrink-0">
          <span className="text-[10px] font-medium text-[#AAAAAA]">
            {getInitials(playerName)}
          </span>
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-[#0D0D0D] truncate">
            {point.eventType}
          </span>
          <span className="text-[10px] text-[#AAAAAA] truncate">
            {point.description}
          </span>
        </div>

        {/* Score + saved icon */}
        <div className="flex flex-row items-center gap-3 shrink-0">
          <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">
            {point.pointScore}
          </span>
          <AnimatePresence>
            {(isHovered || isActive) && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="overflow-hidden"
              >
                <SavedIcon
                  filled={point.saved}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSaved();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {isActive && (
          <AnimatedProgressBar duration={activeDurationOverride ?? point.duration} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */

interface MatchVideoSidebarProps {
  match: Match;
  points: MatchPoint[];
  filters: VideoFilters;
  onClearFilters?: () => void;
  className?: string;
}

export function MatchVideoSidebar({
  match,
  points: initialPoints,
  filters,
  onClearFilters,
  className,
}: MatchVideoSidebarProps) {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<"events" | "saved">("events");
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [points, setPoints] = useState<MatchPoint[]>(initialPoints);
  const [seekHintDismissed, dismissSeekHint] = useDismissed("video-seek-hint");

  const handleToggleSaved = useCallback(async (pointId: string) => {
    let newSaved = true;
    setPoints((prev) =>
      prev.map((p) => {
        if (p.id === pointId) {
          newSaved = !p.saved;
          return { ...p, saved: newSaved };
        }
        return p;
      }),
    );

    const { error } = await supabase
      .from("points")
      .update({ saved: newSaved })
      .eq("id", pointId);

    if (error) {
      setPoints((prev) =>
        prev.map((p) => (p.id === pointId ? { ...p, saved: !newSaved } : p)),
      );
    }
  }, [supabase]);

  const filtered = applyFilters(points, filters);
  const displayPoints =
    activeTab === "saved" ? filtered.filter((p) => p.saved) : filtered;
  const gameGroups = groupPointsByGame(displayPoints);
  const hasActiveFilters = getTotalActiveFilterCount(filters) > 0;
  const hasPoints = initialPoints.length > 0;

  // Auto-dismiss the seek hint once the user clicks a point
  const handleSelectPoint = useCallback((pointId: string) => {
    if (!seekHintDismissed) dismissSeekHint();
    setActivePointId((prev) => (prev === pointId ? null : pointId));
  }, [seekHintDismissed, dismissSeekHint]);

  // Seek video when active point changes
  useAutoAdvance({
    activePointId,
    setActivePointId,
    displayPoints,
    getSeekOffsetSeconds,
    seekEvent: SEEK_EVENT,
  });

  return (
    <div className={cn(
      "flex flex-col bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden",
      className
    )}>
      {/* WidgetCard-style header */}
      <div className="flex items-center justify-between h-[47px] px-6">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Point List
        </p>
        <span className="text-[10px] text-[#AAAAAA] tabular-nums">
          {displayPoints.length} point{displayPoints.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Events / Saved tabs */}
      <div className="px-6">
        <EventTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* One-time seek hint — appears once, dismissed on first click or manually */}
      <AnimatePresence>
        {!seekHintDismissed && hasPoints && activeTab === "events" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE_CURVE }}
            className="overflow-hidden"
          >
            <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-[8px] bg-[#F5F8FF] border border-[#E0EAFF] px-3 py-2.5">
              <MousePointerClick className="w-3.5 h-3.5 text-[#3B82F6] shrink-0 mt-px" />
              <p className="text-[10px] leading-[15px] text-[#525252] flex-1">
                Click any point to jump to that moment in the video. Hover to bookmark it.
              </p>
              <button
                onClick={dismissSeekHint}
                className="shrink-0 p-0.5 -m-0.5 text-[#AAAAAA] hover:text-[#525252] transition-colors"
                aria-label="Dismiss hint"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable event list */}
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-280px)] scroll-pt-12 px-5 pb-4">
        {gameGroups.length > 0 ? (
          <div className="flex flex-col gap-1">
            {gameGroups.map((group, groupIdx) => (
              <div
                key={`${group.setNumber}-${group.gameScore}-${groupIdx}`}
                className="flex flex-col"
              >
                <GameHeader
                  setNumber={group.setNumber}
                  gameScore={group.gameScore}
                />
                {group.points.map((point) => (
                  <motion.div
                    key={point.id}
                    layout
                    transition={{ duration: 0.3, ease: EASE_CURVE }}
                  >
                    <EventRow
                      point={point}
                      match={match}
                      isActive={activePointId === point.id}
                      activeDurationOverride={
                        activePointId === point.id && point.videoTime != null
                          ? (point.duration ?? 5) + getSeekOffsetSeconds(point.videoTime)
                          : undefined
                      }
                      onSelect={() => handleSelectPoint(point.id)}
                      onToggleSaved={() => handleToggleSaved(point.id)}
                    />
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* ── Empty states ── */
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            {activeTab === "saved" ? (
              /* Saved tab — teach the bookmark feature */
              <>
                <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-3">
                  <Bookmark className="w-4 h-4 text-[#AAAAAA]" />
                </div>
                <p className="text-[11px] font-medium text-[#525252] mb-1">
                  No saved points yet
                </p>
                <p className="text-[10px] text-[#AAAAAA] leading-[15px] max-w-[200px]">
                  Hover over any point in the Events tab and click the bookmark icon to save it here.
                </p>
                <button
                  onClick={() => setActiveTab("events")}
                  className="mt-4 text-[10px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
                >
                  Go to Events
                </button>
              </>
            ) : hasActiveFilters ? (
              /* Filters active but no matches — offer clear path back */
              <>
                <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-3">
                  <SlidersHorizontal className="w-4 h-4 text-[#AAAAAA]" />
                </div>
                <p className="text-[11px] font-medium text-[#525252] mb-1">
                  No points match
                </p>
                <p className="text-[10px] text-[#AAAAAA] leading-[15px] max-w-[200px]">
                  The current filters are too narrow. Try removing some to see more results.
                </p>
                {onClearFilters && (
                  <button
                    onClick={onClearFilters}
                    className="mt-4 text-[10px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
                  >
                    Clear all filters
                  </button>
                )}
              </>
            ) : (
              /* No points at all (match not processed yet) */
              <>
                <p className="text-[11px] font-medium text-[#525252] mb-1">
                  No events available
                </p>
                <p className="text-[10px] text-[#AAAAAA] leading-[15px] max-w-[220px]">
                  Point data will appear here once the match has been processed.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
