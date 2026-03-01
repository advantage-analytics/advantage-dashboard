"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import { Bookmark } from "lucide-react";

/* ── Constants ────────────────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];
const AUTO_ADVANCE_DELAY = 1; // seconds – pause at 100% before advancing
const supabase = createClient();

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
    <div className="flex flex-row shadow-[inset_0_-1px_0_0_#D9D9D9]">
      <button
        type="button"
        onClick={() => onTabChange("events")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          activeTab === "events"
            ? "text-[#3986F3] border-[#3986F3]"
            : "text-[#999999] border-transparent hover:text-[#666666]"
        }`}
      >
        Events
      </button>
      <button
        type="button"
        onClick={() => onTabChange("saved")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          activeTab === "saved"
            ? "text-[#3986F3] border-[#3986F3]"
            : "text-[#999999] border-transparent hover:text-[#666666]"
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
    <div className="sticky top-0 z-10 flex flex-row justify-between items-center px-2 pt-4 pb-2 border-b border-[#D9D9D9] bg-white shadow-[0_1px_0_0_white]">
      <span className="text-xs font-medium text-[#999999]">
        Set {setNumber}
      </span>
      <span className="text-xs font-medium text-[#999999]">{gameScore}</span>
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
      className="shrink-0 p-1 -m-1 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6AABFF] focus-visible:ring-offset-1 rounded-sm"
    >
      <Bookmark
        size={12}
        stroke="#6AABFF"
        strokeWidth={1.5}
        fill={filled ? "#6AABFF" : "white"}
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
      <div className="w-full h-[2px] bg-[#E5E5E5] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#3986F3] rounded-full"
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
  onSelect,
  onToggleSaved,
}: {
  point: MatchPoint;
  match: Match;
  isActive: boolean;
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
        "flex flex-col gap-1 rounded-sm transition-colors",
        isDisabled
          ? "opacity-40 cursor-default"
          : "cursor-pointer hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3986F3] focus-visible:ring-offset-1",
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
        <div className="w-12 h-12 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-xs font-medium text-[#BFBFBF]">
            {getInitials(playerName)}
          </span>
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="text-xs font-medium text-[#0D0D0D] truncate">
            {point.eventType}
          </span>
          <span className="text-[10px] font-normal text-[#999999] truncate">
            {point.description}
          </span>
        </div>

        {/* Score + saved icon */}
        <div className="flex flex-row items-center gap-4 shrink-0">
          <span className="text-base font-medium text-[#0D0D0D] tabular-nums">
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
        {isActive && <AnimatedProgressBar duration={point.duration} />}
      </AnimatePresence>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */

interface MatchVideoSidebarProps {
  match: Match;
  matchId: string;
  statsResult: MatchStatisticsResult | null;
  points: MatchPoint[];
}

export function MatchVideoSidebar({
  match,
  matchId: _matchId,
  statsResult: _statsResult,
  points: initialPoints,
}: MatchVideoSidebarProps) {
  const [activeTab, setActiveTab] = useState<"events" | "saved">("events");
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [points, setPoints] = useState<MatchPoint[]>(initialPoints);

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
  }, []);

  const displayPoints =
    activeTab === "saved" ? points.filter((p) => p.saved) : points;
  const gameGroups = groupPointsByGame(displayPoints);

  // Auto-advance to next playable point when the active point's duration elapses
  useEffect(() => {
    if (!activePointId) return;
    const idx = displayPoints.findIndex((p) => p.id === activePointId);
    if (idx === -1) return;

    const active = displayPoints[idx];
    const seconds = active.duration ?? 5;

    const timer = setTimeout(
      () => {
        const next = displayPoints
          .slice(idx + 1)
          .find((p) => p.videoTime != null);
        setActivePointId(next ? next.id : null);
      },
      (seconds + AUTO_ADVANCE_DELAY) * 1000,
    );

    return () => clearTimeout(timer);
  }, [activePointId, displayPoints]);

  return (
    <div className="w-[320px] flex flex-col bg-white rounded-2xl border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Events / Saved tabs */}
      <div className="px-6 pt-4">
        <EventTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Scrollable event list */}
      <div
        className="flex-1 overflow-y-auto max-h-[600px] scroll-pt-12 px-6 pb-4"
      >
        {gameGroups.length > 0 ? (
          <div className="flex flex-col gap-2">
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
                      onSelect={() =>
                        setActivePointId((prev) =>
                          prev === point.id ? null : point.id,
                        )
                      }
                      onToggleSaved={() => handleToggleSaved(point.id)}
                    />
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <span className="text-xs text-[#999999]">
              {activeTab === "saved"
                ? "No saved events yet"
                : "No events available"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
