"use client";

/**
 * StepIndicator - Visual progress segments for the wizard
 * Active segment expands; completed and inactive segments stay compact.
 */

import { motion } from "framer-motion";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const ACCENT = "#3B82F6";
const INACTIVE = "#EAECF0";

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex justify-center gap-1.5">
      {Array.from({ length: totalSteps }, (_, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        return (
          <motion.div
            key={index}
            className="h-[3px] rounded-full"
            initial={false}
            animate={{
              width: isActive ? 32 : 8,
              backgroundColor: isActive || isCompleted ? ACCENT : INACTIVE,
            }}
            transition={{ duration: 0.25, ease: EASE }}
          />
        );
      })}
    </div>
  );
}
