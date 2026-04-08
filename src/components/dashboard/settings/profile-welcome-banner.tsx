"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProfileWelcomeBannerProps {
  completedCount: number;
  totalCount: number;
  missingFieldNames?: string[];
  onDismiss: () => void;
}

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const EXIT_DURATION_MS = 250;

export function ProfileWelcomeBanner({
  completedCount,
  totalCount,
  missingFieldNames = [],
  onDismiss,
}: ProfileWelcomeBannerProps): React.ReactElement {
  const shouldReduceMotion = useReducedMotion();
  const percentage = Math.round((completedCount / totalCount) * 100);
  const isComplete = completedCount === totalCount;
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, EXIT_DURATION_MS);
  };

  return (
    <AnimatePresence mode="wait">
      {!isExiting && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_DURATION_MS / 1000, ease: EASE_CURVE }}
          className="rounded-[14px] border border-[rgba(59,130,246,0.15)] bg-[#EBF2FD] p-5"
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[14px] font-medium text-[#0D0D0D]">
                Complete your profile
              </h3>
              <p className="text-[12px] text-[#6B83A8] mt-1 leading-[1.5]">
                A complete profile helps us personalize your analytics and match
                you with the right competition.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 text-[11px] font-medium text-[#6B83A8] uppercase tracking-[1.5px] hover:text-[#3B6BA8] transition-colors duration-200 whitespace-nowrap"
            >
              Skip for now
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
              <motion.div
                className="h-full w-full rounded-full bg-[#3B82F6] origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: percentage / 100 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.6,
                  ease: EASE_CURVE,
                  delay: shouldReduceMotion ? 0 : 0.3,
                }}
              />
            </div>
            <p
              className={cn(
                "text-[10px] mt-2 tracking-[0.3px]",
                isComplete
                  ? "text-[#5DB955] font-medium"
                  : "text-[#6B83A8]"
              )}
            >
              {isComplete
                ? "Profile complete"
                : `${completedCount} of ${totalCount} fields complete`}
              {!isComplete && missingFieldNames.length > 0 && (
                <span className="text-[#6B83A8]/70">
                  {" \u2014 missing: "}
                  {missingFieldNames.join(", ")}
                </span>
              )}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
