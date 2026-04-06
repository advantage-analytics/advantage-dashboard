"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { PerformanceTracker } from "@/components/dashboard/matches/performance-tracker";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

export default function OverallPage(): React.JSX.Element {
  const { statsResult, points } = useMatchData();
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="flex flex-col gap-6 mb-64"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_CURVE }}
    >
      <MatchStatistics
        statistics={statsResult?.statistics ?? null}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
      />
      <PerformanceTracker
        points={points}
        player1Name={statsResult?.player1Name ?? "Player 1"}
        player2Name={statsResult?.player2Name ?? "Player 2"}
      />
    </motion.div>
  );
}
