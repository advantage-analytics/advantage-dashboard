"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { PLAYER_1, PLAYER_2 } from "@/lib/design/player-colors";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type MomentType = "match-point" | "set-point" | "break-point" | "ace";

interface DerivedMoment {
  id: string;
  type: MomentType;
  player: "player1" | "player2";
  title: string;
  description: string;
  setNumber: number;
  gameScore: string;
  videoTime: number | null;
  winnerName: string;
  serverName: string;
}

const TYPE_PRIORITY: Record<MomentType, number> = {
  "match-point": 0,
  "set-point": 1,
  "break-point": 2,
  ace: 3,
};

function classify(pt: MatchPoint): MomentType | null {
  if (pt.isMatchPoint) return "match-point";
  if (pt.isSetPoint) return "set-point";
  if (pt.isBreakPoint) return "break-point";
  if (pt.resultType?.toLowerCase().includes("ace")) return "ace";
  return null;
}

function titleFor(type: MomentType): string {
  switch (type) {
    case "match-point":
      return "Match Point";
    case "set-point":
      return "Set Point";
    case "break-point":
      return "Break Point";
    case "ace":
      return "Ace";
  }
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

const MAX_MOMENTS = 6;

interface KeyMomentsCardProps {
  points: MatchPoint[];
  narrativeMoments?: Array<{ moment: string; description: string }>;
  p1Name: string;
  p2Name: string;
}

export function KeyMomentsCard({
  points,
  narrativeMoments,
  p1Name,
  p2Name,
}: KeyMomentsCardProps) {
  const prefersReduced = useReducedMotion();
  const headingId = "key-moments-heading";

  const { moments, totalCount } = useMemo<{
    moments: DerivedMoment[];
    totalCount: number;
  }>(() => {
    const all: Array<DerivedMoment & { pointNumber: number }> = [];

    for (const pt of points) {
      const type = classify(pt);
      if (!type) continue;
      all.push({
        id: pt.id,
        type,
        player: pt.wonByPlayer1 ? "player1" : "player2",
        title: titleFor(type),
        description: descriptionFor(pt, type),
        setNumber: pt.setNumber,
        gameScore: pt.gameScore,
        videoTime: pt.videoTime,
        winnerName: pt.wonByPlayer1 ? p1Name : p2Name,
        serverName: pt.serverIsPlayer1 ? p1Name : p2Name,
        pointNumber: pt.pointNumber,
      });
    }

    all.sort((a, b) => {
      const byType = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
      if (byType !== 0) return byType;
      return b.pointNumber - a.pointNumber;
    });

    const top = all.slice(0, MAX_MOMENTS);

    const enriched =
      narrativeMoments && narrativeMoments.length > 0
        ? top.map((m, i) => {
            const prose = narrativeMoments[i];
            return prose?.description
              ? { ...m, description: prose.description }
              : m;
          })
        : top;

    return { moments: enriched, totalCount: all.length };
  }, [points, narrativeMoments, p1Name, p2Name]);

  const hasOverflow = totalCount > moments.length;

  return (
    <section
      id="match-key-moments"
      aria-labelledby={headingId}
      className="surface-card scroll-mt-6 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between h-14 px-5">
        <h2
          id={headingId}
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]"
        >
          Key Moments
        </h2>
        {hasOverflow && (
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] tabular-nums">
            Top {moments.length} of {totalCount}
          </span>
        )}
      </div>

      {moments.length === 0 ? (
        <div className="flex flex-col gap-1.5 px-5 pb-5">
          <p className="text-[12px] font-normal text-[#888888] leading-[1.6]">
            Key moments appear once your match finishes analyzing. If this match
            already processed, the source data may be missing pressure-point
            metadata.
          </p>
          <Link
            href="/dashboard/help"
            className="self-start text-[10px] font-medium uppercase tracking-[2.5px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
          >
            Why is this empty?
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4 pb-5">
          {moments.map((m, i) => {
            const winnerColor = m.player === "player1" ? PLAYER_1 : PLAYER_2;
            return (
              <motion.li
                key={m.id}
                className="flex gap-3 items-stretch px-5"
                initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.08 + i * 0.04,
                  ease: EASE_CURVE,
                }}
              >
                <span
                  aria-hidden="true"
                  className="w-px rounded-full shrink-0"
                  style={{ backgroundColor: winnerColor }}
                />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#0D0D0D]">
                      {m.title}
                    </span>
                    <span className="text-[9px] font-normal uppercase tracking-[2.5px] text-[#AAAAAA] tabular-nums shrink-0">
                      Set {m.setNumber} · {m.gameScore}
                    </span>
                  </div>

                  <p className="text-[12px] font-normal text-[#71717A] leading-[18px]">
                    {m.description}
                  </p>

                  <p className="text-[11px] font-normal text-[#AAAAAA] leading-[16px]">
                    Won by{" "}
                    <span className="font-medium text-[#525252]">
                      {m.winnerName}
                    </span>
                    {" · "}Served by {m.serverName}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
