"use client";

/**
 * StepIndicator - Visual progress bars for the wizard
 * Shows current step with wider active bar, completed/future steps as small bars
 */

import { motion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex justify-center gap-1">
      {Array.from({ length: totalSteps }, (_, index) => (
        <motion.div
          key={index}
          layout
          transition={{ duration: 0.3, ease: EASE_CURVE }}
          className={`h-1 rounded-full ${
            index === currentStep
              ? "w-8 bg-[#3B82F6]"
              : index < currentStep
              ? "w-3 bg-[#3B82F6]"
              : "w-3 bg-[#E5E5EA]"
          }`}
        />
      ))}
    </div>
  );
}
