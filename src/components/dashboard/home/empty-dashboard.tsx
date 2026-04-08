"use client";

import { BarChart3, Target, Brain, HelpCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const FEATURES = [
  {
    icon: BarChart3,
    title: "Statistics",
    description: "Track every metric that shapes your game, match by match",
  },
  {
    icon: Target,
    title: "Serve Placement",
    description: "See exactly where your serves land on the court",
  },
  {
    icon: Brain,
    title: "AI Analysis",
    description: "Surface patterns you can't spot from the baseline",
  },
];

const HEADING_WORDS = ["See", "where", "your", "game", "stands"];

// ── Timeline constants (seconds) ────────────────────────────
const T = {
  HEADING_START: 0.15,
  HEADING_STAGGER: 0.09,
  DESCRIPTION: 0.7,
  CTA: 0.9,
  HELP_LINK: 1.05,
  FEATURES_LABEL: 1.1,
  FEATURES_START: 1.2,
  FEATURES_STAGGER: 0.07,
} as const;

export default function EmptyDashboard() {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  // On the server and during hydration, skip is always false so both
  // render the same initial animation styles. After hydration, the
  // effect marks the animation as played so subsequent renders skip it.
  const skip = shouldReduceMotion || hasAnimated.current;

  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  return (
    <div className="flex flex-col items-center text-center pt-10 pb-16 px-6 max-w-[600px] mx-auto">
      {/* Hero heading — word-by-word reveal */}
      <h2 className="text-[30px] font-light text-[#0D0D0D] tracking-[-0.6px] leading-[36px] mb-3">
        {HEADING_WORDS.map((word, i) => (
          <motion.span
            key={word}
            className="inline-block"
            initial={skip ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              ease: EASE_CURVE,
              delay: T.HEADING_START + i * T.HEADING_STAGGER,
            }}
          >
            {word}
            {i < HEADING_WORDS.length - 1 && "\u00A0"}
          </motion.span>
        ))}
      </h2>

      {/* Description */}
      <motion.p
        className="text-[13px] font-normal text-[#888888] leading-[1.6] max-w-[380px]"
        initial={skip ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_CURVE, delay: T.DESCRIPTION }}
      >
        Upload a match from SwingVision (iOS match recorder)
        and get a full breakdown of your performance — every serve, every rally.
      </motion.p>

      {/* CTA + secondary link */}
      <div className="mt-10 mb-14 flex flex-col items-center gap-4">
        <motion.div
          initial={skip ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_CURVE, delay: T.CTA }}
        >
          <CreateMatchButton variant="blue" />
        </motion.div>
        <motion.div
          initial={skip ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE_CURVE, delay: T.HELP_LINK }}
        >
          <Link
            href="/dashboard/help"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#888888] uppercase tracking-[1.5px] transition-colors duration-200 hover:text-[#525252] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
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
          initial={skip ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.3,
            ease: EASE_CURVE,
            delay: T.FEATURES_LABEL,
          }}
        >
          What you&apos;ll unlock
        </motion.p>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={skip ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                ease: EASE_CURVE,
                delay: T.FEATURES_START + i * T.FEATURES_STAGGER,
              }}
              className="flex-1 flex flex-col gap-2.5 text-left pt-3.5 border-t-2 border-[#3B82F6]"
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
