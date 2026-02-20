"use client";

import { useState } from "react";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import { PLAYER_COLORS } from "./sidebar-shared";

/* ── Types ─────────────────────────────────────────────────── */

interface MatchEvent {
  id: string;
  player: "player1" | "player2";
  eventType: string;
  description: string;
  score: string;
  isSaved?: boolean;
}

interface SetGroup {
  setNumber: number;
  startScore: string;
  endScore?: string;
  events: MatchEvent[];
}

/* ── Mock data (to be replaced with real data source) ──────── */

function getMockEvents(): SetGroup[] {
  return [
    {
      setNumber: 1,
      startScore: "0-0",
      endScore: "0-1",
      events: [
        {
          id: "1",
          player: "player1",
          eventType: "Service Winner",
          description: "Game 1",
          score: "0-0",
          isSaved: true,
        },
        {
          id: "2",
          player: "player2",
          eventType: "Backhand Return Error",
          description: "Slice down the line",
          score: "15-0",
        },
        {
          id: "3",
          player: "player2",
          eventType: "Backhand Return Error",
          description: "Slice down the line",
          score: "15-15",
        },
        {
          id: "4",
          player: "player2",
          eventType: "Backhand Return Error",
          description: "Slice down the line",
          score: "15-30",
        },
        {
          id: "5",
          player: "player2",
          eventType: "Backhand Return Error",
          description: "Breakpoint",
          score: "15-40",
        },
      ],
    },
    {
      setNumber: 1,
      startScore: "0-1",
      events: [
        {
          id: "6",
          player: "player2",
          eventType: "Backhand Return Error",
          description: "Breakpoint",
          score: "15-40",
        },
      ],
    },
  ];
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
        className={`h-[36px] flex-1 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
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
        className={`h-[36px] flex-1 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
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

function SetHeader({ setNumber, score }: { setNumber: number; score: string }) {
  return (
    <div className="flex flex-row justify-between items-center px-2 py-2 border-b border-[#D9D9D9]">
      <span className="text-xs font-medium text-[#999999]">
        Set {setNumber}
      </span>
      <span className="text-xs font-medium text-[#999999]">{score}</span>
    </div>
  );
}

function BookmarkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M2 1.5C2 1.22386 2.22386 1 2.5 1H9.5C9.77614 1 10 1.22386 10 1.5V11L6 8.5L2 11V1.5Z"
        fill="#6AABFF"
      />
    </svg>
  );
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ProgressBar({ percent = 90 }: { percent?: number }) {
  return (
    <div className="w-full h-[2px] bg-[#E5E5E5] rounded-full overflow-hidden">
      <div
        className="h-full bg-[#3986F3] rounded-full"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function EventRow({
  event,
  match,
}: {
  event: MatchEvent;
  match: Match;
}) {
  const playerName =
    event.player === "player1" ? match.player1.name : match.player2.name;
  const playerColor = PLAYER_COLORS[event.player];

  return (
    <div className="flex flex-row items-center gap-3 py-2">
      {/* Player avatar */}
      <div className="w-14 h-14 rounded-lg bg-[#F3F3F3] flex items-center justify-center shrink-0">
        <span
          className="text-sm font-semibold"
          style={{ color: playerColor }}
        >
          {getInitials(playerName)}
        </span>
      </div>

      {/* Event info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-sm font-medium text-[#0D0D0D] truncate">
          {event.eventType}
        </span>
        <span className="text-xs font-normal text-[#999999] truncate">
          {event.description}
        </span>
      </div>

      {/* Score + bookmark */}
      <div className="flex flex-row items-center gap-4 shrink-0">
        <span className="text-xl font-medium text-[#0D0D0D] tabular-nums">
          {event.score}
        </span>
        {event.isSaved && <BookmarkIcon />}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */

interface MatchVideoSidebarProps {
  match: Match;
  matchId: string;
  statsResult: MatchStatisticsResult | null;
}

export function MatchVideoSidebar({
  match,
  matchId: _matchId,
  statsResult: _statsResult,
}: MatchVideoSidebarProps) {
  const [activeTab, setActiveTab] = useState<"events" | "saved">("events");
  const setGroups = getMockEvents();

  const savedEvents = setGroups.flatMap((group) =>
    group.events.filter((e) => e.isSaved)
  );

  return (
    <div className="w-[320px] flex flex-col gap-6 px-6 py-4 bg-white rounded-2xl border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      {/* Events / Saved tabs */}
      <EventTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Event list */}
      <div className="flex flex-col gap-6">
        {activeTab === "events" ? (
          setGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="flex flex-col gap-2">
              <SetHeader
                setNumber={group.setNumber}
                score={group.startScore}
              />
              {group.events.map((event, eventIdx) => (
                <div key={event.id}>
                  <EventRow
                    event={event}
                    match={match}
                  />
                  {eventIdx === 0 && <ProgressBar />}
                </div>
              ))}
              {group.endScore && (
                <SetHeader
                  setNumber={group.setNumber}
                  score={group.endScore}
                />
              )}
            </div>
          ))
        ) : savedEvents.length > 0 ? (
          savedEvents.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              match={match}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <span className="text-xs text-[#999999]">No saved events yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
