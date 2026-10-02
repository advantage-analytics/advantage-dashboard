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
    window.dispatchEvent(
      new CustomEvent("advantage-ai-insight-toggle", {
        detail: { storageKey, dismissed: true },
      }),
    );
  }, [storageKey]);

  const restore = useCallback(() => {
    setVisible(true);
    localStorage.removeItem(storageKey);
    window.dispatchEvent(
      new CustomEvent("advantage-ai-insight-toggle", {
        detail: { storageKey, dismissed: false },
      }),
    );
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
              <div className="flex h-14 items-center px-5">
                <h2
                  id="ai-insight-heading"
                  className="text-[10px] leading-[15px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase"
                >
                  AI Insight
                </h2>
              </div>

              <div className="flex flex-col gap-4 px-5 pb-5">
                {children}

                <div className="flex items-center gap-4">
                  {extraActions}
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-sm text-[9px] font-medium tracking-[1.5px] text-[#AAAAAA] uppercase transition-colors duration-200 hover:text-[#525252] focus-visible:outline-none active:scale-[0.97]"
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
          className="flex items-center gap-1.5 self-start rounded-sm px-3 py-2 text-[9px] font-medium tracking-[1.5px] text-[#3B82F6] uppercase transition-colors duration-200 hover:text-[#2563EB] focus-visible:outline-none"
        >
          <MessageSquare className="size-3" aria-hidden />
          Show AI Insight
        </motion.button>
      )}
    </>
  );
}
