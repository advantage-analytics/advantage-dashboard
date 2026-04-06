"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { PerformanceTracker } from "@/components/dashboard/matches/performance-tracker";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

export default function OverallPage(): React.JSX.Element {
  const { statsResult, points } = useMatchData();
  const prefersReducedMotion = useReducedMotion();

  const animate = { opacity: 1, y: 0 };
  const initial = prefersReducedMotion ? animate : { opacity: 0, y: 12 };

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={initial}
        animate={animate}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_CURVE }}
      >
        <PerformanceTracker
          points={points}
          player1Name={statsResult?.player1Name ?? "Player 1"}
          player2Name={statsResult?.player2Name ?? "Player 2"}
        />
      </motion.div>
      <motion.div
        initial={initial}
        animate={animate}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_CURVE, delay: 0.07 }}
      >
        <MatchStatistics
          statistics={statsResult?.statistics ?? null}
          player1Name={statsResult?.player1Name ?? "Player 1"}
          player2Name={statsResult?.player2Name ?? "Player 2"}
        />
      </motion.div>
    </div>
  );
}
