"use client";

import { useMemo } from "react";
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

const MAX_MOMENTS = 4;

interface KeyMomentsCardProps {
  points: MatchPoint[];
  narrativeMoments?: Array<{ moment: string; description: string }>;
}

export function KeyMomentsCard({
  points,
  narrativeMoments,
}: KeyMomentsCardProps) {
  const prefersReduced = useReducedMotion();
  const headingId = "key-moments-heading";

  const moments = useMemo<DerivedMoment[]>(() => {
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
        pointNumber: pt.pointNumber,
      });
    }

    all.sort((a, b) => {
      const byType = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
      if (byType !== 0) return byType;
      return b.pointNumber - a.pointNumber;
    });

    const top = all.slice(0, MAX_MOMENTS);

    if (narrativeMoments && narrativeMoments.length > 0) {
      return top.map((m, i) => {
        const prose = narrativeMoments[i];
        return prose?.description
          ? { ...m, description: prose.description }
          : m;
      });
    }

    return top;
  }, [points, narrativeMoments]);

  return (
    <section
      id="match-key-moments"
      aria-labelledby={headingId}
      className="surface-card scroll-mt-6 flex flex-col overflow-hidden"
    >
      <div className="flex items-center h-14 px-5">
        <h2
          id={headingId}
          className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
        >
          Key Moments
        </h2>
      </div>

      {moments.length === 0 ? (
        <p className="text-[11px] font-normal text-[var(--color-text-muted)] leading-[1.6] px-5 pb-5">
          Key moments appear after your match is analyzed.
        </p>
      ) : (
        <ul className="flex flex-col gap-4 pb-5">
          {moments.map((m, i) => {
            const color = m.player === "player1" ? PLAYER_1 : PLAYER_2;
            return (
              <motion.li
                key={m.id}
                className="flex gap-3 items-stretch px-5"
                initial={prefersReduced ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.08 + i * 0.04,
                  ease: EASE_CURVE,
                }}
              >
                <span
                  aria-hidden="true"
                  className="w-px rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex flex-col min-w-0 py-px">
                  <p className="text-[12px] font-medium text-[var(--color-text-primary)] leading-[18px]">
                    {m.title}
                  </p>
                  <p className="text-[11px] font-normal text-[var(--color-text-body)] leading-[18px] mt-0.5">
                    {m.description}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-[1.5px] leading-[15px] text-[var(--color-text-dim)] tabular-nums mt-2">
                    Set {m.setNumber} · {m.gameScore}
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
