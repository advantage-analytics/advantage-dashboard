"use client";

/**
 * StepIndicator - Visual progress dots for the wizard
 * Shows current step with blue dot, others in gray
 */

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex justify-center gap-1">
      {Array.from({ length: totalSteps }, (_, index) => (
        <div
          key={index}
          className={`h-1 rounded-full transition-all ${
            index === currentStep
              ? "w-10 bg-[#7BABED]"
              : index < currentStep
              ? "w-3 bg-[#7BABED]"
              : "w-3 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}
