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
    <div className="flex justify-center gap-2 mb-4">
      {Array.from({ length: totalSteps }, (_, index) => (
        <div
          key={index}
          className={`w-2 h-2 rounded-full transition-colors ${
            index === currentStep
              ? "bg-blue-500"
              : index < currentStep
              ? "bg-gray-400"
              : "bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}
