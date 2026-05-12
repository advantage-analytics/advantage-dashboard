"use client";

import { useMemo } from "react";
import { Play } from "lucide-react";
import type { MatchPoint } from "@/lib/data/match-points-server";

type MomentType = "match-point" | "set-point" | "break-point" | "ace";

interface DerivedMoment {
  id: string;
  type: MomentType;
  title: string;
  description: string;
  setNumber: number;
  gameScore: string;
  pointScore: string;
  videoTime: number | null;
  winnerName: string;
}

const TYPE_PRIORITY: Record<MomentType, number> = {
  "match-point": 0,
  "set-point": 1,
  "break-point": 2,
  ace: 3,
};

const TYPE_LABEL: Record<MomentType, string> = {
  "match-point": "Match Point",
  "set-point": "Set Point",
  "break-point": "Break Point",
  ace: "Ace",
};

const RAIL_COLOR: Record<MomentType, string> = {
  "match-point": "bg-[#E51837]",
  "set-point": "bg-[#3B82F6]",
  "break-point": "bg-[#3B82F6]",
  ace: "bg-[#AAAAAA]",
};

const MAX_VISIBLE = 6;

function classify(pt: MatchPoint): MomentType | null {
  if (pt.isMatchPoint) return "match-point";
  if (pt.isSetPoint) return "set-point";
  if (pt.isBreakPoint) return "break-point";
  if (pt.resultType?.toLowerCase().includes("ace")) return "ace";
  return null;
}

function descriptionFor(pt: MatchPoint, type: MomentType): string {
  if (pt.description) return pt.description;
  if (type === "ace") return "Ace served";
  if (type === "break-point") {
    const returnerWon = pt.wonByPlayer1 !== pt.serverIsPlayer1;
    return returnerWon ? "Break point converted" : "Break point saved";
  }
  return pt.resultType || "Point played";
}

function formatVideoTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildProse(m: DerivedMoment): string {
  const lcDesc = m.description.toLowerCase();
  const lcTitle = m.title.toLowerCase();
  return lcDesc.startsWith(lcTitle) ? m.description : `${m.title} — ${m.description}`;
}

function seekToVideoTime(time: number) {
  window.dispatchEvent(
    new CustomEvent("match:video-seek", { detail: { time } }),
  );
  const target = document.getElementById("match-video");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface KeyMomentsCardProps {
  points: MatchPoint[];
  narrativeMoments?: Array<{ moment: string; description: string }>;
  p1Name: string;
  p2Name: string;
  className?: string;
}

export function KeyMomentsCard({
  points,
  narrativeMoments,
  p1Name,
  p2Name,
  className,
}: KeyMomentsCardProps) {
  const headingId = "key-moments-heading";

  const moments = useMemo<DerivedMoment[]>(() => {
    const all: Array<DerivedMoment & { pointNumber: number }> = [];

    for (const pt of points) {
      const type = classify(pt);
      if (!type) continue;
      all.push({
        id: pt.id,
        type,
        title: TYPE_LABEL[type],
        description: descriptionFor(pt, type),
        setNumber: pt.setNumber,
        gameScore: pt.gameScore,
        pointScore: pt.pointScore,
        videoTime: pt.videoTime,
        winnerName: pt.wonByPlayer1 ? p1Name : p2Name,
        pointNumber: pt.pointNumber,
      });
    }

    all.sort((a, b) => {
      const byType = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
      if (byType !== 0) return byType;
      return b.pointNumber - a.pointNumber;
    });

    if (narrativeMoments && narrativeMoments.length > 0) {
      return all.map((m, i) => {
        const prose = narrativeMoments[i];
        return prose?.description ? { ...m, description: prose.description } : m;
      });
    }

    return all;
  }, [points, narrativeMoments, p1Name, p2Name]);

  const visible = moments.slice(0, MAX_VISIBLE);

  return (
    <section
      id="match-key-moments"
      aria-labelledby={headingId}
      className={`bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden scroll-mt-6${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-center h-14 px-5">
        <h2
          id={headingId}
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]"
        >
          KEY MOMENTS
        </h2>
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center justify-center py-6 px-5">
          <p className="text-[12px] text-[#888888]">No key moments yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-5">
          {visible.map((m) => {
            const prose = buildProse(m);
            const hasVideo = m.videoTime != null;

            const inner = (
              <>
                <div
                  className="flex flex-row items-center"
                  aria-hidden="true"
                >
                  <div
                    className={`w-px self-stretch rounded-full ${RAIL_COLOR[m.type]}`}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <p className="text-[12px] font-light text-[#888888] leading-[1.5]">
                    {prose}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-normal text-[#AAAAAA] tabular-nums min-w-0">
                      SET {m.setNumber} · {m.gameScore}
                      {m.pointScore ? ` · ${m.pointScore}` : ""}
                      {" · WON BY "}{m.winnerName}
                    </p>
                    {hasVideo && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#AAAAAA] tabular-nums shrink-0 transition-colors duration-200 group-hover:text-[#3B82F6]">
                        <Play
                          className="h-2.5 w-2.5"
                          strokeWidth={2}
                          fill="currentColor"
                          aria-hidden="true"
                        />
                        {formatVideoTime(m.videoTime!)}
                      </span>
                    )}
                  </div>
                </div>
              </>
            );

            if (hasVideo) {
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => seekToVideoTime(m.videoTime!)}
                  aria-label={`Jump to ${m.title} at ${formatVideoTime(m.videoTime!)}`}
                  className="group flex gap-3 items-stretch px-5 py-1.5 w-full text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                >
                  {inner}
                </button>
              );
            }

            return (
              <div
                key={m.id}
                className="flex gap-3 items-stretch px-5 py-1.5"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
