"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MissingField {
  id: string;
  label: string;
}

interface ProfileWelcomeBannerProps {
  completedCount: number;
  totalCount: number;
  missingFields?: MissingField[];
  onDismiss: () => void;
}

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const EXIT_DURATION_MS = 250;

export function ProfileWelcomeBanner({
  completedCount,
  totalCount,
  missingFields = [],
  onDismiss,
}: ProfileWelcomeBannerProps): React.ReactElement {
  const shouldReduceMotion = useReducedMotion();
  const percentage = Math.round((completedCount / totalCount) * 100);
  const [isExiting, setIsExiting] = useState(false);
  const headingId = useId();

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, EXIT_DURATION_MS);
  };

  const firstMissing = missingFields[0];
  const handleJump = () => {
    if (!firstMissing) return;
    const el = document.getElementById(firstMissing.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Wait for scroll to land before focusing so the page doesn't jump again.
    setTimeout(() => el.focus({ preventScroll: true }), 320);
  };

  return (
    <AnimatePresence mode="wait">
      {!isExiting && (
        <motion.div
          role="region"
          aria-labelledby={headingId}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_DURATION_MS / 1000, ease: EASE_CURVE }}
          className="rounded-[14px] border border-[var(--color-blue-tint-12)] bg-[var(--color-blue-tint-08)] p-5"
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-blue)]">
                <span
                  aria-hidden="true"
                  className="size-1 rounded-full bg-[var(--color-blue)]"
                />
                Get started
              </p>
              <h3
                id={headingId}
                className="text-[14px] font-medium text-[var(--color-blue-ink-deep)] mt-2"
              >
                Complete your profile
              </h3>
              <p className="text-[12px] text-[var(--color-blue-ink-mid)] mt-1 leading-[1.5]">
                {totalCount} fields. Tuned for you.
              </p>

              {/* Jump-link — converts the banner from informational to actionable.
                  Anchors the user to the first missing field instead of leaving
                  them to scroll. */}
              {firstMissing && (
                <button
                  type="button"
                  onClick={handleJump}
                  className={cn(
                    "inline-flex items-center gap-1.5 mt-3 text-[11px] font-medium uppercase tracking-[1.5px]",
                    "text-[var(--color-blue)] hover:text-[var(--color-blue-hover)] transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/40 focus-visible:rounded-sm"
                  )}
                >
                  Start with {firstMissing.label}
                  <ArrowRight
                    className="size-3"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 text-[11px] font-medium text-[var(--color-blue-ink-mid)] uppercase tracking-[1.5px] hover:text-[var(--color-blue-hover)] transition-colors duration-200 whitespace-nowrap"
            >
              Skip for now
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="h-1.5 w-full bg-[var(--color-blue-tint-12)] rounded-full overflow-hidden">
              <motion.div
                className="h-full w-full rounded-full bg-[var(--color-blue)] origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: percentage / 100 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.6,
                  ease: EASE_CURVE,
                  delay: shouldReduceMotion ? 0 : 0.3,
                }}
              />
            </div>
            <p className="text-[10px] mt-2 tracking-[0.3px] text-[var(--color-blue-ink-mid)]">
              {completedCount} of {totalCount} fields complete
              {missingFields.length > 0 && (
                <span className="text-[var(--color-blue-ink-mid)]/70">
                  {" · missing: "}
                  {missingFields.map((f) => f.label).join(", ")}
                </span>
              )}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
