"use client";

import { useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { HelpCircle, Percent, RotateCcw, Swords, TrendingUp } from "lucide-react";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const T = {
  HEADING: 0.1,
  DESCRIPTION: 0.2,
  CTA: 0.35,
  HELP: 0.45,
  FEATURES_LABEL: 0.55,
  FEATURES_START: 0.6,
  FEATURES_STAGGER: 0.07,
} as const;

const FEATURES = [
  {
    icon: Percent,
    title: "Serve",
    description: "First serve %, aces, double faults, and placement accuracy",
  },
  {
    icon: RotateCcw,
    title: "Return",
    description: "Return points won, break point conversion, and depth",
  },
  {
    icon: Swords,
    title: "Rally",
    description: "Short, medium, and long rally win rates under pressure",
  },
  {
    icon: TrendingUp,
    title: "Trends",
    description: "Performance ratings and win rate tracked over time",
  },
] as const;

export function StatisticsComingSoon() {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skip = shouldReduceMotion || hasAnimated.current;

  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  function anim(delay: number) {
    if (skip)
      return {
        initial: false as const,
        animate: { opacity: 1 },
        transition: { duration: 0 },
      };
    return {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.35, ease: EASE_CURVE, delay },
    };
  }

  return (
    <div className="flex flex-col items-center text-center pt-10 pb-16 px-6 max-w-[600px] mx-auto">
      {/* Heading */}
      <motion.h2
        className="text-[26px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-[32px] mb-3"
        {...anim(T.HEADING)}
      >
        Aggregate trends are being rebuilt
      </motion.h2>

      {/* Description */}
      <motion.p
        className="text-[13px] font-normal text-[#888888] leading-[1.6] max-w-[380px]"
        {...anim(T.DESCRIPTION)}
      >
        Per-match analysis is available today. When aggregate stats return, your
        existing matches roll up here automatically, with no re-upload needed.
      </motion.p>

      {/* CTA + help link */}
      <div className="mt-10 mb-14 flex flex-col items-center gap-4">
        <motion.div {...anim(T.CTA)}>
          <Link
            href="/dashboard/matches"
            className="inline-flex items-center justify-center rounded-[6px] h-9 px-4 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[13px] font-medium transition-colors duration-200 shadow-[0_1px_3px_rgba(57,134,243,0.25)] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
          >
            View your matches
          </Link>
        </motion.div>
        <motion.div {...anim(T.HELP)}>
          <Link
            href="/dashboard/help"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#888888] uppercase tracking-[1.5px] transition-colors duration-200 hover:text-[#525252] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
          >
            <HelpCircle className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
            Visit the help center
          </Link>
        </motion.div>
      </div>

      {/* What's landing here — cascading entrance */}
      <div className="w-full">
        <motion.p
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-3 text-left"
          {...anim(T.FEATURES_LABEL)}
        >
          What&apos;s landing here
        </motion.p>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              {...anim(T.FEATURES_START + i * T.FEATURES_STAGGER)}
              className="flex-1 flex flex-col gap-2.5 text-left pt-3.5 border-t-2 border-[#3B82F6]"
            >
              <div className="flex items-center gap-2">
                <feature.icon
                  className="size-3.5 text-[#525252]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <p className="text-[11px] font-semibold text-[#0D0D0D] uppercase tracking-[1.5px]">
                  {feature.title}
                </p>
              </div>
              <p className="text-[11px] font-normal text-[#888888] leading-[1.6]">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
