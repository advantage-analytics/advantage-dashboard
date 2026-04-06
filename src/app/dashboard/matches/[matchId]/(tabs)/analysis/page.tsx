"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AIAnalysisPanel } from "@/components/dashboard/matches/ai-analysis-panel";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

export default function AnalysisPage(): React.JSX.Element {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className="mb-16"
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_CURVE }}
    >
      <AIAnalysisPanel />
    </motion.div>
  );
}
