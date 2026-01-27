"use client";

import * as React from "react";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indeterminate = false, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        className={`relative h-2 w-full overflow-hidden rounded-full bg-gray-200 ${className || ""}`}
        {...props}
      >
        <div
          className="h-full rounded-full bg-[#4A90E2] transition-all duration-300"
          style={
            indeterminate
              ? {
                  width: "100%",
                  background: "linear-gradient(90deg, #4A90E2 0%, #6BA3E8 50%, #4A90E2 100%)",
                  backgroundSize: "200% 100%",
                  animation: "progress-shimmer 1.5s linear infinite",
                }
              : { width: `${percentage}%` }
          }
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
