"use client";

import { useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const T = {
  HEADING: 0.1,
  DESCRIPTION: 0.2,
  CTA: 0.35,
  HELP: 0.45,
  GHOST_LABEL: 0.55,
  GHOST_START: 0.6,
  GHOST_STAGGER: 0.07,
} as const;

const GHOST_ROWS = [
  { event: "w-32", score: "w-16", opponent: "w-24", badge: "Won" as const },
  { event: "w-28", score: "w-20", opponent: "w-20", badge: "Loss" as const },
  { event: "w-36", score: "w-16", opponent: "w-28", badge: "Won" as const },
];

export function EmptyMatches() {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skip = shouldReduceMotion || hasAnimated.current;

  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  function anim(delay: number) {
    if (skip) return { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.35, ease: EASE_CURVE, delay },
    };
  }

  function ghostAnim(delay: number) {
    if (skip) return { initial: false as const, animate: { opacity: 0.35 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 0.35 },
      transition: { duration: 0.4, ease: EASE_CURVE, delay },
    };
  }

  return (
    <div className="flex flex-col items-center text-center pt-10 pb-16 px-6 max-w-[600px] mx-auto">
      {/* Heading */}
      <motion.h2
        className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-[34px] mb-3"
        {...anim(T.HEADING)}
      >
        Your match history starts here
      </motion.h2>

      {/* Description */}
      <motion.p
        className="text-[13px] font-normal text-[#888888] leading-[1.6] max-w-[380px]"
        {...anim(T.DESCRIPTION)}
      >
        Upload a match from SwingVision to build your performance
        record — scores, stats, and trends over time.
      </motion.p>

      {/* CTA + help link */}
      <div className="mt-10 mb-14 flex flex-col items-center gap-4">
        <motion.div {...anim(T.CTA)}>
          <CreateMatchButton variant="blue" />
        </motion.div>
        <motion.div {...anim(T.HELP)}>
          <Link
            href="/dashboard/help"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#888888] uppercase tracking-[1.5px] transition-colors duration-200 hover:text-[#525252]"
          >
            <HelpCircle className="w-3 h-3" strokeWidth={1.5} aria-hidden />
            How to export from SwingVision
          </Link>
        </motion.div>
      </div>

      {/* Ghost preview — dimmed match list */}
      <div className="w-full select-none pointer-events-none" aria-hidden>
        <motion.p
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-3 text-left"
          {...anim(T.GHOST_LABEL)}
        >
          What you&apos;ll unlock
        </motion.p>

        {/* Ghost header row */}
        <motion.div
          {...ghostAnim(T.GHOST_START)}
          className="grid grid-cols-[1.8fr_55px_1fr_1.4fr_1fr] items-center gap-4 px-4 h-9 border-b border-[#F0F0F0]"
        >
          <div className="h-2 w-10 rounded-full bg-[#F0F0F0]" />
          <div className="h-2 w-8 rounded-full bg-[#F0F0F0]" />
          <div className="h-2 w-8 rounded-full bg-[#F0F0F0]" />
          <div className="h-2 w-12 rounded-full bg-[#F0F0F0]" />
          <div className="h-2 w-6 rounded-full bg-[#F0F0F0]" />
        </motion.div>

        {/* Ghost match rows */}
        {GHOST_ROWS.map((row, i) => (
          <motion.div
            key={i}
            {...ghostAnim(T.GHOST_START + (i + 1) * T.GHOST_STAGGER)}
            className="grid grid-cols-[1.8fr_55px_1fr_1.4fr_1fr] items-center gap-4 px-4 h-11 border-b border-[#F8F8F8]"
          >
            {/* Event */}
            <div className={`h-2.5 ${row.event} rounded-full bg-[#EAEAEA]`} />

            {/* Result badge */}
            <div className="flex items-center">
              <span
                className={`inline-block h-5 w-[42px] rounded-full ${
                  row.badge === "Won" ? "bg-[#E8F5E7]" : "bg-[#FCEAED]"
                }`}
              />
            </div>

            {/* Score */}
            <div className={`h-2.5 ${row.score} rounded-full bg-[#F0F0F0]`} />

            {/* Opponent */}
            <div className={`h-2.5 ${row.opponent} rounded-full bg-[#EAEAEA]`} />

            {/* Date */}
            <div className="h-2.5 w-16 rounded-full bg-[#F0F0F0]" />
          </motion.div>
        ))}

        {/* Fade-out bottom edge */}
        <div className="h-8 bg-gradient-to-b from-transparent to-white" />
      </div>
    </div>
  );
}
