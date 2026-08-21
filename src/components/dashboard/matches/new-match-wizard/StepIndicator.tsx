"use client";

/**
 * StepIndicator — segmented progress bars only.
 *
 * One segment per step, spanning the full width of the content pane directly
 * under the app header. The active step's name is carried by the page title
 * below, so this measures the flow and says nothing else.
 */

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex gap-[3px]" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <div
          key={index}
          className={`h-[2px] flex-1 transition-colors duration-200 ${
            index <= currentStep ? "bg-[#3B82F6]" : "bg-[#F3F3F3]"
          }`}
        />
      ))}
    </div>
  );
}
