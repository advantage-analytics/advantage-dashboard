"use client";

import { Calendar, Swords, Clock, BadgeCheck } from "lucide-react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export function MatchResultWidget() {
  const { match, insights } = useMatchData();
  const prefersReduced = useReducedMotion();

  const aiSummary =
    insights?.player1?.strengths?.[0]?.description ??
    insights?.player2?.strengths?.[0]?.description ??
    null;

  const metadataItems = [
    match.date && {
      icon: <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      label: match.date,
      title: "Match date",
    },
    match.matchType && {
      icon: <Swords className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      label: match.matchType,
      title: "Match format",
    },
    match.courtType && {
      icon: (
        <Image
          src="/icons/tennis-court-icon.svg"
          alt=""
          width={14}
          height={14}
          className="shrink-0"
        />
      ),
      label: match.courtType,
      title: "Court surface",
    },
    match.verificationStatus && {
      icon: (
        <BadgeCheck
          className="h-3.5 w-3.5 shrink-0 text-[#3B82F6]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ),
      label: match.verificationStatus,
      title: "Result verified via SwingVision match data",
    },
    match.duration && {
      icon: <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      label: match.duration,
      title: "Match duration",
    },
  ].filter(Boolean) as Array<{
    icon: React.ReactNode;
    label: string;
    title: string;
  }>;

  return (
    <div
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-[25px]"
      role="group"
      aria-label={`Match score: ${match.score.finalScore}, ${match.won ? "Won" : "Lost"}`}
    >
      {/* Score section */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Match Result
        </p>

        {/* Score + badge */}
        <div className="flex items-center gap-3">
          <motion.span
            className="text-[40px] font-light text-[#0D0D0D] tracking-[-0.5px] tabular-nums leading-[48px]"
            initial={prefersReduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1, ease: EASE_CURVE }}
          >
            {match.score.finalScore}
          </motion.span>
          <motion.span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium leading-[15px] ${
              match.won
                ? "bg-[rgba(115,230,104,0.15)] text-[#5DB955]"
                : "bg-[rgba(229,24,55,0.15)] text-[#E51837]"
            }`}
            initial={prefersReduced ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              match.won
                ? { duration: 0.4, delay: 0.3, ease: EASE_CURVE }
                : { duration: 0.3, delay: 0.3 }
            }
          >
            {match.won ? "Won" : "Lost"}
          </motion.span>
        </div>

        {/* Set scores as pills */}
        {match.score.sets.length > 0 && (
          <div className="flex items-center gap-1.5">
            {match.score.sets.map((set, i) => (
              <span
                key={i}
                className="rounded-[6px] bg-[#F5F5F5] px-2 py-0.5 text-[12px] font-medium tabular-nums text-[#525252]"
              >
                {set.player1}-{set.player2}
                {set.tiebreak && (
                  <span className="text-[9px] text-[#AAAAAA] ml-0.5">TB</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Opponent */}
        <p className="text-[16px] font-normal text-[#0D0D0D] tracking-[-0.4px]">
          vs {match.player2.name}
        </p>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-3">
          {metadataItems.map((item, i) => (
            <span key={i} className="flex items-center gap-1 text-[11px] text-[#888888] leading-[16px]" title={item.title}>
              {i > 0 && (
                <span className="w-px h-3 bg-[#E5E5EA] -ml-1.5 mr-0" aria-hidden="true" />
              )}
              {item.icon}
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* AI Analysis — separated below */}
      {aiSummary && (
        <div className="border-t border-[#F3F3F3] pt-4 mt-4">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-2">
            AI Analysis
          </p>
          <p className="text-[13px] font-normal text-[#71717A] leading-[1.65]">
            {aiSummary}
          </p>
        </div>
      )}
    </div>
  );
}
