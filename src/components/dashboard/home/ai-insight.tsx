"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

export default function AIInsight() {
  const [visible, setVisible] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{
            opacity: 0,
            transform: shouldReduceMotion ? "none" : "translateY(12px)",
          }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{
            opacity: 0,
            transform: shouldReduceMotion ? "none" : "translateY(12px)",
          }}
          transition={{
            duration: shouldReduceMotion ? 0.15 : 0.3,
            ease: EASE_CURVE,
          }}
          className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 overflow-hidden flex flex-col gap-4"
        >
          <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            AI Insight
          </p>

          <p className="text-[12px] font-normal text-[#525252] leading-[1.65]">
            Your backhand depth has improved 11% over three matches. Next focus:
            second serve placement to the ad court, where you&apos;re losing 62%
            of points. Shifting 5% more serves to the T could save an extra
            break per match.
          </p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#3B82F6] transition-colors duration-200 hover:text-[#2563EB] active:scale-[0.97]"
            >
              View Analysis
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA] transition-colors duration-200 hover:text-[#525252] active:scale-[0.97]"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
