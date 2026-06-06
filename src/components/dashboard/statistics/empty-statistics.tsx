"use client";

import { useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { HelpCircle, Percent, RotateCcw, Swords, TrendingUp } from "lucide-react";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

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
];

export function EmptyStatistics() {
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

  return (
    <div className="flex flex-col items-center text-center pt-10 pb-16 px-6 max-w-[600px] mx-auto">
      {/* Heading */}
      <motion.h2
        className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-[34px] mb-3"
        {...anim(T.HEADING)}
      >
        Your statistics build with every match
      </motion.h2>

      {/* Description */}
      <motion.p
        className="text-[13px] font-normal text-[#888888] leading-[1.6] max-w-[380px]"
        {...anim(T.DESCRIPTION)}
      >
        Upload a match from SwingVision to see serve percentages,
        break point conversion, and 20+ stats tracked over time.
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

      {/* Feature preview — cascading entrance */}
      <div className="w-full">
        <motion.p
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-3 text-left"
          {...anim(T.FEATURES_LABEL)}
        >
          What you&apos;ll unlock
        </motion.p>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              {...anim(T.FEATURES_START + i * T.FEATURES_STAGGER)}
              className="flex-1 flex flex-col gap-2.5 text-left pt-3.5 border-t-2"
              style={{
                borderColor: `rgba(59, 130, 246, ${1 - i * 0.15})`,
              }}
            >
              <div className="flex items-center gap-2">
                <feature.icon
                  className="size-3.5 text-[#525252]"
                  strokeWidth={1.5}
                  aria-hidden
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
