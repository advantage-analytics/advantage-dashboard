"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface AiInsightCardProps {
  storageKey: string;
  children: ReactNode;
  extraActions?: ReactNode;
  className?: string;
}

export function AiInsightCard({
  storageKey,
  children,
  extraActions,
  className,
}: AiInsightCardProps) {
  const [visible, setVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setVisible(localStorage.getItem(storageKey) !== "true");
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, "true");
  }, [storageKey]);

  const restore = useCallback(() => {
    setVisible(true);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const cardShell =
    className ??
    "bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden flex flex-col";

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="ai-insight"
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
            className={cardShell}
          >
            <section
              aria-labelledby="ai-insight-heading"
              className="flex flex-col"
            >
              <div className="flex items-center h-14 px-5">
                <h2
                  id="ai-insight-heading"
                  className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] leading-[15px]"
                >
                  AI Insight
                </h2>
              </div>

              <div className="px-5 pb-5 flex flex-col gap-4">
                {children}

                <div className="flex items-center gap-4">
                  {extraActions}
                  <button
                    type="button"
                    onClick={dismiss}
                    className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA] transition-colors duration-200 hover:text-[#525252] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {!visible && (
        <motion.button
          type="button"
          onClick={restore}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: 0.2, delay: 0.1, ease: EASE_CURVE },
          }}
          className="flex items-center gap-1.5 self-start px-3 py-2 text-[9px] font-medium uppercase tracking-[1.5px] text-[#3B82F6] transition-colors duration-200 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm"
        >
          <MessageSquare className="size-3" aria-hidden />
          Show AI Insight
        </motion.button>
      )}
    </>
  );
}
