"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const FADE_INITIAL = { opacity: 0, y: 8 };
const FADE_ANIMATE = { opacity: 1, y: 0 };

interface StatSnapshotCardProps {
  label: string;
  value: number;
  opponentValue: number;
  averageValue: number | null;
  isPercentage: boolean;
  fraction?: { made: number; attempts: number };
  index: number;
}

export function StatSnapshotCard({
  label,
  value,
  opponentValue,
  averageValue,
  isPercentage,
  fraction,
  index,
}: StatSnapshotCardProps) {
  const prefersReduced = useReducedMotion();
  const rounded = Math.round(value);
  const displayValue = fraction
    ? `${fraction.made}/${fraction.attempts}`
    : `${rounded}${isPercentage ? "%" : ""}`;

  const delta =
    averageValue !== null ? Math.round(value - averageValue) : null;
  const deltaSign = delta !== null && delta > 0 ? "+" : "";
  const deltaColor =
    delta === null || delta === 0
      ? "text-[#71717A]"
      : delta > 0
        ? "text-[#5DB955]"
        : "text-[#E51837]";

  return (
    <motion.div
      className="flex flex-col gap-2 bg-[#FAFAFA] rounded-lg p-4"
      initial={prefersReduced ? false : FADE_INITIAL}
      animate={FADE_ANIMATE}
      transition={{ duration: 0.3, delay: index * 0.05, ease: EASE }}
    >
      <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px]">
        {label}
      </p>
      <div className="flex items-end gap-2">
        <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] tabular-nums leading-none">
          {displayValue}
        </p>
        {delta !== null && delta !== 0 && (
          <span
            className={cn(
              "text-[11px] font-medium tabular-nums mb-1",
              deltaColor,
            )}
          >
            {deltaSign}
            {delta}
            {isPercentage ? "%" : ""}
          </span>
        )}
      </div>
      <div className="h-[3px] bg-[#EBEBEB] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[#3B82F6]"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(rounded, 100)}%` }}
          transition={{
            duration: prefersReduced ? 0 : 0.5,
            delay: index * 0.05 + 0.15,
            ease: EASE,
          }}
        />
      </div>
      <div className="flex items-center gap-3 mt-auto">
        {averageValue !== null && (
          <p className="text-[10px] text-[#71717A]">
            Avg{" "}
            <span className="font-medium text-[#71717A] tabular-nums">
              {Math.round(averageValue)}
              {isPercentage ? "%" : ""}
            </span>
          </p>
        )}
        <p className="text-[10px] text-[#71717A]">
          Opp{" "}
          <span className="font-medium text-[#71717A] tabular-nums">
            {Math.round(opponentValue)}
            {isPercentage ? "%" : ""}
          </span>
        </p>
      </div>
    </motion.div>
  );
}
