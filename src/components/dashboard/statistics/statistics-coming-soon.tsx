"use client";

import { useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const T = {
  HEADING: 0.1,
  DESCRIPTION: 0.2,
  CTA: 0.35,
  HELP: 0.45,
} as const;

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
    <div className="flex flex-col items-center text-center pt-16 pb-20 px-6 max-w-[440px] mx-auto">
      {/* Heading */}
      <motion.h2
        className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-[34px] mb-3"
        {...anim(T.HEADING)}
      >
        Aggregate trends are on the way
      </motion.h2>

      {/* Description */}
      <motion.p
        className="text-[13px] font-normal text-[#888888] leading-[1.6] max-w-[400px]"
        {...anim(T.DESCRIPTION)}
      >
        Serve, return, rally, and trend breakdowns will roll up across every
        match you log, right here. Per-match analysis is ready now, with
        nothing to re-upload.
      </motion.p>

      {/* CTA + help link */}
      <div className="mt-9 flex flex-col items-center gap-4">
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
    </div>
  );
}
