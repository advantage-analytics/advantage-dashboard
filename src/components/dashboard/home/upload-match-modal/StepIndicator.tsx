"use client";

import { motion } from "framer-motion";

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
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={`h-1 rounded-full ${
            index === currentStep
              ? "w-10 bg-[#3B82F6]"
              : index < currentStep
              ? "w-3 bg-[#3B82F6]"
              : "w-3 bg-[#F3F3F3]"
          }`}
        />
      ))}
    </div>
  );
}
