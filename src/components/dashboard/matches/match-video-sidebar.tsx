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
const SEEK_EVENT = "match:video-seek";
const PREROLL_SECONDS = 4;
const FILTER_EVENT = "match:video-filters";

type VideoFilters = {
  sets: number[];
  scoreTypes: Array<"Pressure" | "Breakpoint" | "Set Point" | "Match Point">;
  pointScores: string[];
  servePlayers: Array<"player1" | "player2">;
  serveSides: Array<"Deuce" | "Ad">;
  serveTypes: Array<"First Serve" | "Second Serve">;
  serveSpins: Array<"Flat" | "Slice" | "Kick">;
  serveZones: Array<"Wide" | "Body" | "T">;
  returnPlayers: Array<"player1" | "player2">;
  returnSides: Array<"Deuce" | "Ad">;
  returnTypes: Array<"Forehand" | "Backhand">;
  returnSpins: Array<"Topspin" | "Slice">;
  returnZones: Array<"Down the Line" | "Middle" | "Crosscourt">;
  returnContacts: Array<"Inside" | "Middle" | "Neutral">;
  resultPlayers: Array<"player1" | "player2">;
  resultZones: Array<"Serve" | "Return" | "Forehand" | "Backhand" | "Volley" | "Overhead">;
  resultOutcomes: Array<"Won" | "Lost" | "Winner" | "Error">;
  customPlayers: Array<"player1" | "player2">;
  customSides: Array<"Deuce" | "Ad">;
  customDirections: Array<"Crosscourt" | "Down the Line" | "Inside Out" | "Inside In">;
  rallyShots: number[];
};

const EMPTY_FILTERS: VideoFilters = {
  sets: [],
  scoreTypes: [],
  pointScores: [],
  servePlayers: [],
  serveSides: [],
  serveTypes: [],
  serveSpins: [],
  serveZones: [],
  returnPlayers: [],
  returnSides: [],
  returnTypes: [],
  returnSpins: [],
  returnZones: [],
  returnContacts: [],
  resultPlayers: [],
  resultZones: [],
  resultOutcomes: [],
  customPlayers: [],
  customSides: [],
  customDirections: [],
  rallyShots: [],
};

function getSeekOffsetSeconds(videoTime: number): number {
  return Math.min(PREROLL_SECONDS, Math.max(0, videoTime));
}

function pointSide(pointNumberInGame: number): "Deuce" | "Ad" {
  // Tennis side alternates each point; first point is deuce.
  return pointNumberInGame % 2 === 1 ? "Deuce" : "Ad";
}

function winnerOrError(resultType: string): "Winner" | "Error" | null {
  const s = (resultType || "").toLowerCase();
  if (!s) return null;
  if (s.includes("winner") || s === "ace" || s.includes("service winner")) return "Winner";
  if (s.includes("error") || s.includes("double fault")) return "Error";
  return null;
}

function resultZoneFromPoint(point: MatchPoint): VideoFilters["resultZones"][number] | null {
  const t = (point.lastShotType || "").toLowerCase();
  if (t.includes("serve")) return "Serve";
  if (t.includes("forehand")) return "Forehand";
  if (t.includes("backhand")) return "Backhand";
  if (t.includes("volley")) return "Volley";
  if (t.includes("overhead")) return "Overhead";
  if (t.includes("return")) return "Return";

  // Fallback for serve-only points
  const rt = (point.resultType || "").toLowerCase();
  if (rt === "ace" || rt.includes("service winner") || rt.includes("double fault")) return "Serve";
  return null;
}

function contactBucketFromZone(zone: string | null | undefined): "Inside" | "Middle" | "Neutral" | null {
  if (!zone) return null;
  if (zone === "Middle") return "Middle";
  if (zone === "Down the Line") return "Inside";
  if (zone === "Crosscourt") return "Neutral";
  return null;
}

function applyFilters(points: MatchPoint[], filters: VideoFilters): MatchPoint[] {
  const has = <T,>(arr: T[]) => arr.length > 0;

  return points.filter((p) => {
    // Score: Sets
    if (has(filters.sets) && !filters.sets.includes(p.setNumber)) return false;

    // Score: Type
    if (has(filters.scoreTypes)) {
      const pressure = p.isBreakPoint || p.isSetPoint || p.isMatchPoint;
      if (filters.scoreTypes.includes("Pressure") && !pressure) return false;
      if (filters.scoreTypes.includes("Breakpoint") && !p.isBreakPoint) return false;
      if (filters.scoreTypes.includes("Set Point") && !p.isSetPoint) return false;
      if (filters.scoreTypes.includes("Match Point") && !p.isMatchPoint) return false;
    }

    // Score: Points
    if (has(filters.pointScores) && !filters.pointScores.includes(p.pointScore)) return false;

    // Serve filters (based on first shot / server)
    if (
      has(filters.servePlayers) ||
      has(filters.serveSides) ||
      has(filters.serveTypes) ||
      has(filters.serveSpins) ||
      has(filters.serveZones)
    ) {
      const server: "player1" | "player2" = p.serverIsPlayer1 ? "player1" : "player2";
      if (has(filters.servePlayers) && !filters.servePlayers.includes(server)) return false;
      const side = pointSide(p.pointNumber);
      if (has(filters.serveSides) && !filters.serveSides.includes(side)) return false;
      const serveType = p.firstShotType as any;
      if (has(filters.serveTypes) && !filters.serveTypes.includes(serveType)) return false;
      const spin = p.firstShotSpin as any;
      if (has(filters.serveSpins) && !filters.serveSpins.includes(spin)) return false;
      const zone = p.firstShotZone as any;
      if (has(filters.serveZones) && !filters.serveZones.includes(zone)) return false;
    }

    // Return filters (based on second shot / receiver)
    if (
      has(filters.returnPlayers) ||
      has(filters.returnSides) ||
      has(filters.returnTypes) ||
      has(filters.returnSpins) ||
      has(filters.returnZones) ||
      has(filters.returnContacts)
    ) {
      const receiver: "player1" | "player2" = p.serverIsPlayer1 ? "player2" : "player1";
      if (has(filters.returnPlayers) && !filters.returnPlayers.includes(receiver)) return false;
      const side = pointSide(p.pointNumber);
      if (has(filters.returnSides) && !filters.returnSides.includes(side)) return false;
      const type = p.secondShotType as any;
      if (has(filters.returnTypes) && !filters.returnTypes.includes(type)) return false;
      const spin = p.secondShotSpin as any;
      if (has(filters.returnSpins) && !filters.returnSpins.includes(spin)) return false;
      const zone = p.secondShotZone as any;
      if (has(filters.returnZones) && !filters.returnZones.includes(zone)) return false;
      const contact = contactBucketFromZone(p.secondShotZone);
      if (has(filters.returnContacts) && (!contact || !filters.returnContacts.includes(contact))) return false;
    }

    // Result filters (based on decisive shot)
    if (has(filters.resultPlayers) && !filters.resultPlayers.includes(p.player)) return false;
    const rz = resultZoneFromPoint(p);
    if (has(filters.resultZones) && (!rz || !filters.resultZones.includes(rz))) return false;
    if (has(filters.resultOutcomes)) {
      // Won/Lost are relative to the selected result player; if both are selected, allow either.
      const outcome = winnerOrError(p.resultType);
      if (filters.resultOutcomes.includes("Winner") || filters.resultOutcomes.includes("Error")) {
        if (!outcome || !filters.resultOutcomes.includes(outcome)) return false;
      }
      if (filters.resultOutcomes.includes("Won") || filters.resultOutcomes.includes("Lost")) {
        const wonBy = p.wonByPlayer1 ? "player1" : "player2";
        const lostBy = wonBy === "player1" ? "player2" : "player1";
        const okWon =
          filters.resultOutcomes.includes("Won") &&
          (!has(filters.resultPlayers) || filters.resultPlayers.includes(wonBy));
        const okLost =
          filters.resultOutcomes.includes("Lost") &&
          (!has(filters.resultPlayers) || filters.resultPlayers.includes(lostBy));
        if (!okWon && !okLost) return false;
      }
    }

    // Custom filters (best-effort on existing data)
    if (has(filters.customPlayers) && !filters.customPlayers.includes(p.player)) return false;
    if (has(filters.customSides)) {
      const side = pointSide(p.pointNumber);
      if (!filters.customSides.includes(side)) return false;
    }
    if (has(filters.customDirections)) {
      const z = p.lastShotZone;
      const map: Record<string, VideoFilters["customDirections"][number]> = {
        "Crosscourt": "Crosscourt",
        "Down the Line": "Down the Line",
      };
      const dir = z ? map[z] : undefined;
      if (!dir || !filters.customDirections.includes(dir)) return false;
    }
    if (has(filters.rallyShots) && !filters.rallyShots.includes(p.rallyLength)) return false;

    return true;
  });
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
  const [filters, setFilters] = useState<VideoFilters>(EMPTY_FILTERS);

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

  const filtered = applyFilters(points, filters);
  const displayPoints =
    activeTab === "saved" ? filtered.filter((p) => p.saved) : filtered;
  const gameGroups = groupPointsByGame(displayPoints);

  // Receive filter updates from the video panel
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<VideoFilters>;
      const next = ce?.detail;
      if (!next) return;
      setFilters(next);
    };
    window.addEventListener(FILTER_EVENT, handler as EventListener);
    return () => window.removeEventListener(FILTER_EVENT, handler as EventListener);
  }, []);

  // Seek video when active point changes (click or auto-advance)
  useEffect(() => {
    if (!activePointId) return;
    const active = displayPoints.find((p) => p.id === activePointId);
    if (!active?.videoTime && active?.videoTime !== 0) return;

    const offset = getSeekOffsetSeconds(active.videoTime);
    const targetTime = Math.max(0, active.videoTime - offset);

    window.dispatchEvent(
      new CustomEvent(SEEK_EVENT, { detail: { time: targetTime } }),
    );
  }, [activePointId, displayPoints]);

  // Auto-advance to next playable point when the active point's duration elapses
  useEffect(() => {
    if (!activePointId) return;
    const idx = displayPoints.findIndex((p) => p.id === activePointId);
    if (idx === -1) return;

    const active = displayPoints[idx];
    const seconds = active.duration ?? 5;
    const offset =
      active.videoTime != null ? getSeekOffsetSeconds(active.videoTime) : 0;
    const effectiveSeconds = seconds + offset;

    const timer = setTimeout(
      () => {
        const next = displayPoints
          .slice(idx + 1)
          .find((p) => p.videoTime != null);
        setActivePointId(next ? next.id : null);
      },
      (effectiveSeconds + AUTO_ADVANCE_DELAY) * 1000,
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
                      activeDurationOverride={
                        activePointId === point.id && point.videoTime != null
                          ? (point.duration ?? 5) + getSeekOffsetSeconds(point.videoTime)
                          : undefined
                      }
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
