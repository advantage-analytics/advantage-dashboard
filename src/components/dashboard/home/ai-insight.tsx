"use client";

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, MessageSquare } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const DISMISS_KEY = "advantage-ai-insight-dismissed";

export default function AIInsight() {
  const [visible, setVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    setVisible(dismissed !== "true");
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "true");
  }, []);

  const restore = useCallback(() => {
    setVisible(true);
    localStorage.removeItem(DISMISS_KEY);
  }, []);

  return (
    <>
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
            className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden flex flex-col gap-4"
          >
            <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
              AI Insight
            </p>

            <div className="flex items-center gap-3 py-2">
              <div className="rounded-full bg-[#F5F5F5] p-2.5 shrink-0">
                <Lightbulb className="size-4 text-[#AAAAAA]" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-[12px] font-normal text-[#888888] leading-[1.6]">
                AI-powered match insights are coming soon. Once connected, you&apos;ll get
                actionable analysis of your recent performance here.
              </p>
            </div>

            <button
              type="button"
              onClick={dismiss}
              className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA] transition-colors duration-200 hover:text-[#525252] active:scale-[0.97] self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!visible && (
        <button
          type="button"
          onClick={restore}
          className="flex items-center gap-1.5 self-start px-3 py-2 text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA] transition-colors duration-200 hover:text-[#525252] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
        >
          <MessageSquare className="size-3" aria-hidden />
          Show AI Insight
        </button>
      )}
    </>
  );
}
